export const DASHBOARD_CLOCK_INTERVAL_MS = 60_000;

export type DashboardClockScheduler = (callback: () => void, intervalMs: number) => () => void;

const scheduleDashboardClock: DashboardClockScheduler = (callback, intervalMs) => {
  const timer = globalThis.setInterval(callback, intervalMs);
  return () => globalThis.clearInterval(timer);
};

export function sampleDashboardNow(): string {
  return new Date().toISOString();
}

export function startDashboardClock(
  sampleNow: () => string,
  publish: (now: string) => void,
  schedule: DashboardClockScheduler = scheduleDashboardClock,
): () => void {
  const tick = () => publish(sampleNow());
  tick();
  return schedule(tick, DASHBOARD_CLOCK_INTERVAL_MS);
}
