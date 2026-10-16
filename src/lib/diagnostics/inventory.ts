import os from "node:os";
import { exists, readText, runCommand } from "./exec";
import {
  flattenLsblk,
  osReleaseName,
  parseColonTable,
  parseCpuRange,
  parseDefaultRouteInterface,
  parseDf,
  parseIntLoose,
  parseMeminfo,
  type LsblkDevice,
} from "./parse";
import { collectSensors } from "./sensors";
import type { BiosInfo, Inventory, NicInfo } from "./types";

const DMI_FILES = [
  "bios_vendor",
  "bios_version",
  "bios_date",
  "bios_release",
  "sys_vendor",
  "product_name",
  "product_version",
  "board_vendor",
  "board_name",
  "chassis_type",
] as const;

async function readDmi(): Promise<Record<string, string>> {
  const entries = await Promise.all(
    DMI_FILES.map(async (name) => {
      const raw = await readText(`/sys/class/dmi/id/${name}`);
      const value = raw?.trim() ?? "";
      if (!value || /to be filled by o\.e\.m\./i.test(value) || value === "None") {
        return [name, ""] as const;
      }
      return [name, value] as const;
    }),
  );
  return Object.fromEntries(entries);
}

function blankToNull(value: string | undefined): string | null {
  return value ? value : null;
}

export async function collectInventory(): Promise<Inventory> {
  const notes: string[] = [];
  const [hostnameOut, kernelOut, osRelease, uptimeText, cpuText, memText, lsblk, dfText, routeText, uefi, sensors] =
    await Promise.all([
      runCommand("hostname", []),
      runCommand("uname", ["-srm"]),
      readText("/etc/os-release"),
      readText("/proc/uptime"),
      runCommand("lscpu", []),
      readText("/proc/meminfo"),
      runCommand("lsblk", ["-J", "-b", "-o", "NAME,SIZE,TYPE,RO,RM,MOUNTPOINTS,FSTYPE,MODEL,TRAN"]),
      runCommand("df", ["-B1", "-P"]),
      readText("/proc/net/route"),
      exists("/sys/firmware/efi"),
      collectSensors(),
    ]);

  const cpu = parseColonTable(cpuText.stdout);
  const dmi = await readDmi();
  const dmiExposed = Object.values(dmi).some(Boolean);
  let biosSource = dmiExposed ? "/sys/class/dmi/id" : "unavailable";

  if (!dmiExposed) {
    const probe = await runCommand("sudo", ["-n", "dmidecode", "-s", "bios-vendor"]);
    if (probe.ok && probe.stdout.trim()) {
      dmi.bios_vendor = probe.stdout.trim();
      const [version, date] = await Promise.all([
        runCommand("sudo", ["-n", "dmidecode", "-s", "bios-version"]),
        runCommand("sudo", ["-n", "dmidecode", "-s", "bios-release-date"]),
      ]);
      dmi.bios_version = version.stdout.trim();
      dmi.bios_date = date.stdout.trim();
      biosSource = "dmidecode";
    } else {
      notes.push(
        "SMBIOS is not visible here. Hypervisors and containers often hide BIOS tables. On a bare-metal host, install dmidecode and allow the service account to read it.",
      );
    }
  }
  if (sensors.every((sensor) => sensor.state === "absent")) {
    notes.push(
      "BMC sensors are not visible here. Temperatures, fans, power supplies, voltage rails, and chassis intrusion appear when IPMI or hwmon is available on the server.",
    );
  }

  const bios: BiosInfo = {
    exposed: Object.values(dmi).some(Boolean),
    vendor: blankToNull(dmi.bios_vendor),
    version: blankToNull(dmi.bios_version),
    date: blankToNull(dmi.bios_date),
    release: blankToNull(dmi.bios_release),
    systemVendor: blankToNull(dmi.sys_vendor),
    productName: blankToNull(dmi.product_name),
    productVersion: blankToNull(dmi.product_version),
    boardVendor: blankToNull(dmi.board_vendor),
    boardName: blankToNull(dmi.board_name),
    chassisType: blankToNull(dmi.chassis_type),
    bootMode: uefi ? "uefi" : dmiExposed ? "legacy" : "unknown",
    source: biosSource,
  };

  const vulnerabilities = Object.entries(cpu)
    .filter(([key]) => key.startsWith("Vulnerability "))
    .map(([key, state]) => ({
      name: key.replace("Vulnerability ", ""),
      state,
    }));

  const memory = parseMeminfo(memText ?? "");
  let disks: Inventory["storage"]["disks"] = [];
  if (lsblk.ok) {
    try {
      const parsed = JSON.parse(lsblk.stdout) as { blockdevices?: LsblkDevice[] };
      disks = flattenLsblk(parsed.blockdevices)
        .filter((device) => device.type === "disk" || device.type === "rom")
        .map((device) => ({
          name: device.name ?? "unknown",
          type: device.type ?? "disk",
          sizeBytes: device.size == null ? null : Number(device.size),
          model: device.model ?? null,
          transport: device.tran ?? null,
          readOnly: device.ro === true || device.ro === "1",
          removable: device.rm === true || device.rm === "1",
          filesystem: device.fstype ?? null,
          mountpoints: (device.mountpoints ?? []).filter((point): point is string => Boolean(point)),
        }));
    } catch {
      notes.push("lsblk returned data this console could not parse.");
    }
  } else {
    notes.push("lsblk is not available, so disk inventory is incomplete.");
  }

  const filesystems = dfText.ok
    ? parseDf(dfText.stdout)
        .filter((row) => row.mount.startsWith("/") && !row.filesystem.startsWith("tmpfs") && row.filesystem !== "shm")
        .map((row) => ({
          filesystem: row.filesystem,
          mount: row.mount,
          type: null,
          sizeBytes: row.sizeBytes,
          usedBytes: row.usedBytes,
          availBytes: row.availBytes,
          usedPercent: row.usedPercent,
        }))
    : [];

  const names = await runCommand("ls", ["-1", "/sys/class/net"]);
  const interfaces: NicInfo[] = [];
  if (names.ok) {
    for (const name of names.stdout.split("\n").map((line) => line.trim()).filter(Boolean)) {
      const [state, address, speed, deviceDir] = await Promise.all([
        readText(`/sys/class/net/${name}/operstate`),
        readText(`/sys/class/net/${name}/address`),
        readText(`/sys/class/net/${name}/speed`),
        exists(`/sys/class/net/${name}/device`),
      ]);
      const speedMbps = speed ? Number(speed.trim()) : null;
      interfaces.push({
        name,
        operstate: state?.trim() || "unknown",
        address: address?.trim() || null,
        speedMbps: speedMbps != null && Number.isFinite(speedMbps) && speedMbps > 0 ? speedMbps : null,
        virtual: !deviceDir || name === "lo" || name.startsWith("docker") || name.startsWith("veth"),
      });
    }
  }

  const hypervisor = cpu["Hypervisor vendor"] || null;
  const uptimeSec = Number((uptimeText ?? "0").split(/\s+/)[0]) || 0;

  return {
    collectedAt: new Date().toISOString(),
    host: {
      hostname: hostnameOut.stdout.trim() || os.hostname(),
      os: osReleaseName(osRelease ?? ""),
      kernel: kernelOut.stdout.trim(),
      arch: cpu.Architecture || os.arch(),
      uptimeSec,
      hypervisor,
      virtualized: Boolean(hypervisor) || (cpu.Flags ?? "").includes("hypervisor"),
    },
    bios,
    cpu: {
      model: cpu["Model name"] || "Unknown processor",
      vendor: cpu["Vendor ID"] || "Unknown",
      sockets: parseIntLoose(cpu["Socket(s)"]),
      cores: parseIntLoose(cpu["Core(s) per socket"]),
      threads: parseIntLoose(cpu["CPU(s)"]),
      online: parseCpuRange(cpu["On-line CPU(s) list"]),
      mhz: cpu["CPU max MHz"] || cpu["CPU MHz"] || cpu["BogoMIPS"] || null,
      virtualization: cpu.Virtualization || null,
      vulnerabilities,
    },
    memory: {
      totalBytes: memory.totalBytes,
      availableBytes: memory.availableBytes,
      usedBytes: Math.max(0, memory.totalBytes - memory.availableBytes),
      swapTotalBytes: memory.swapTotalBytes,
      swapFreeBytes: memory.swapFreeBytes,
    },
    storage: { disks, filesystems },
    network: {
      interfaces,
      defaultRouteInterface: parseDefaultRouteInterface(routeText ?? ""),
    },
    sensors,
    notes,
  };
}
