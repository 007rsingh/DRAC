import assert from "node:assert/strict";
import test from "node:test";
import { buildSensorTable, classifySlot, judge, parseIpmiSdr } from "./sensors-model.ts";

test("classifySlot maps common BMC names", () => {
  assert.equal(classifySlot("Inlet Temp", "temp"), "inlet-temp");
  assert.equal(classifySlot("CPU1 Package", "temp"), "cpu-temp");
  assert.equal(classifySlot("12V", "voltage"), "v12");
  assert.equal(classifySlot("VBAT", "voltage"), "vbat");
  assert.equal(classifySlot("PSU2 Status", "presence"), "psu-2");
});

test("judge uses server thermal limits", () => {
  assert.equal(judge("cpu-temp", 70), "ok");
  assert.equal(judge("cpu-temp", 90), "warning");
  assert.equal(judge("inlet-temp", 44), "critical");
  assert.equal(judge("v12", 12.1), "ok");
  assert.equal(judge("vbat", 2.6), "warning");
  assert.equal(judge("intrusion", 1), "critical");
});

test("parseIpmiSdr reads temperature, fan, and presence", () => {
  const text = [
    "Inlet Temp | 01h | ok | 7.1 | 23 degrees C",
    "Fan1 | 30h | ok | 7.1 | 4200 RPM",
    "PS1 Status | 64h | ok | 10.1 | Presence detected",
    "VRM | 02h | ns | 7.1 | no reading",
  ].join("\n");
  const rows = parseIpmiSdr(text);
  assert.equal(rows.length, 3);
  assert.equal(rows[0]?.value, 23);
  assert.equal(rows[1]?.kind, "fan");
});

test("buildSensorTable marks missing BMC sensors as not exposed", () => {
  const table = buildSensorTable([]);
  assert.equal(table.length, 20);
  assert.ok(table.every((row) => row.state === "absent"));
});

test("buildSensorTable derives fan redundancy from two spinning fans", () => {
  const table = buildSensorTable([
    { label: "Fan1", kind: "fan", value: 4000, source: "ipmitool" },
    { label: "Fan2", kind: "fan", value: 3900, source: "ipmitool" },
  ]);
  const redundancy = table.find((row) => row.id === "fan-redundancy");
  assert.equal(redundancy?.display, "Redundant");
  assert.equal(redundancy?.state, "ok");
});
