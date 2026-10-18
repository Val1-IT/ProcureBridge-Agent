import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HydrationSafeActionCenter } from "../app/actions/page";
import { HydrationSafeDashboard } from "../app/dashboard/page";
import { createSeedState } from "../lib/demo/seed";
import { DASHBOARD_CLOCK_INTERVAL_MS, startDashboardClock } from "../lib/erp/dashboard-clock";

describe("Task 11 hydration-safe dashboard clock", () => {
  it("renders stable pre-mount shells without sampling the server or initial client clock", () => {
    const state = createSeedState();
    const sampleNow = vi.fn(() => "2026-08-09T10:00:00.000Z");

    const serverDashboard = renderToStaticMarkup(createElement(HydrationSafeDashboard, { state, hydrated: true, sampleNow }));
    const clientInitialDashboard = renderToStaticMarkup(createElement(HydrationSafeDashboard, { state, hydrated: true, sampleNow }));
    const serverActions = renderToStaticMarkup(createElement(HydrationSafeActionCenter, { state, hydrated: true, sampleNow }));

    expect(serverDashboard).toBe(clientInitialDashboard);
    expect(serverDashboard).toContain("Synchronizing current date");
    expect(serverActions).toContain("Synchronizing current date");
    expect(sampleNow).not.toHaveBeenCalled();
  });

  it("samples only after clock startup and refreshes on the bounded timer", () => {
    const sampleNow = vi.fn()
      .mockReturnValueOnce("2026-08-09T10:00:00.000Z")
      .mockReturnValueOnce("2026-08-09T10:01:00.000Z");
    const publish = vi.fn();
    const cancel = vi.fn();
    let tick: (() => void) | null = null;

    const stop = startDashboardClock(sampleNow, publish, (callback, intervalMs) => {
      tick = callback;
      expect(intervalMs).toBe(DASHBOARD_CLOCK_INTERVAL_MS);
      return cancel;
    });

    expect(publish).toHaveBeenLastCalledWith("2026-08-09T10:00:00.000Z");
    expect(tick).not.toBeNull();
    tick!();
    expect(publish).toHaveBeenLastCalledWith("2026-08-09T10:01:00.000Z");
    stop();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
