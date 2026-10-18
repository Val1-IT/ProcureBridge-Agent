import { createSeedState } from "./seed";
import { createDemoSessionId } from "./session";
import {
  classifyDemoStorageEvent,
  createDemoStoreEnvelope,
  type DemoServerResetResult,
  type DemoStoreEnvelope,
  type DemoStoreResetResult,
} from "./persistence-coordinator";

export type DemoResetLifecycleResult = DemoStoreResetResult;

interface DemoStorageEventHandlers {
  accept: (envelope: DemoStoreEnvelope) => void;
  conflict: () => void;
  clearJudgeSession: () => void;
}

export function createFreshRecoveryEnvelope(): DemoStoreEnvelope {
  return createDemoStoreEnvelope(createSeedState(createDemoSessionId()));
}

export function handleValidatedDemoStorageEvent(
  current: DemoStoreEnvelope,
  incoming: DemoStoreEnvelope,
  handlers: DemoStorageEventHandlers,
): ReturnType<typeof classifyDemoStorageEvent> {
  const classification = classifyDemoStorageEvent(current, incoming);
  if (classification === "conflict") {
    handlers.conflict();
    return classification;
  }
  if (classification === "apply" || classification === "remote_reset") {
    handlers.accept(incoming);
    if (classification === "remote_reset") handlers.clearJudgeSession();
  }
  return classification;
}

export async function runDemoResetLifecycle({
  current,
  invalidateServer,
  reset,
}: {
  current: DemoStoreEnvelope;
  invalidateServer: (demoSessionId: string) => Promise<DemoServerResetResult>;
  reset: (
    expected: DemoStoreEnvelope,
    invalidate: (demoSessionId: string) => Promise<DemoServerResetResult>,
  ) => Promise<DemoStoreResetResult>;
}): Promise<DemoResetLifecycleResult> {
  try {
    return await reset(current, invalidateServer);
  } catch {
    return { ok: false, reason: "LOCK_UNAVAILABLE", current };
  }
}

export type GuideReplayServerResult =
  | { ok: true }
  | { ok: false; error: string };

export async function runGuideReplayTransition({
  restartServer,
  transition,
  reportConflict,
}: {
  restartServer: () => Promise<GuideReplayServerResult>;
  transition: () => Promise<boolean>;
  reportConflict: (message: string) => void;
}): Promise<boolean> {
  let restarted: GuideReplayServerResult;
  try {
    restarted = await restartServer();
  } catch {
    restarted = { ok: false, error: "Unable to reset Supplier Agent replay safely." };
  }
  if (!restarted.ok) {
    reportConflict(restarted.error);
    return false;
  }
  return transition();
}
