import { readdir } from "node:fs/promises";
import { runCommand, readText } from "./exec";
import { buildSensorTable, parseIpmiSdr, type RawSensor } from "./sensors-model";
import type { SensorGroup, SensorReading } from "./types";

async function readHwmon(): Promise<RawSensor[]> {
  let entries: string[] = [];
  try {
    entries = await readdir("/sys/class/hwmon");
  } catch {
    return [];
  }
  const readings: RawSensor[] = [];
  for (const entry of entries) {
    const base = `/sys/class/hwmon/${entry}`;
    const chip = (await readText(`${base}/name`))?.trim() || entry;
    const files = await readdir(base).catch(() => []);
    for (const file of files) {
      const temp = file.match(/^temp(\d+)_input$/);
      const fan = file.match(/^fan(\d+)_input$/);
      const voltage = file.match(/^in(\d+)_input$/);
      const power = file.match(/^power(\d+)_input$/);
      const match = temp || fan || voltage || power;
      if (!match) continue;
      const raw = await readText(`${base}/${file}`);
      const number = Number(raw?.trim());
      if (!Number.isFinite(number)) continue;
      const index = match[1];
      const prefix = temp ? "temp" : fan ? "fan" : voltage ? "in" : "power";
      const label = (await readText(`${base}/${prefix}${index}_label`))?.trim() || `${chip} ${prefix}${index}`;
      if (temp) readings.push({ label, kind: "temp", value: number / 1000, source: "hwmon" });
      if (fan) readings.push({ label, kind: "fan", value: number, source: "hwmon" });
      if (voltage) readings.push({ label, kind: "voltage", value: number / 1000, source: "hwmon" });
      if (power) readings.push({ label, kind: "power", value: number / 1_000_000, source: "hwmon" });
    }
  }
  return readings;
}

async function readThermalZones(): Promise<RawSensor[]> {
  let zones: string[] = [];
  try {
    zones = await readdir("/sys/class/thermal");
  } catch {
    return [];
  }
  const readings: RawSensor[] = [];
  for (const zone of zones.filter((name) => name.startsWith("thermal_zone"))) {
    const [type, temp] = await Promise.all([
      readText(`/sys/class/thermal/${zone}/type`),
      readText(`/sys/class/thermal/${zone}/temp`),
    ]);
    const value = Number(temp?.trim());
    if (!type || !Number.isFinite(value)) continue;
    readings.push({ label: type.trim(), kind: "temp", value: value / 1000, source: "thermal" });
  }
  return readings;
}

async function readIpmi(): Promise<RawSensor[]> {
  const direct = await runCommand("ipmitool", ["sdr", "elist"], 2500);
  const text = direct.ok ? direct.stdout : (await runCommand("sudo", ["-n", "ipmitool", "sdr", "elist"], 2500)).stdout;
  return text ? parseIpmiSdr(text) : [];
}

export async function collectSensors(): Promise<SensorReading[]> {
  const groups = await Promise.all([readHwmon(), readThermalZones(), readIpmi()]);
  return buildSensorTable(groups.flat());
}

export function sensorsIn(readings: SensorReading[], group: SensorGroup): SensorReading[] {
  return readings.filter((reading) => reading.group === group);
}
