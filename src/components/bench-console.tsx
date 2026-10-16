"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  HardDrive,
  Info,
  MemoryStick,
  MinusCircle,
  Network,
  RefreshCw,
  Shield,
  Thermometer,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SECTIONS, TESTS, testsFor } from "@/lib/diagnostics/catalog";
import { formatBytes, formatUptime } from "@/lib/diagnostics/format";
import type { Finding, Inventory, SectionId, SensorReading, SensorState, Status, SuiteReport } from "@/lib/diagnostics/types";

const NAV: { id: (typeof SECTIONS)[number]["id"]; label: string }[] = [
  { id: "overview", label: "Dashboard" },
  { id: "bios", label: "Firmware" },
  { id: "cpu", label: "Processor" },
  { id: "memory", label: "Memory" },
  { id: "storage", label: "Storage" },
  { id: "network", label: "Network" },
  { id: "sensors", label: "Sensors" },
];

const STATUS_LABEL: Record<Status, string> = {
  pass: "OK",
  warn: "Warning",
  fail: "Critical",
  skip: "Skipped",
  info: "Info",
};

function rollup(findings: Finding[]): Status | "idle" {
  if (findings.length === 0) return "idle";
  if (findings.some((item) => item.status === "fail")) return "fail";
  if (findings.some((item) => item.status === "warn")) return "warn";
  if (findings.some((item) => item.status === "pass")) return "pass";
  return "info";
}

function statusTone(status: Status | "idle"): string {
  if (status === "pass") return "border-[#b7dfc3] bg-[#eef8f1] text-[#1b7a32]";
  if (status === "warn") return "border-[#f0d7a2] bg-[#fff8eb] text-[#8a5a00]";
  if (status === "fail") return "border-[#f3c1bc] bg-[#fdecea] text-[#b42318]";
  if (status === "info") return "border-[#c5ddf2] bg-[#f3f8fc] text-[#0b5f99]";
  if (status === "idle") return "border-[#d5dbe1] bg-[#f4f7f9] text-[#5c6770]";
  return "border-[#d5dbe1] bg-[#f7f8f9] text-[#5c6770]";
}

function barTone(status: Status | "idle"): string {
  if (status === "pass") return "bg-[#41a85f]";
  if (status === "warn") return "bg-[#f0ad1e]";
  if (status === "fail") return "bg-[#e04b3a]";
  if (status === "info") return "bg-[#178709]";
  return "bg-[#b7c0c8]";
}

function StatusIcon({ status }: { status: Status | "idle" }) {
  const className = "size-4 shrink-0";
  if (status === "pass") return <CheckCircle2 className={className} />;
  if (status === "warn") return <AlertTriangle className={className} />;
  if (status === "fail") return <XCircle className={className} />;
  if (status === "info") return <Info className={className} />;
  return <MinusCircle className={className} />;
}

function StatusPill({ status }: { status: Status | "idle" }) {
  const label = status === "idle" ? "Not run" : STATUS_LABEL[status];
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-semibold ${statusTone(status)}`}>
      <StatusIcon status={status} />
      {label}
    </span>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border border-[#d5dbe1] bg-white shadow-[0_1px_0_rgba(16,24,40,0.04)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e4e8ec] bg-[#f7f9fb] px-4 py-2.5">
        <h2 className="text-sm font-semibold text-[#1f242b]">{title}</h2>
        {action}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function PropertyTable({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[280px] border-collapse text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-[#eef1f4] last:border-0">
              <th className="w-40 py-2 pr-4 text-left font-medium text-[#5c6770]">{row.label}</th>
              <td className="py-2 text-[#1f242b]">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FindingRow({ item }: { item: Finding }) {
  return (
    <article className="border border-[#e4e8ec] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef1f4] px-3 py-2">
        <h3 className="text-sm font-semibold">{item.title}</h3>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-[#5c6770]">{item.durationMs < 1 ? "<1 ms" : `${item.durationMs.toFixed(0)} ms`}</span>
          <StatusPill status={item.status} />
        </div>
      </div>
      <div className="space-y-2 px-3 py-3 text-sm">
        <p>{item.summary}</p>
        {item.detail ? <p className="text-[#5c6770]">{item.detail}</p> : null}
        {item.evidence.length > 0 ? (
          <dl className="grid gap-px bg-[#e4e8ec] sm:grid-cols-2">
            {item.evidence.map((row) => (
              <div key={`${item.id}-${row.label}`} className="bg-[#f7f9fb] px-3 py-2">
                <dt className="text-[11px] font-medium tracking-wide text-[#5c6770] uppercase">{row.label}</dt>
                <dd className="font-mono text-xs break-all text-[#1f242b]">{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </article>
  );
}

export function BenchConsole() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]["id"]>("overview");
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [report, setReport] = useState<SuiteReport | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    setLoadingInventory(true);
    setInventoryError(null);
    try {
      const response = await fetch("/api/inventory", { cache: "no-store" });
      const body = (await response.json()) as Inventory & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not read this host");
      setInventory(body);
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : "Could not read this host");
    } finally {
      setLoadingInventory(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/inventory", { cache: "no-store" });
        const body = (await response.json()) as Inventory & { error?: string };
        if (!response.ok) throw new Error(body.error || "Could not read this host");
        if (!cancelled) setInventory(body);
      } catch (error) {
        if (!cancelled) {
          setInventoryError(error instanceof Error ? error.message : "Could not read this host");
        }
      } finally {
        if (!cancelled) setLoadingInventory(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const runTests = useCallback(async (ids?: string[], label = "Full suite") => {
    setRunning(label);
    setRunError(null);
    try {
      const response = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { ids } : {}),
      });
      const body = (await response.json()) as SuiteReport & { error?: string };
      if (!response.ok) throw new Error(body.error || "The suite failed");
      setReport((current) => {
        if (!ids || !current) return body;
        const next = new Map(current.findings.map((item) => [item.id, item]));
        for (const item of body.findings) next.set(item.id, item);
        return {
          ...body,
          findings: TESTS.map((test) => next.get(test.id)).filter((item): item is Finding => Boolean(item)),
        };
      });
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "The suite failed");
    } finally {
      setRunning(null);
    }
  }, []);

  const findings = useMemo(() => report?.findings ?? [], [report]);
  const tally = useMemo(() => {
    const base: Record<Status, number> = { pass: 0, warn: 0, fail: 0, skip: 0, info: 0 };
    for (const item of findings) base[item.status] += 1;
    return base;
  }, [findings]);
  const overall = rollup(findings);
  const visibleFindings = section === "overview" ? findings : findings.filter((item) => item.section === section);
  const activeLabel = NAV.find((item) => item.id === section)?.label ?? "Dashboard";

  function downloadReport() {
    const payload = { inventory, report };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `aegisgrid-report-${new Date().toISOString().slice(0, 19)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[#eef1f4] text-[#1f242b]">
      <header className="border-b border-[#d5dbe1] bg-white">
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Image
            src="/aegisgrid-logo.jpg"
            alt="AegisGrid. Powering modern infrastructure."
            width={1082}
            height={217}
            priority
            className="h-12 w-auto bg-[#d9d9d9] sm:h-16"
          />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <div>
              <div className="text-[11px] tracking-wide text-[#5c6770] uppercase">System</div>
              <div className="font-semibold">{inventory?.host.hostname ?? "Reading…"}</div>
            </div>
            <div>
              <div className="text-[11px] tracking-wide text-[#5c6770] uppercase">Platform</div>
              <div>{inventory ? (inventory.host.virtualized ? inventory.host.hypervisor || "Virtual" : "Bare metal") : "—"}</div>
            </div>
            <div>
              <div className="text-[11px] tracking-wide text-[#5c6770] uppercase">Health</div>
              <StatusPill status={overall} />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-[#e4e8ec] bg-[#f7f9fb] px-2 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex flex-wrap">
            {NAV.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`border-b-2 px-3 py-2.5 text-sm font-medium ${
                    active
                      ? "border-[#178709] text-[#146b08]"
                      : "border-transparent text-[#3d4750] hover:bg-white hover:text-[#f47b04]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="flex flex-wrap gap-2 px-2 pb-2 sm:pb-0">
            <Button
              variant="outline"
              className="rounded-sm bg-white"
              onClick={() => void loadInventory()}
              disabled={loadingInventory || Boolean(running)}
            >
              <RefreshCw className={loadingInventory ? "animate-spin" : ""} />
              Refresh
            </Button>
            <Button className="rounded-sm" onClick={() => void runTests()} disabled={Boolean(running)}>
              {running === "Full suite" ? "Running…" : "Run diagnostics"}
            </Button>
          </div>
        </div>
      </header>

      <main className="space-y-4 px-4 py-4">
        <div className="text-xs text-[#5c6770]">
          System <span className="px-1">/</span> <span className="text-[#1f242b]">{activeLabel}</span>
        </div>

        {inventoryError ? (
          <Panel
            title="Inventory unavailable"
            action={
              <Button className="rounded-sm" onClick={() => void loadInventory()}>
                Try again
              </Button>
            }
          >
            <p className="text-sm text-[#b42318]">{inventoryError}</p>
          </Panel>
        ) : null}

        {runError ? (
          <p className="border border-[#f3c1bc] bg-[#fdecea] px-3 py-2 text-sm text-[#b42318]">{runError}</p>
        ) : null}

        {loadingInventory && !inventory ? (
          <Panel title="Reading this host">
            <p className="text-sm text-[#5c6770]">Collecting firmware, processors, memory, storage, network, and BMC sensors.</p>
          </Panel>
        ) : null}

        {inventory ? (
          <SectionBody
            section={section}
            inventory={inventory}
            findings={findings}
            running={running}
            onRun={runTests}
          />
        ) : null}

        <Panel
          title="Diagnostic results"
          action={
            findings.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[#1b7a32]">{tally.pass} OK</span>
                <span className="text-xs text-[#8a5a00]">{tally.warn} warning</span>
                <span className="text-xs text-[#b42318]">{tally.fail} critical</span>
                <Button variant="outline" size="sm" className="rounded-sm bg-white" onClick={downloadReport}>
                  Export JSON
                </Button>
              </div>
            ) : (
              <span className="text-xs text-[#5c6770]">No diagnostics have been run.</span>
            )
          }
        >
          {visibleFindings.length === 0 ? (
            <p className="text-sm text-[#5c6770]">
              {findings.length === 0
                ? "Run diagnostics to fill this log. Checks stay on this host and do not flash firmware."
                : "This section has no results yet. Run its checks."}
            </p>
          ) : (
            <div className="grid gap-2">
              {visibleFindings.map((item) => (
                <FindingRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </Panel>
      </main>
    </div>
  );
}

function SectionBody({
  section,
  inventory,
  findings,
  running,
  onRun,
}: {
  section: (typeof SECTIONS)[number]["id"];
  inventory: Inventory;
  findings: Finding[];
  running: string | null;
  onRun: (ids?: string[], label?: string) => void;
}) {
  if (section === "overview") {
    const groups: { id: SectionId; label: string }[] = [
      { id: "bios", label: "Firmware" },
      { id: "cpu", label: "Processor" },
      { id: "memory", label: "Memory" },
      { id: "storage", label: "Storage" },
      { id: "network", label: "Network" },
      { id: "sensors", label: "Sensors" },
    ];
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => {
            const related = findings.filter((item) => item.section === group.id);
            const status = rollup(related);
            return (
              <div key={group.id} className="border border-[#d5dbe1] bg-white">
                <div className={`h-1 ${barTone(status)}`} />
                <div className="flex items-start justify-between gap-2 px-3 py-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <SectionIcon section={group.id} />
                      {group.label}
                    </div>
                    <p className="mt-1 text-xs text-[#5c6770]">
                      {related.length === 0 ? "Awaiting diagnostics" : related[0]?.summary}
                    </p>
                  </div>
                  <StatusPill status={status} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="System information">
            <PropertyTable
              rows={[
                { label: "Host name", value: inventory.host.hostname },
                { label: "Operating system", value: inventory.host.os },
                { label: "Kernel", value: inventory.host.kernel },
                { label: "Uptime", value: formatUptime(inventory.host.uptimeSec) },
                { label: "Architecture", value: inventory.host.arch },
                { label: "Boot mode", value: inventory.bios.bootMode },
                { label: "Collected", value: new Date(inventory.collectedAt).toLocaleString() },
              ]}
            />
          </Panel>
          <Panel title="Firmware">
            <PropertyTable
              rows={[
                { label: "BIOS vendor", value: inventory.bios.vendor ?? "Not exposed" },
                { label: "BIOS version", value: inventory.bios.version ?? "Not exposed" },
                { label: "BIOS date", value: inventory.bios.date ?? "Not exposed" },
                { label: "System", value: inventory.bios.productName ?? inventory.bios.systemVendor ?? "Not exposed" },
                { label: "Board", value: inventory.bios.boardName ?? "Not exposed" },
                { label: "Source", value: inventory.bios.source },
              ]}
            />
            {inventory.notes.length > 0 ? (
              <div className="mt-3 space-y-2">
                {inventory.notes.map((note) => (
                  <p key={note} className="border border-[#f0d7a2] bg-[#fff8eb] px-3 py-2 text-sm text-[#8a5a00]">{note}</p>
                ))}
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
    );
  }

  const tests = testsFor(section);
  if (section === "sensors") {
    return (
      <Panel
        title="Sensors"
        action={
          <Button
            variant="outline"
            className="rounded-sm bg-white"
            disabled={Boolean(running)}
            onClick={() => onRun(tests.map((test) => test.id), section)}
          >
            {running === section ? "Running…" : "Run these checks"}
          </Button>
        }
      >
        <p className="mb-3 text-sm text-[#5c6770]">{tests.map((test) => test.blurb).join(" ")}</p>
        <SensorBoard readings={inventory.sensors} />
      </Panel>
    );
  }
  return (
    <Panel
      title={NAV.find((item) => item.id === section)?.label ?? "Details"}
      action={
        <Button
          variant="outline"
          className="rounded-sm bg-white"
          disabled={Boolean(running)}
          onClick={() => onRun(tests.map((test) => test.id), section)}
        >
          {running === section ? "Running…" : "Run these checks"}
        </Button>
      }
    >
      <p className="mb-3 text-sm text-[#5c6770]">{tests.map((test) => test.blurb).join(" ")}</p>
      <PropertyTable rows={rowsFor(section, inventory)} />
    </Panel>
  );
}

function rowsFor(section: SectionId, inventory: Inventory): { label: string; value: string }[] {
  if (section === "bios") {
    return [
      { label: "Vendor", value: inventory.bios.vendor ?? "Not exposed" },
      { label: "Version", value: inventory.bios.version ?? "Not exposed" },
      { label: "Date", value: inventory.bios.date ?? "Not exposed" },
      { label: "Release", value: inventory.bios.release ?? "Not exposed" },
      { label: "System", value: inventory.bios.productName ?? inventory.bios.systemVendor ?? "Not exposed" },
      { label: "Board", value: inventory.bios.boardName ?? "Not exposed" },
      { label: "Chassis", value: inventory.bios.chassisType ?? "Not exposed" },
      { label: "Boot mode", value: inventory.bios.bootMode },
      { label: "Source", value: inventory.bios.source },
    ];
  }
  if (section === "cpu") {
    return [
      { label: "Model", value: inventory.cpu.model },
      { label: "Vendor", value: inventory.cpu.vendor },
      { label: "Sockets", value: String(inventory.cpu.sockets ?? "—") },
      { label: "Cores / socket", value: String(inventory.cpu.cores ?? "—") },
      { label: "Threads", value: String(inventory.cpu.threads ?? "—") },
      { label: "Online", value: String(inventory.cpu.online ?? "—") },
      { label: "Speed", value: inventory.cpu.mhz ?? "—" },
      { label: "Virtualization", value: inventory.cpu.virtualization ?? "—" },
    ];
  }
  if (section === "memory") {
    return [
      { label: "Total", value: formatBytes(inventory.memory.totalBytes) },
      { label: "Available", value: formatBytes(inventory.memory.availableBytes) },
      { label: "In use", value: formatBytes(inventory.memory.usedBytes) },
      { label: "Swap", value: inventory.memory.swapTotalBytes ? formatBytes(inventory.memory.swapTotalBytes) : "None" },
    ];
  }
  if (section === "storage") {
    const disks = inventory.storage.disks.map((disk) => ({
      label: disk.name,
      value: `${formatBytes(disk.sizeBytes ?? 0)} ${disk.transport ?? disk.type}${disk.mountpoints.length ? ` · ${disk.mountpoints.join(", ")}` : ""}`,
    }));
    const filesystems = inventory.storage.filesystems.map((fs) => ({
      label: fs.mount,
      value: `${fs.usedPercent}% used · ${formatBytes(fs.availBytes)} free · ${fs.filesystem}`,
    }));
    return [...disks, ...filesystems];
  }
  return inventory.network.interfaces.map((nic) => ({
    label: nic.name,
    value: `${nic.operstate}${nic.address ? ` · ${nic.address}` : ""}${inventory.network.defaultRouteInterface === nic.name ? " · default route" : ""}`,
  }));
}

function sensorStateLabel(state: SensorState): string {
  if (state === "ok") return "OK";
  if (state === "warning") return "Warning";
  if (state === "critical") return "Critical";
  return "Not exposed";
}

function sensorStateClass(state: SensorState): string {
  if (state === "ok") return "text-[#1b7a32]";
  if (state === "warning") return "text-[#8a5a00]";
  if (state === "critical") return "text-[#b42318]";
  return "text-[#5c6770]";
}

function SensorBoard({ readings }: { readings: SensorReading[] }) {
  const groups: { id: SensorReading["group"]; label: string }[] = [
    { id: "temperature", label: "Temperature" },
    { id: "fan", label: "Fans" },
    { id: "power", label: "Power" },
    { id: "voltage", label: "Voltage" },
    { id: "chassis", label: "Chassis" },
  ];
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.id}>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-[#5c6770] uppercase">{group.label}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#d5dbe1] text-left text-[11px] tracking-wide text-[#5c6770] uppercase">
                  <th className="py-2 pr-3 font-medium">Sensor</th>
                  <th className="py-2 pr-3 font-medium">Reading</th>
                  <th className="py-2 pr-3 font-medium">Limit</th>
                  <th className="py-2 pr-3 font-medium">State</th>
                  <th className="py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {readings
                  .filter((reading) => reading.group === group.id)
                  .map((reading) => (
                    <tr key={reading.id} className="border-b border-[#eef1f4]">
                      <td className="py-2 pr-3 font-medium">{reading.name}</td>
                      <td className="py-2 pr-3">{reading.display}</td>
                      <td className="py-2 pr-3 text-[#5c6770]">{reading.limit}</td>
                      <td className={`py-2 pr-3 font-semibold ${sensorStateClass(reading.state)}`}>{sensorStateLabel(reading.state)}</td>
                      <td className="py-2 text-[#5c6770]">{reading.source ?? "BMC not visible"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionIcon({ section }: { section: SectionId }) {
  const className = "size-4 text-[#178709]";
  if (section === "bios") return <Shield className={className} />;
  if (section === "cpu") return <Cpu className={className} />;
  if (section === "memory") return <MemoryStick className={className} />;
  if (section === "storage") return <HardDrive className={className} />;
  if (section === "sensors") return <Thermometer className={className} />;
  return <Network className={className} />;
}
