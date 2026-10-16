import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TESTS } from "./catalog";
import { formatBytes } from "./format";
import { collectInventory } from "./inventory";
import { parseBiosDate } from "./parse";
import { sensorsIn } from "./sensors";
import type { Finding, Inventory, SensorGroup, Status, SuiteReport } from "./types";

function finding(
  partial: Omit<Finding, "durationMs" | "evidence" | "detail"> & {
    detail?: string;
    evidence?: Finding["evidence"];
    started: bigint;
  },
): Finding {
  const { started, detail, evidence, ...rest } = partial;
  return {
    ...rest,
    detail: detail ?? "",
    evidence: evidence ?? [],
    durationMs: Number(process.hrtime.bigint() - started) / 1e6,
  };
}

async function biosSmbios(inventory: Inventory): Promise<Finding> {
  const started = process.hrtime.bigint();
  const bios = inventory.bios;
  if (!bios.exposed) {
    return finding({
      started,
      id: "bios-smbios",
      section: "bios",
      title: "SMBIOS identity",
      status: "warn",
      summary: "Firmware tables are not exposed on this host.",
      detail:
        "Bench could not read a BIOS vendor or version. That is expected in many virtual machines. On bare metal, the same check reads /sys/class/dmi/id or dmidecode.",
      evidence: [{ label: "Source", value: bios.source }],
    });
  }
  return finding({
    started,
    id: "bios-smbios",
    section: "bios",
    title: "SMBIOS identity",
    status: "pass",
    summary: `${bios.vendor ?? "Vendor unknown"} ${bios.version ?? ""}`.trim(),
    detail: "Firmware identity was read from SMBIOS.",
    evidence: [
      { label: "Vendor", value: bios.vendor ?? "—" },
      { label: "Version", value: bios.version ?? "—" },
      { label: "Product", value: [bios.systemVendor, bios.productName].filter(Boolean).join(" ") || "—" },
      { label: "Board", value: [bios.boardVendor, bios.boardName].filter(Boolean).join(" ") || "—" },
      { label: "Source", value: bios.source },
    ],
  });
}

async function biosDate(inventory: Inventory): Promise<Finding> {
  const started = process.hrtime.bigint();
  if (!inventory.bios.date) {
    return finding({
      started,
      id: "bios-date",
      section: "bios",
      title: "Firmware date",
      status: inventory.bios.exposed ? "warn" : "skip",
      summary: inventory.bios.exposed
        ? "SMBIOS is present, but the BIOS date field is empty."
        : "Skipped because firmware tables are hidden.",
      detail: "A missing date usually means the image was built without a release stamp, or the field is blocked.",
    });
  }
  const date = parseBiosDate(inventory.bios.date);
  if (!date) {
    return finding({
      started,
      id: "bios-date",
      section: "bios",
      title: "Firmware date",
      status: "warn",
      summary: `BIOS date "${inventory.bios.date}" is not a recognized format.`,
      evidence: [{ label: "Raw date", value: inventory.bios.date }],
    });
  }
  const ageYears = (Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
  let status: Status = "pass";
  let summary = `Firmware date ${inventory.bios.date} looks current.`;
  if (ageYears > 8) {
    status = "warn";
    summary = `Firmware date ${inventory.bios.date} is more than eight years old.`;
  } else if (ageYears < -0.1) {
    status = "warn";
    summary = `Firmware date ${inventory.bios.date} is in the future.`;
  }
  return finding({
    started,
    id: "bios-date",
    section: "bios",
    title: "Firmware date",
    status,
    summary,
    detail: "Old firmware is a common source of boot, memory-training, and security defects. Confirm the vendor's current release before you replace hardware.",
    evidence: [{ label: "BIOS date", value: inventory.bios.date }],
  });
}

async function biosBoot(inventory: Inventory): Promise<Finding> {
  const started = process.hrtime.bigint();
  const mode = inventory.bios.bootMode;
  const status: Status = mode === "uefi" ? "pass" : mode === "legacy" ? "warn" : "info";
  const summary =
    mode === "uefi"
      ? "The host booted with UEFI."
      : mode === "legacy"
        ? "The host is using legacy BIOS. UEFI is the usual mode for current hardware."
        : "Boot mode is hidden. The EFI interface is not mounted in this environment.";
  return finding({
    started,
    id: "bios-boot-mode",
    section: "bios",
    title: "Boot mode",
    status,
    summary,
    evidence: [{ label: "Mode", value: mode }],
  });
}

async function cpuOnline(inventory: Inventory): Promise<Finding> {
  const started = process.hrtime.bigint();
  const { threads, online, model } = inventory.cpu;
  if (threads == null || online == null) {
    return finding({
      started,
      id: "cpu-online",
      section: "cpu",
      title: "Online processors",
      status: "warn",
      summary: "lscpu did not report a CPU count.",
    });
  }
  const status: Status = online === threads ? "pass" : online === 0 ? "fail" : "warn";
  return finding({
    started,
    id: "cpu-online",
    section: "cpu",
    title: "Online processors",
    status,
    summary:
      status === "pass"
        ? `${online} of ${threads} processors are online.`
        : `${online} of ${threads} processors are online.`,
    detail: model,
    evidence: [
      { label: "Model", value: model },
      { label: "Configured", value: String(threads) },
      { label: "Online", value: String(online) },
    ],
  });
}

async function cpuCompute(): Promise<Finding> {
  const started = process.hrtime.bigint();
  let x = 0x12345678;
  for (let i = 0; i < 4_000_000; i++) {
    x = Math.imul(x, 1664525) + 1013904223;
  }
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  if (!Number.isFinite(x)) {
    return finding({
      started,
      id: "cpu-compute",
      section: "cpu",
      title: "Compute sample",
      status: "fail",
      summary: "The integer sample produced a non-finite result.",
    });
  }
  const status: Status = elapsed > 5000 ? "warn" : "pass";
  return finding({
    started,
    id: "cpu-compute",
    section: "cpu",
    title: "Compute sample",
    status,
    summary:
      status === "pass"
        ? `Integer sample finished in ${elapsed.toFixed(0)} ms.`
        : `Integer sample was slow (${elapsed.toFixed(0)} ms). The core answered, but scheduling looks constrained.`,
    evidence: [{ label: "Checksum", value: (x >>> 0).toString(16) }],
  });
}

async function cpuMitigations(inventory: Inventory): Promise<Finding> {
  const started = process.hrtime.bigint();
  const rows = inventory.cpu.vulnerabilities;
  if (rows.length === 0) {
    return finding({
      started,
      id: "cpu-mitigations",
      section: "cpu",
      title: "Speculative mitigations",
      status: "info",
      summary: "The kernel did not publish a vulnerability list.",
    });
  }
  const open = rows.filter((row) => /^vulnerable/i.test(row.state));
  return finding({
    started,
    id: "cpu-mitigations",
    section: "cpu",
    title: "Speculative mitigations",
    status: open.length ? "warn" : "pass",
    summary: open.length
      ? `${open.length} issue${open.length === 1 ? "" : "s"} still reported as vulnerable.`
      : `${rows.length} published issues are mitigated or not affected.`,
    evidence: rows.slice(0, 8).map((row) => ({ label: row.name, value: row.state })),
  });
}

async function memoryHeadroom(inventory: Inventory): Promise<Finding> {
  const started = process.hrtime.bigint();
  const { totalBytes, availableBytes, swapTotalBytes, swapFreeBytes } = inventory.memory;
  if (totalBytes <= 0) {
    return finding({
      started,
      id: "memory-headroom",
      section: "memory",
      title: "Available memory",
      status: "fail",
      summary: "MemTotal was missing from /proc/meminfo.",
    });
  }
  const ratio = availableBytes / totalBytes;
  const swapUsed = swapTotalBytes - swapFreeBytes;
  let status: Status = "pass";
  if (ratio < 0.05) status = "fail";
  else if (ratio < 0.12 || (swapTotalBytes > 0 && swapUsed / swapTotalBytes > 0.5)) status = "warn";
  return finding({
    started,
    id: "memory-headroom",
    section: "memory",
    title: "Available memory",
    status,
    summary: `${formatBytes(availableBytes)} available of ${formatBytes(totalBytes)}.`,
    detail:
      swapTotalBytes === 0
        ? "No swap is configured. A pattern sample can still run, but a full memory test needs a dedicated offline tool."
        : `${formatBytes(swapUsed)} of swap is in use.`,
    evidence: [
      { label: "Available", value: `${Math.round(ratio * 100)}%` },
      { label: "Swap", value: swapTotalBytes ? formatBytes(swapTotalBytes) : "none" },
    ],
  });
}

async function memoryPattern(): Promise<Finding> {
  const started = process.hrtime.bigint();
  const bytes = 32 * 1024 * 1024;
  const buf = Buffer.allocUnsafe(bytes);
  for (let i = 0; i < bytes; i += 4096) buf[i] = i & 0xff;
  let mismatches = 0;
  for (let i = 0; i < bytes; i += 4096) {
    if (buf[i] !== (i & 0xff)) mismatches += 1;
  }
  return finding({
    started,
    id: "memory-pattern",
    section: "memory",
    title: "Pattern sample",
    status: mismatches === 0 ? "pass" : "fail",
    summary:
      mismatches === 0
        ? "32 MiB pattern matched on read-back."
        : `${mismatches} pages did not match. Treat this host as suspect and run an offline memory test.`,
    detail: "This samples a small allocation in the service process. It does not walk all installed DIMMs.",
    evidence: [{ label: "Mismatched pages", value: String(mismatches) }],
  });
}

async function storageRoot(inventory: Inventory): Promise<Finding> {
  const started = process.hrtime.bigint();
  const root = inventory.storage.filesystems.find((row) => row.mount === "/");
  if (!root) {
    return finding({
      started,
      id: "storage-root-space",
      section: "storage",
      title: "Root filesystem space",
      status: "warn",
      summary: "No root filesystem was listed by df.",
    });
  }
  const status: Status = root.usedPercent >= 95 ? "fail" : root.usedPercent >= 85 ? "warn" : "pass";
  return finding({
    started,
    id: "storage-root-space",
    section: "storage",
    title: "Root filesystem space",
    status,
    summary: `Root is ${root.usedPercent}% full (${formatBytes(root.availBytes)} free).`,
    evidence: [
      { label: "Device", value: root.filesystem },
      { label: "Size", value: formatBytes(root.sizeBytes) },
    ],
  });
}

async function storageRoundtrip(): Promise<Finding> {
  const started = process.hrtime.bigint();
  const dir = await mkdtemp(join(tmpdir(), "bench-"));
  const file = join(dir, "roundtrip.bin");
  try {
    const payload = randomBytes(1024 * 1024);
    const expected = createHash("sha256").update(payload).digest("hex");
    await writeFile(file, payload);
    const readBack = await readFile(file);
    const actual = createHash("sha256").update(readBack).digest("hex");
    const ok = expected === actual && readBack.length === payload.length;
    return finding({
      started,
      id: "storage-roundtrip",
      section: "storage",
      title: "Disk round trip",
      status: ok ? "pass" : "fail",
      summary: ok ? "1 MiB write and read-back matched." : "Read-back hash did not match the bytes written.",
      evidence: [{ label: "SHA-256", value: actual.slice(0, 16) }],
    });
  } catch (error) {
    return finding({
      started,
      id: "storage-roundtrip",
      section: "storage",
      title: "Disk round trip",
      status: "fail",
      summary: "The temporary write failed.",
      detail: error instanceof Error ? error.message : "Unknown write error",
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function networkLink(inventory: Inventory): Promise<Finding> {
  const started = process.hrtime.bigint();
  const physical = inventory.network.interfaces.filter((nic) => nic.name !== "lo");
  const up = physical.filter((nic) => nic.operstate === "up" || nic.operstate === "unknown");
  return finding({
    started,
    id: "network-link",
    section: "network",
    title: "Link state",
    status: up.length ? "pass" : "fail",
    summary: up.length
      ? `${up.map((nic) => nic.name).join(", ")} ${up.length === 1 ? "is" : "are"} up.`
      : "No non-loopback interface is up.",
    evidence: physical.map((nic) => ({
      label: nic.name,
      value: [nic.operstate, nic.address].filter(Boolean).join(" · "),
    })),
  });
}

async function networkRoute(inventory: Inventory): Promise<Finding> {
  const started = process.hrtime.bigint();
  const iface = inventory.network.defaultRouteInterface;
  return finding({
    started,
    id: "network-route",
    section: "network",
    title: "Default route",
    status: iface ? "pass" : "warn",
    summary: iface ? `Default route uses ${iface}.` : "No default route is installed.",
    evidence: iface ? [{ label: "Interface", value: iface }] : [],
  });
}

async function sensorGroup(inventory: Inventory, id: string, title: string, group: SensorGroup): Promise<Finding> {
  const started = process.hrtime.bigint();
  const rows = sensorsIn(inventory.sensors, group);
  const present = rows.filter((row) => row.state !== "absent");
  const critical = rows.filter((row) => row.state === "critical");
  const warning = rows.filter((row) => row.state === "warning");
  let status: Status = "pass";
  let summary = `${present.length} ${title.toLowerCase()} sensor${present.length === 1 ? "" : "s"} inside limits.`;
  if (present.length === 0) {
    status = "warn";
    summary = `${title} sensors are not exposed on this host.`;
  } else if (critical.length) {
    status = "fail";
    summary = critical.map((row) => `${row.name} ${row.display}`).join(", ");
  } else if (warning.length) {
    status = "warn";
    summary = warning.map((row) => `${row.name} ${row.display}`).join(", ");
  }
  return finding({
    started,
    id,
    section: "sensors",
    title,
    status,
    summary,
    detail:
      present.length === 0
        ? "A server BMC publishes these through IPMI or the hwmon driver. This console still lists every required sensor so the gap is visible."
        : "Limits follow common rack-server thresholds for inlet air, component temperature, fan speed, and voltage tolerance.",
    evidence: rows.map((row) => ({ label: row.name, value: row.display })),
  });
}

const RUNNERS: Record<string, (inventory: Inventory) => Promise<Finding>> = {
  "bios-smbios": biosSmbios,
  "bios-date": biosDate,
  "bios-boot-mode": biosBoot,
  "cpu-online": cpuOnline,
  "cpu-compute": cpuCompute,
  "cpu-mitigations": cpuMitigations,
  "memory-headroom": memoryHeadroom,
  "memory-pattern": memoryPattern,
  "storage-root-space": storageRoot,
  "storage-roundtrip": storageRoundtrip,
  "network-link": networkLink,
  "network-route": networkRoute,
  "sensors-thermal": (inventory) => sensorGroup(inventory, "sensors-thermal", "Thermal", "temperature"),
  "sensors-fans": (inventory) => sensorGroup(inventory, "sensors-fans", "Fan", "fan"),
  "sensors-power": (inventory) => sensorGroup(inventory, "sensors-power", "Power", "power"),
  "sensors-voltage": (inventory) => sensorGroup(inventory, "sensors-voltage", "Voltage", "voltage"),
  "sensors-chassis": (inventory) => sensorGroup(inventory, "sensors-chassis", "Chassis", "chassis"),
};

export async function runSuite(ids?: string[]): Promise<SuiteReport> {
  const startedAt = new Date();
  const inventory = await collectInventory();
  const wanted = ids?.length ? TESTS.filter((test) => ids.includes(test.id)) : TESTS;
  const findings: Finding[] = [];
  for (const test of wanted) {
    const run = RUNNERS[test.id];
    findings.push(await run(inventory));
  }
  const finishedAt = new Date();
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    findings,
  };
}

export function counts(findings: Finding[]): Record<Status, number> {
  const base: Record<Status, number> = { pass: 0, warn: 0, fail: 0, skip: 0, info: 0 };
  for (const item of findings) base[item.status] += 1;
  return base;
}
