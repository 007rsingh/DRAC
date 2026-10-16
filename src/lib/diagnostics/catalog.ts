import type { SectionId } from "./types";

export type TestDefinition = {
  id: string;
  section: SectionId;
  title: string;
  blurb: string;
};

export const SECTIONS: { id: SectionId | "overview"; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "bios", label: "BIOS & firmware" },
  { id: "cpu", label: "Processor" },
  { id: "memory", label: "Memory" },
  { id: "storage", label: "Storage" },
  { id: "network", label: "Network" },
];

export const TESTS: TestDefinition[] = [
  {
    id: "bios-smbios",
    section: "bios",
    title: "SMBIOS identity",
    blurb: "Reads vendor, version, and product strings from firmware tables.",
  },
  {
    id: "bios-date",
    section: "bios",
    title: "Firmware date",
    blurb: "Checks that the BIOS date parses and is not years out of date.",
  },
  {
    id: "bios-boot-mode",
    section: "bios",
    title: "Boot mode",
    blurb: "Reports UEFI or legacy BIOS from the firmware interface.",
  },
  {
    id: "cpu-online",
    section: "cpu",
    title: "Online processors",
    blurb: "Compares configured CPUs with the ones the kernel has online.",
  },
  {
    id: "cpu-compute",
    section: "cpu",
    title: "Compute sample",
    blurb: "Runs a short integer workload and checks that it finishes.",
  },
  {
    id: "cpu-mitigations",
    section: "cpu",
    title: "Speculative mitigations",
    blurb: "Flags CPU vulnerabilities the kernel still reports as vulnerable.",
  },
  {
    id: "memory-headroom",
    section: "memory",
    title: "Available memory",
    blurb: "Warns when free memory or swap is too tight for service work.",
  },
  {
    id: "memory-pattern",
    section: "memory",
    title: "Pattern sample",
    blurb: "Writes and reads a 32 MiB pattern. This is not a full memtest.",
  },
  {
    id: "storage-root-space",
    section: "storage",
    title: "Root filesystem space",
    blurb: "Checks used space on the root mount.",
  },
  {
    id: "storage-roundtrip",
    section: "storage",
    title: "Disk round trip",
    blurb: "Writes a temporary file, reads it back, and compares the hash.",
  },
  {
    id: "network-link",
    section: "network",
    title: "Link state",
    blurb: "Looks for a non-loopback interface that is up.",
  },
  {
    id: "network-route",
    section: "network",
    title: "Default route",
    blurb: "Confirms the kernel has a default route.",
  },
];

export function testsFor(section: SectionId): TestDefinition[] {
  return TESTS.filter((test) => test.section === section);
}
