export type SimulationSpeed = "real_time" | "fast_demo" | "instant";

export const simulationSpeedOptions: Array<{ value: SimulationSpeed; label: string; note: string }> = [
  { value: "real_time", label: "Real-time", note: "30–45 sec simulation" },
  { value: "fast_demo", label: "Fast Demo", note: "12–18 sec simulation" },
  { value: "instant", label: "Instant Result", note: "Skip to structured result" },
];

export function getSimulationInterval(speed: SimulationSpeed): number {
  if (speed === "instant") return 0;
  if (speed === "fast_demo") return 2_000;
  return 5_000;
}

