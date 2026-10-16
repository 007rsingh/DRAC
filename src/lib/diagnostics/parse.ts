export function parseColonTable(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

export function parseCpuRange(list: string | undefined): number | null {
  if (!list) return null;
  const trimmed = list.trim();
  if (!trimmed || trimmed === "N/A") return null;
  let count = 0;
  for (const part of trimmed.split(",")) {
    const piece = part.trim();
    if (!piece) continue;
    const range = piece.split("-");
    if (range.length === 1) {
      count += 1;
      continue;
    }
    const start = Number(range[0]);
    const end = Number(range[1]);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      count += end - start + 1;
    }
  }
  return count;
}

export function parseIntLoose(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.replaceAll(",", "").match(/-?\d+/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

export type Meminfo = {
  totalBytes: number;
  availableBytes: number;
  freeBytes: number;
  swapTotalBytes: number;
  swapFreeBytes: number;
};

export function parseMeminfo(text: string): Meminfo {
  const kb = (key: string) => {
    const line = text.split("\n").find((row) => row.startsWith(key));
    if (!line) return 0;
    const match = line.match(/(\d+)/);
    return match ? Number(match[1]) * 1024 : 0;
  };
  const totalBytes = kb("MemTotal:");
  const availableBytes = kb("MemAvailable:") || kb("MemFree:");
  const freeBytes = kb("MemFree:");
  return {
    totalBytes,
    availableBytes,
    freeBytes,
    swapTotalBytes: kb("SwapTotal:"),
    swapFreeBytes: kb("SwapFree:"),
  };
}

export function parseBiosDate(value: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const mdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const date = new Date(Date.UTC(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2])));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export type DfRow = {
  filesystem: string;
  sizeBytes: number;
  usedBytes: number;
  availBytes: number;
  usedPercent: number;
  mount: string;
};

export function parseDf(text: string): DfRow[] {
  const rows: DfRow[] = [];
  for (const line of text.split("\n").slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const [filesystem, size, used, avail, capacity, ...mountParts] = parts;
    const sizeBytes = Number(size);
    const usedBytes = Number(used);
    const availBytes = Number(avail);
    if (![sizeBytes, usedBytes, availBytes].every(Number.isFinite)) continue;
    const percent = Number(capacity.replace("%", ""));
    rows.push({
      filesystem,
      sizeBytes,
      usedBytes,
      availBytes,
      usedPercent: Number.isFinite(percent) ? percent : 0,
      mount: mountParts.join(" "),
    });
  }
  return rows;
}

export type LsblkDevice = {
  name?: string;
  type?: string;
  size?: number | string | null;
  ro?: boolean | string;
  rm?: boolean | string;
  fstype?: string | null;
  model?: string | null;
  tran?: string | null;
  mountpoints?: (string | null)[] | null;
  mountpoint?: string | null;
  children?: LsblkDevice[];
};

export function flattenLsblk(devices: LsblkDevice[] | undefined): LsblkDevice[] {
  const out: LsblkDevice[] = [];
  const walk = (list: LsblkDevice[] | undefined) => {
    for (const device of list ?? []) {
      out.push(device);
      walk(device.children);
    }
  };
  walk(devices);
  return out;
}

export function parseDefaultRouteInterface(routeText: string): string | null {
  for (const line of routeText.split("\n").slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2 && parts[1] === "00000000") return parts[0];
  }
  return null;
}

export function osReleaseName(text: string): string {
  const pretty = text.match(/^PRETTY_NAME="?(.*?)"?$/m);
  return pretty?.[1] ?? "Unknown OS";
}
