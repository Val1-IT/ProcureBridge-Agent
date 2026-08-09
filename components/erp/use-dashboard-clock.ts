"use client";

import { useEffect, useState } from "react";
import { sampleDashboardNow, startDashboardClock } from "@/lib/erp/dashboard-clock";

export function useDashboardClock(hydrated: boolean, sampleNow: () => string = sampleDashboardNow): string | null {
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    return startDashboardClock(sampleNow, setNow);
  }, [hydrated, sampleNow]);

  return now;
}
