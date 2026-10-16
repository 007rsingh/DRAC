export type Status = "pass" | "warn" | "fail" | "skip" | "info";

export type SectionId = "bios" | "cpu" | "memory" | "storage" | "network" | "sensors";

export type SensorGroup = "temperature" | "fan" | "power" | "voltage" | "chassis";

export type SensorState = "ok" | "warning" | "critical" | "absent";

export type SensorReading = {
  id: string;
  group: SensorGroup;
  name: string;
  unit: string;
  value: number | null;
  display: string;
  state: SensorState;
  limit: string;
  source: string | null;
};

export type Evidence = {
  label: string;
  value: string;
};

export type Finding = {
  id: string;
  section: SectionId;
  title: string;
  status: Status;
  summary: string;
  detail: string;
  durationMs: number;
  evidence: Evidence[];
};

export type HostInfo = {
  hostname: string;
  os: string;
  kernel: string;
  arch: string;
  uptimeSec: number;
  hypervisor: string | null;
  virtualized: boolean;
};

export type BiosInfo = {
  exposed: boolean;
  vendor: string | null;
  version: string | null;
  date: string | null;
  release: string | null;
  systemVendor: string | null;
  productName: string | null;
  productVersion: string | null;
  boardVendor: string | null;
  boardName: string | null;
  chassisType: string | null;
  bootMode: "uefi" | "legacy" | "unknown";
  source: string;
};

export type CpuInfo = {
  model: string;
  vendor: string;
  sockets: number | null;
  cores: number | null;
  threads: number | null;
  online: number | null;
  mhz: string | null;
  virtualization: string | null;
  vulnerabilities: { name: string; state: string }[];
};

export type MemoryInfo = {
  totalBytes: number;
  availableBytes: number;
  usedBytes: number;
  swapTotalBytes: number;
  swapFreeBytes: number;
};

export type DiskInfo = {
  name: string;
  type: string;
  sizeBytes: number | null;
  model: string | null;
  transport: string | null;
  readOnly: boolean;
  removable: boolean;
  filesystem: string | null;
  mountpoints: string[];
};

export type FilesystemInfo = {
  filesystem: string;
  mount: string;
  type: string | null;
  sizeBytes: number;
  usedBytes: number;
  availBytes: number;
  usedPercent: number;
};

export type StorageInfo = {
  disks: DiskInfo[];
  filesystems: FilesystemInfo[];
};

export type NicInfo = {
  name: string;
  operstate: string;
  address: string | null;
  speedMbps: number | null;
  virtual: boolean;
};

export type NetworkInfo = {
  interfaces: NicInfo[];
  defaultRouteInterface: string | null;
};

export type Inventory = {
  collectedAt: string;
  host: HostInfo;
  bios: BiosInfo;
  cpu: CpuInfo;
  memory: MemoryInfo;
  storage: StorageInfo;
  network: NetworkInfo;
  sensors: SensorReading[];
  notes: string[];
};

export type SuiteReport = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  findings: Finding[];
};
