import type { SensorGroup, SensorReading, SensorState } from "./types";

export type RawKind = "temp" | "fan" | "voltage" | "power" | "intrusion" | "presence";

export type RawSensor = {
  label: string;
  kind: RawKind;
  value: number;
  source: string;
};

type Slot = {
  id: string;
  group: SensorGroup;
  name: string;
  unit: string;
  limit: string;
};

export const SENSOR_SLOTS: Slot[] = [
  { id: "inlet-temp", group: "temperature", name: "Inlet air", unit: "°C", limit: "Warning 35 °C, critical 42 °C" },
  { id: "exhaust-temp", group: "temperature", name: "Exhaust air", unit: "°C", limit: "Warning 60 °C, critical 75 °C" },
  { id: "cpu-temp", group: "temperature", name: "CPU package", unit: "°C", limit: "Warning 85 °C, critical 98 °C" },
  { id: "dimm-temp", group: "temperature", name: "DIMM", unit: "°C", limit: "Warning 82 °C, critical 90 °C" },
  { id: "board-temp", group: "temperature", name: "System board", unit: "°C", limit: "Warning 75 °C, critical 90 °C" },
  { id: "drive-temp", group: "temperature", name: "Drive bay", unit: "°C", limit: "Warning 50 °C, critical 60 °C" },
  { id: "gpu-temp", group: "temperature", name: "Accelerator", unit: "°C", limit: "Warning 85 °C, critical 95 °C" },
  { id: "fan-1", group: "fan", name: "System fan 1", unit: "RPM", limit: "Critical at 0 RPM" },
  { id: "fan-2", group: "fan", name: "System fan 2", unit: "RPM", limit: "Critical at 0 RPM" },
  { id: "fan-redundancy", group: "fan", name: "Fan redundancy", unit: "state", limit: "At least two fans spinning" },
  { id: "psu-1", group: "power", name: "Power supply 1", unit: "state", limit: "Present and healthy" },
  { id: "psu-2", group: "power", name: "Power supply 2", unit: "state", limit: "Present and healthy" },
  { id: "system-power", group: "power", name: "System power", unit: "W", limit: "Reading from the BMC" },
  { id: "power-redundancy", group: "power", name: "Power redundancy", unit: "state", limit: "Two healthy supplies" },
  { id: "v12", group: "voltage", name: "12 V rail", unit: "V", limit: "11.40–12.60 V" },
  { id: "v5", group: "voltage", name: "5 V rail", unit: "V", limit: "4.75–5.25 V" },
  { id: "v33", group: "voltage", name: "3.3 V rail", unit: "V", limit: "3.14–3.47 V" },
  { id: "vcore", group: "voltage", name: "CPU Vcore", unit: "V", limit: "0.50–1.60 V" },
  { id: "vbat", group: "voltage", name: "CMOS battery", unit: "V", limit: "Warning below 2.90 V" },
  { id: "intrusion", group: "chassis", name: "Chassis intrusion", unit: "state", limit: "Closed" },
];

export function classifySlot(label: string, kind: RawKind): string | null {
  const text = label.toLowerCase();
  if (kind === "temp") {
    if (/inlet|ambient|front|room/.test(text)) return "inlet-temp";
    if (/exhaust|rear|outlet/.test(text)) return "exhaust-temp";
    if (/dimm|dram/.test(text)) return "dimm-temp";
    if (/gpu|accel|nvidia|vga/.test(text)) return "gpu-temp";
    if (/hdd|ssd|nvme|drive|disk|bay/.test(text)) return "drive-temp";
    if (/pch|chipset|board|motherboard|system.?temp/.test(text)) return "board-temp";
    if (/cpu|package|core|proc|socket/.test(text)) return "cpu-temp";
    return null;
  }
  if (kind === "fan") {
    if (/redundant|redundancy/.test(text)) return "fan-redundancy";
    const number = text.match(/(\d+)/);
    if (number?.[1] === "2") return "fan-2";
    if (number?.[1] === "1") return "fan-1";
    return "fan-1";
  }
  if (kind === "presence") {
    const number = text.match(/(\d+)/);
    return number?.[1] === "2" ? "psu-2" : "psu-1";
  }
  if (kind === "power") return "system-power";
  if (kind === "intrusion") return "intrusion";
  if (kind === "voltage") {
    if (/vbat|cmos|coin|3vsb|vbatt/.test(text)) return "vbat";
    if (/vcore|vcpu|vdd/.test(text)) return "vcore";
    if (/3\.?3|vcc3/.test(text)) return "v33";
    if (/(^|[^0-9])5 ?v|vcc5/.test(text)) return "v5";
    if (/12 ?v|vcc12/.test(text)) return "v12";
    return null;
  }
  return null;
}

export function judge(id: string, value: number): SensorState {
  const high = (warn: number, crit: number) => (value >= crit ? "critical" : value >= warn ? "warning" : "ok");
  if (id === "inlet-temp") return high(35, 42);
  if (id === "exhaust-temp") return high(60, 75);
  if (id === "cpu-temp") return high(85, 98);
  if (id === "dimm-temp") return high(82, 90);
  if (id === "board-temp") return high(75, 90);
  if (id === "drive-temp") return high(50, 60);
  if (id === "gpu-temp") return high(85, 95);
  if (id === "fan-1" || id === "fan-2") return value <= 0 ? "critical" : value < 500 ? "warning" : "ok";
  if (id === "fan-redundancy" || id === "power-redundancy") return value >= 2 ? "ok" : "warning";
  if (id === "psu-1" || id === "psu-2") return value > 0 ? "ok" : "critical";
  if (id === "system-power") return value < 0 ? "critical" : "ok";
  if (id === "v12") return outside(value, 11.4, 12.6, 10.8, 13.2);
  if (id === "v5") return outside(value, 4.75, 5.25, 4.5, 5.5);
  if (id === "v33") return outside(value, 3.14, 3.47, 3.0, 3.6);
  if (id === "vcore") return outside(value, 0.5, 1.6, 0.4, 2.0);
  if (id === "vbat") return value < 2.5 ? "critical" : value < 2.9 ? "warning" : "ok";
  if (id === "intrusion") return value > 0 ? "critical" : "ok";
  return "ok";
}

function outside(value: number, warnLow: number, warnHigh: number, critLow: number, critHigh: number): SensorState {
  if (value < critLow || value > critHigh) return "critical";
  if (value < warnLow || value > warnHigh) return "warning";
  return "ok";
}

export function parseIpmiSdr(text: string): RawSensor[] {
  const readings: RawSensor[] = [];
  for (const line of text.split("\n")) {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 5) continue;
    const [label, , status, , reading] = parts;
    if (!label || /no reading|disabled|ns/i.test(reading)) continue;
    const degrees = reading.match(/(-?\d+(?:\.\d+)?)\s*degrees C/i);
    if (degrees) {
      readings.push({ label, kind: "temp", value: Number(degrees[1]), source: "ipmitool" });
      continue;
    }
    const rpm = reading.match(/(-?\d+(?:\.\d+)?)\s*RPM/i);
    if (rpm) {
      readings.push({ label, kind: "fan", value: Number(rpm[1]), source: "ipmitool" });
      continue;
    }
    const volts = reading.match(/(-?\d+(?:\.\d+)?)\s*Volts/i);
    if (volts) {
      readings.push({ label, kind: "voltage", value: Number(volts[1]), source: "ipmitool" });
      continue;
    }
    const watts = reading.match(/(-?\d+(?:\.\d+)?)\s*Watts/i);
    if (watts) {
      readings.push({ label, kind: "power", value: Number(watts[1]), source: "ipmitool" });
      continue;
    }
    if (/presence detected/i.test(reading) || (/psu|power supply/i.test(label) && /ok/i.test(status))) {
      readings.push({ label, kind: "presence", value: /fail|absent|not present/i.test(reading) ? 0 : 1, source: "ipmitool" });
      continue;
    }
    if (/intrusion/i.test(label)) {
      readings.push({
        label,
        kind: "intrusion",
        value: /ok|closed|normal/i.test(status) || /closed/i.test(reading) ? 0 : 1,
        source: "ipmitool",
      });
    }
  }
  return readings;
}

function formatValue(unit: string, value: number | null): string {
  if (value == null) return "Not exposed";
  if (unit === "°C") return `${value.toFixed(1)} °C`;
  if (unit === "RPM") return `${Math.round(value)} RPM`;
  if (unit === "V") return `${value.toFixed(2)} V`;
  if (unit === "W") return `${Math.round(value)} W`;
  if (unit === "state") return value > 0 ? "Healthy" : "Failed";
  return String(value);
}

export function buildSensorTable(raw: RawSensor[]): SensorReading[] {
  const chosen = new Map<string, RawSensor>();
  const fans: RawSensor[] = [];
  const psus: RawSensor[] = [];
  for (const reading of raw) {
    if (reading.kind === "fan" && !/redundant/.test(reading.label.toLowerCase())) {
      fans.push(reading);
      continue;
    }
    if (reading.kind === "presence") {
      psus.push(reading);
      continue;
    }
    const slot = classifySlot(reading.label, reading.kind);
    if (!slot) continue;
    const current = chosen.get(slot);
    const hotter = reading.kind === "temp" && current && reading.value > current.value;
    if (!current || hotter) chosen.set(slot, reading);
  }
  fans.sort((a, b) => a.label.localeCompare(b.label));
  if (fans[0]) chosen.set("fan-1", fans[0]);
  if (fans[1]) chosen.set("fan-2", fans[1]);
  if (fans.length > 0) {
    chosen.set("fan-redundancy", {
      label: "Fan redundancy",
      kind: "fan",
      value: fans.filter((fan) => fan.value > 0).length,
      source: fans[0].source,
    });
  }
  psus.sort((a, b) => a.label.localeCompare(b.label));
  if (psus[0]) chosen.set("psu-1", psus[0]);
  if (psus[1]) chosen.set("psu-2", psus[1]);
  if (psus.length > 0) {
    chosen.set("power-redundancy", {
      label: "Power redundancy",
      kind: "presence",
      value: psus.filter((psu) => psu.value > 0).length,
      source: psus[0].source,
    });
  }

  return SENSOR_SLOTS.map((slot) => {
    const reading = chosen.get(slot.id);
    if (!reading) {
      return {
        id: slot.id,
        group: slot.group,
        name: slot.name,
        unit: slot.unit,
        value: null,
        display: "Not exposed",
        state: "absent" as const,
        limit: slot.limit,
        source: null,
      };
    }
    const state = judge(slot.id, reading.value);
    const display =
      slot.id === "fan-redundancy" || slot.id === "power-redundancy"
        ? reading.value >= 2
          ? "Redundant"
          : "Single path"
        : slot.id === "intrusion"
          ? reading.value > 0
            ? "Open"
            : "Closed"
          : formatValue(slot.unit, reading.value);
    return {
      id: slot.id,
      group: slot.group,
      name: slot.name,
      unit: slot.unit,
      value: reading.value,
      display,
      state,
      limit: slot.limit,
      source: `${reading.source}: ${reading.label}`,
    };
  });
}

