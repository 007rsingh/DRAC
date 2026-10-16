"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  RefreshCw,
  Shield,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SECTIONS, TESTS, testsFor } from "@/lib/diagnostics/catalog";
import { formatBytes, formatUptime } from "@/lib/diagnostics/format";
import type { Finding, Inventory, SectionId, Status, SuiteReport } from "@/lib/diagnostics/types";

const STATUS_LABEL: Record<Status, string> = {
  pass: "Pass",
  warn: "Check",
  fail: "Fail",
  skip: "Skipped",
  info: "Info",
};

function statusClass(status: Status): string {
  if (status === "pass") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (status === "warn") return "bg-amber-500/15 text-amber-200 border-amber-500/30";
  if (status === "fail") return "bg-red-500/15 text-red-300 border-red-500/30";
  if (status === "info") return "bg-sky-500/15 text-sky-200 border-sky-500/30";
  return "bg-zinc-500/15 text-zinc-300 border-zinc-500/30";
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="truncate text-sm text-foreground">{value}</div>
    </div>
  );
}

function FindingCard({ item }: { item: Finding }) {
  return (
    <article className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-medium">{item.title}</h3>
        <Badge variant="outline" className={statusClass(item.status)}>
          {STATUS_LABEL[item.status]}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-foreground/90">{item.summary}</p>
      {item.detail ? <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p> : null}
      {item.evidence.length > 0 ? (
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {item.evidence.map((row) => (
            <div key={`${item.id}-${row.label}`} className="rounded-lg bg-muted/50 px-3 py-2">
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">{row.label}</dt>
              <dd className="font-mono text-xs break-all">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="mt-3 font-mono text-[11px] text-muted-foreground">{item.durationMs.toFixed(0)} ms</p>
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

  const visibleFindings =
    section === "overview" ? findings : findings.filter((item) => item.section === section);

  function downloadReport() {
    const payload = { inventory, report };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bench-report-${new Date().toISOString().slice(0, 19)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[11px] tracking-[0.18em] text-amber-200/80 uppercase">Field bench</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">BIOS and hardware diagnostics</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Reads firmware identity and runs non-destructive checks against the machine hosting this console.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void loadInventory()} disabled={loadingInventory || Boolean(running)}>
              <RefreshCw className={loadingInventory ? "animate-spin" : ""} />
              Refresh inventory
            </Button>
            <Button onClick={() => void runTests()} disabled={Boolean(running)}>
              <Activity />
              {running === "Full suite" ? "Running suite…" : "Run full suite"}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex flex-wrap gap-2 lg:flex-col">
          {SECTIONS.map((item) => (
            <Button
              key={item.id}
              variant={section === item.id ? "secondary" : "ghost"}
              className="justify-start whitespace-nowrap"
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </nav>

        <main className="space-y-4">
          {inventoryError ? (
            <Card>
              <CardHeader>
                <CardTitle>Inventory unavailable</CardTitle>
                <CardDescription>{inventoryError}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => void loadInventory()}>Try again</Button>
              </CardContent>
            </Card>
          ) : null}

          {runError ? (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{runError}</p>
          ) : null}

          {loadingInventory && !inventory ? (
            <Card>
              <CardHeader>
                <CardTitle>Reading this host</CardTitle>
                <CardDescription>Collecting firmware, processor, memory, disk, and link data.</CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {inventory ? <SectionBody section={section} inventory={inventory} running={running} onRun={runTests} /> : null}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Results</h2>
              <div className="flex flex-wrap items-center gap-2">
                {findings.length > 0 ? (
                  <>
                    <Badge variant="outline" className={statusClass("pass")}>{tally.pass} pass</Badge>
                    <Badge variant="outline" className={statusClass("warn")}>{tally.warn} check</Badge>
                    <Badge variant="outline" className={statusClass("fail")}>{tally.fail} fail</Badge>
                    <Button variant="outline" size="sm" onClick={downloadReport}>
                      Download JSON
                    </Button>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">No suite has been run yet.</span>
                )}
              </div>
            </div>
            {visibleFindings.length === 0 && findings.length > 0 ? (
              <p className="text-sm text-muted-foreground">This section has no results yet. Run its checks.</p>
            ) : null}
            <div className="grid gap-3">
              {visibleFindings.map((item) => (
                <FindingCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function SectionBody({
  section,
  inventory,
  running,
  onRun,
}: {
  section: (typeof SECTIONS)[number]["id"];
  inventory: Inventory;
  running: string | null;
  onRun: (ids?: string[], label?: string) => void;
}) {
  if (section === "overview") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="size-4 text-amber-200" /> Host</CardTitle>
            <CardDescription>Collected {new Date(inventory.collectedAt).toLocaleString()}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Fact label="Name" value={inventory.host.hostname} />
            <Fact label="OS" value={inventory.host.os} />
            <Fact label="Kernel" value={inventory.host.kernel} />
            <Fact label="Uptime" value={formatUptime(inventory.host.uptimeSec)} />
            <Fact label="Platform" value={inventory.host.virtualized ? inventory.host.hypervisor || "Virtual machine" : "Bare metal"} />
            <Fact label="Boot" value={inventory.bios.bootMode} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What this pass covers</CardTitle>
            <CardDescription>
              Identity, a short compute sample, a 32 MiB memory pattern, a 1 MiB disk round trip, and link state.
              It does not flash firmware or walk every DIMM.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {inventory.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
            {inventory.notes.length === 0 ? <p>Firmware tables were readable on this host.</p> : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  const tests = testsFor(section);
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <SectionIcon section={section} />
            {SECTIONS.find((item) => item.id === section)?.label}
          </CardTitle>
          <CardDescription>{tests.map((test) => test.blurb).join(" ")}</CardDescription>
        </div>
        <Button
          variant="outline"
          disabled={Boolean(running)}
          onClick={() => onRun(tests.map((test) => test.id), section)}
        >
          {running === section ? "Running…" : "Run these checks"}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {section === "bios" ? (
          <>
            <Fact label="Vendor" value={inventory.bios.vendor ?? "Not exposed"} />
            <Fact label="Version" value={inventory.bios.version ?? "Not exposed"} />
            <Fact label="Date" value={inventory.bios.date ?? "Not exposed"} />
            <Fact label="System" value={inventory.bios.productName ?? inventory.bios.systemVendor ?? "Not exposed"} />
            <Fact label="Board" value={inventory.bios.boardName ?? "Not exposed"} />
            <Fact label="Source" value={inventory.bios.source} />
          </>
        ) : null}
        {section === "cpu" ? (
          <>
            <Fact label="Model" value={inventory.cpu.model} />
            <Fact label="Vendor" value={inventory.cpu.vendor} />
            <Fact label="Sockets" value={String(inventory.cpu.sockets ?? "—")} />
            <Fact label="Cores / socket" value={String(inventory.cpu.cores ?? "—")} />
            <Fact label="Threads" value={String(inventory.cpu.threads ?? "—")} />
            <Fact label="Online" value={String(inventory.cpu.online ?? "—")} />
          </>
        ) : null}
        {section === "memory" ? (
          <>
            <Fact label="Total" value={formatBytes(inventory.memory.totalBytes)} />
            <Fact label="Available" value={formatBytes(inventory.memory.availableBytes)} />
            <Fact label="In use" value={formatBytes(inventory.memory.usedBytes)} />
            <Fact label="Swap" value={inventory.memory.swapTotalBytes ? formatBytes(inventory.memory.swapTotalBytes) : "None"} />
          </>
        ) : null}
        {section === "storage"
          ? inventory.storage.disks.map((disk) => (
              <Fact
                key={disk.name}
                label={disk.name}
                value={`${formatBytes(disk.sizeBytes ?? 0)} ${disk.transport ?? disk.type}${disk.mountpoints.length ? ` · ${disk.mountpoints.join(", ")}` : ""}`}
              />
            ))
          : null}
        {section === "storage"
          ? inventory.storage.filesystems.map((fs) => (
              <Fact key={fs.mount} label={fs.mount} value={`${fs.usedPercent}% used · ${formatBytes(fs.availBytes)} free`} />
            ))
          : null}
        {section === "network"
          ? inventory.network.interfaces.map((nic) => (
              <Fact
                key={nic.name}
                label={nic.name}
                value={`${nic.operstate}${nic.address ? ` · ${nic.address}` : ""}${inventory.network.defaultRouteInterface === nic.name ? " · default route" : ""}`}
              />
            ))
          : null}
      </CardContent>
    </Card>
  );
}

function SectionIcon({ section }: { section: SectionId }) {
  const className = "size-4 text-amber-200";
  if (section === "bios") return <Shield className={className} />;
  if (section === "cpu") return <Cpu className={className} />;
  if (section === "memory") return <MemoryStick className={className} />;
  if (section === "storage") return <HardDrive className={className} />;
  return <Network className={className} />;
}
