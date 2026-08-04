import type { DemoState } from "../domain/types";
import { createSeedState } from "./seed";

export const DEMO_SCHEMA_VERSION = 1;
export const DEMO_STORAGE_KEY = "arvanta-procurebridge-demo-v1";

export function serializeDemoState(state: DemoState): string {
  return JSON.stringify(state);
}

export function deserializeDemoState(value: string | null): DemoState {
  if (!value) return createSeedState();
  try {
    const parsed = JSON.parse(value) as Partial<DemoState>;
    if (
      parsed.schemaVersion !== DEMO_SCHEMA_VERSION ||
      !Array.isArray(parsed.customers) ||
      !Array.isArray(parsed.invoices) ||
      !Array.isArray(parsed.auditLogs)
    ) {
      return createSeedState();
    }
    return parsed as DemoState;
  } catch {
    return createSeedState();
  }
}
