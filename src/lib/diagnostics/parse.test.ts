import assert from "node:assert/strict";
import test from "node:test";
import {
  flattenLsblk,
  parseBiosDate,
  parseColonTable,
  parseCpuRange,
  parseDefaultRouteInterface,
  parseDf,
  parseMeminfo,
} from "./parse.ts";

test("parseColonTable keeps vulnerability names", () => {
  const table = parseColonTable("Model name: Intel Xeon\nVulnerability Mds: Not affected\n");
  assert.equal(table["Model name"], "Intel Xeon");
  assert.equal(table["Vulnerability Mds"], "Not affected");
});

test("parseCpuRange counts ranges and singles", () => {
  assert.equal(parseCpuRange("0-3"), 4);
  assert.equal(parseCpuRange("0-1,4"), 3);
  assert.equal(parseCpuRange(""), null);
});

test("parseMeminfo converts kibibytes", () => {
  const info = parseMeminfo("MemTotal: 1024 kB\nMemAvailable: 512 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n");
  assert.equal(info.totalBytes, 1024 * 1024);
  assert.equal(info.availableBytes, 512 * 1024);
});

test("parseBiosDate accepts SMBIOS month/day/year", () => {
  const date = parseBiosDate("04/12/2024");
  assert.equal(date?.toISOString().slice(0, 10), "2024-04-12");
  assert.equal(parseBiosDate("not a date"), null);
});

test("parseDf reads the root row", () => {
  const rows = parseDf("Filesystem 1B-blocks Used Available Capacity Mounted on\n/dev/vdc 1000 400 600 40% /\n");
  assert.equal(rows[0]?.mount, "/");
  assert.equal(rows[0]?.usedPercent, 40);
});

test("flattenLsblk walks children", () => {
  const flat = flattenLsblk([{ name: "vda", children: [{ name: "vda1" }] }]);
  assert.deepEqual(flat.map((device) => device.name), ["vda", "vda1"]);
});

test("parseDefaultRouteInterface finds destination zero", () => {
  const text = "Iface Destination Gateway Flags\nenp0s3 00000000 0100A8C0 0003\n";
  assert.equal(parseDefaultRouteInterface(text), "enp0s3");
});
