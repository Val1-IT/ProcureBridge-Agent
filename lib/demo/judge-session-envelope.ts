import type { DemoState } from "../domain/types";
import {
  ERP_JUDGE_STEPS,
  type ErpJudgeSession,
  type ErpJudgeStep,
} from "./erp-judge-mode";
import { isValidDemoState } from "./persistence";
import { isValidDemoSessionId } from "./session";
import type { SimulationSpeed } from "./simulation";

export interface JudgeSessionOrigin {
  demoSessionId: string;
  resetGeneration: number;
}

export interface ErpJudgeSessionEnvelope {
  version: 1;
  mode: "erp";
  guideId: string;
  origin: JudgeSessionOrigin;
  session: ErpJudgeSession;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSpeed(value: unknown): value is SimulationSpeed {
  return value === "real_time" || value === "fast_demo" || value === "instant";
}

function isJudgeStep(value: unknown): value is ErpJudgeStep {
  return typeof value === "string" && ERP_JUDGE_STEPS.includes(value as ErpJudgeStep);
}

function isValidOrigin(value: unknown): value is JudgeSessionOrigin {
  return isRecord(value)
    && isValidDemoSessionId(value.demoSessionId)
    && Number.isSafeInteger(value.resetGeneration)
    && Number(value.resetGeneration) >= 0;
}

function isValidSession(value: unknown, origin: JudgeSessionOrigin): value is ErpJudgeSession {
  if (!isRecord(value)
    || value.active !== true
    || !isJudgeStep(value.step)
    || !isSpeed(value.simulationSpeed)
    || value.providerMode !== "mock"
    || typeof value.presentationFallback !== "boolean"
    || typeof value.demoClockIso !== "string"
    || Number.isNaN(Date.parse(value.demoClockIso))
    || !isValidDemoState(value.preDemoSnapshot)) return false;
  return value.preDemoSnapshot.demoSessionId === origin.demoSessionId;
}

export function createErpJudgeSessionEnvelope(
  session: ErpJudgeSession,
  origin: JudgeSessionOrigin,
  guideId: string,
): ErpJudgeSessionEnvelope {
  if (!isValidOrigin(origin) || !/^guide-[A-Za-z0-9_-]{6,120}$/.test(guideId) || !isValidSession(session, origin)) {
    throw new Error("Cannot create an invalid judge-session envelope.");
  }
  return { version: 1, mode: "erp", guideId, origin, session };
}

export function deserializeJudgeSessionEnvelope(
  raw: string | null,
  currentOrigin: JudgeSessionOrigin,
): ErpJudgeSessionEnvelope | null {
  if (!raw || !isValidOrigin(currentOrigin)) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)
      || value.version !== 1
      || value.mode !== "erp"
      || typeof value.guideId !== "string"
      || !/^guide-[A-Za-z0-9_-]{6,120}$/.test(value.guideId)
      || !isValidOrigin(value.origin)
      || value.origin.demoSessionId !== currentOrigin.demoSessionId
      || value.origin.resetGeneration !== currentOrigin.resetGeneration
      || !isValidSession(value.session, value.origin)) return null;
    return value as unknown as ErpJudgeSessionEnvelope;
  } catch {
    return null;
  }
}

export function serializeJudgeSessionEnvelope(envelope: ErpJudgeSessionEnvelope): string {
  return JSON.stringify(createErpJudgeSessionEnvelope(envelope.session, envelope.origin, envelope.guideId));
}

export function hasJudgeSessionOrigin(
  envelope: ErpJudgeSessionEnvelope,
  origin: JudgeSessionOrigin,
): boolean {
  return envelope.origin.demoSessionId === origin.demoSessionId
    && envelope.origin.resetGeneration === origin.resetGeneration;
}

export function cloneJudgeSnapshot(envelope: ErpJudgeSessionEnvelope): DemoState {
  return structuredClone(envelope.session.preDemoSnapshot);
}
