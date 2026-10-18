"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DemoStorePrivateAuthority } from "./demo-store-provider";
import type { JudgeDemoSession } from "@/lib/demo/judge-mode";
import {
  advanceErpJudgeSession,
  canAdvanceErpJudgeSession,
  exitErpJudgeSession,
  restartErpJudgeSession,
  startErpJudgeSession,
  startPresentationFallback,
  type ErpJudgeSession,
  type ErpJudgeStep,
} from "@/lib/demo/erp-judge-mode";
import {
  createErpJudgeSessionEnvelope,
  deserializeJudgeSessionEnvelope,
  hasJudgeSessionOrigin,
  serializeJudgeSessionEnvelope,
  type ErpJudgeSessionEnvelope,
  type JudgeSessionOrigin,
} from "@/lib/demo/judge-session-envelope";
import type { SimulationSpeed } from "@/lib/demo/simulation";
import { runGuideReplayTransition } from "@/lib/demo/provider-lifecycle";
import { restartSupplierCallDemoSession } from "@/lib/supplier-call/browser-approval";

export const JUDGE_SESSION_KEY = "arvanta-distributor-mini-erp-judge-session-v1";
type ActiveJudgeSession = ErpJudgeSession | JudgeDemoSession;

interface JudgeDemoValue {
  session: ActiveJudgeSession | null;
  start: () => Promise<void>;
  startFallback: () => Promise<void>;
  next: () => void;
  exit: () => Promise<void>;
  restart: () => Promise<void>;
  resetDemo: () => Promise<void>;
  setSpeed: (speed: SimulationSpeed) => Promise<void>;
  canAdvance: boolean;
}

const JudgeDemoContext = createContext<JudgeDemoValue | null>(null);

function erpStepHref(step: ErpJudgeStep): string {
  switch (step) {
    case "sales_shortage": return "/sales/orders/so-router-shortage";
    case "purchase_order_approval": return "/purchasing/orders/po-router-replenishment";
    case "supplier_follow_up": return "/supplier-follow-up/po-router-replenishment";
    case "supplier_call": return "/supplier-calls/supplier-call-po-1";
    case "supplier_result_review": return "/supplier-calls/supplier-call-po-1/result";
    case "goods_receipt": return "/purchasing/receipts?purchaseOrderId=po-router-replenishment";
    case "sales_delivery": return "/sales/deliveries?salesOrderId=so-router-shortage";
    case "finance_sync": return "/finance/payables";
    case "partial_payment": return "/finance/payments";
    case "audit_evidence": return "/audit";
  }
}

function createGuideId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `guide-${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function JudgeDemoProvider({ children, authority }: { children: React.ReactNode; authority: DemoStorePrivateAuthority }) {
  const router = useRouter();
  const [storedSession, setStoredSession] = useState<ErpJudgeSessionEnvelope | null>(null);
  const session: ActiveJudgeSession | null = storedSession?.session ?? null;
  const origin = useMemo<JudgeSessionOrigin>(() => ({
    demoSessionId: authority.envelope.lineage.demoSessionId,
    resetGeneration: authority.envelope.lineage.resetGeneration,
  }), [authority.envelope.lineage.demoSessionId, authority.envelope.lineage.resetGeneration]);

  useEffect(() => {
    if (!authority.hydrated) return;
    const restored = deserializeJudgeSessionEnvelope(window.sessionStorage.getItem(JUDGE_SESSION_KEY), origin);
    if (restored) setStoredSession(restored);
    else {
      window.sessionStorage.removeItem(JUDGE_SESSION_KEY);
      setStoredSession(null);
    }
  }, [authority.hydrated, origin]);

  useEffect(() => {
    if (storedSession) window.sessionStorage.setItem(JUDGE_SESSION_KEY, serializeJudgeSessionEnvelope(storedSession));
  }, [storedSession]);

  useEffect(() => {
    if (!storedSession || hasJudgeSessionOrigin(storedSession, origin)) return;
    window.sessionStorage.removeItem(JUDGE_SESSION_KEY);
    setStoredSession(null);
  }, [storedSession, origin]);

  const snapshotBeforePrimaryDemo = useCallback(() => {
    return storedSession?.session.active ? structuredClone(storedSession.session.preDemoSnapshot) : authority.state;
  }, [storedSession, authority.state]);

  const runReplayTransition = useCallback((transition: () => Promise<boolean>) => runGuideReplayTransition({
    restartServer: () => restartSupplierCallDemoSession(origin.demoSessionId),
    transition,
    reportConflict: authority.reportConflict,
  }), [authority.reportConflict, origin.demoSessionId]);

  const begin = useCallback(async (fallback: boolean) => {
    await runReplayTransition(async () => {
      const started = fallback ? startPresentationFallback(snapshotBeforePrimaryDemo()) : startErpJudgeSession(snapshotBeforePrimaryDemo());
      if (!await authority.replaceState(started.state, "guide_start")) return false;
      const next = createErpJudgeSessionEnvelope(started.session, origin, createGuideId());
      setStoredSession(next);
      router.push(erpStepHref(started.session.step));
      return true;
    });
  }, [authority, origin, router, runReplayTransition, snapshotBeforePrimaryDemo]);

  const start = useCallback(async () => begin(false), [begin]);
  const startFallback = useCallback(async () => begin(true), [begin]);

  const exit = useCallback(async () => {
    await runReplayTransition(async () => {
      if (storedSession && !await authority.replaceState(exitErpJudgeSession(storedSession.session), "guide_exit")) return false;
      window.sessionStorage.removeItem(JUDGE_SESSION_KEY);
      setStoredSession(null);
      router.push("/");
      return true;
    });
  }, [authority, router, runReplayTransition, storedSession]);

  const restart = useCallback(async () => {
    if (!storedSession) return;
    await runReplayTransition(async () => {
      const restarted = restartErpJudgeSession(storedSession.session);
      if (!await authority.replaceState(restarted.state, "guide_restart")) return false;
      setStoredSession(createErpJudgeSessionEnvelope(restarted.session, storedSession.origin, storedSession.guideId));
      router.push(erpStepHref(restarted.session.step));
      return true;
    });
  }, [authority, router, runReplayTransition, storedSession]);

  const resetDemo = useCallback(async () => {
    if (!await authority.reset()) return;
    window.sessionStorage.removeItem(JUDGE_SESSION_KEY);
    setStoredSession(null);
    router.push("/dashboard");
  }, [authority, router]);

  const canAdvance = useMemo(() => {
    return storedSession ? canAdvanceErpJudgeSession(storedSession.session, authority.state) : false;
  }, [storedSession, authority.state]);

  const next = useCallback(() => {
    if (!canAdvance || !storedSession) return;
    const advanced = advanceErpJudgeSession(storedSession.session, authority.state);
    setStoredSession({ ...storedSession, session: advanced });
    router.push(erpStepHref(advanced.step));
  }, [canAdvance, router, storedSession, authority.state]);

  const setSpeed = useCallback(async (speed: SimulationSpeed) => {
    if (!await authority.dispatch({ type: "SET_SIMULATION_SPEED", value: speed })) return;
    setStoredSession((current) => current ? { ...current, session: { ...current.session, simulationSpeed: speed } } : current);
  }, [authority]);

  const value = useMemo(() => ({ session, start, startFallback, next, exit, restart, resetDemo, setSpeed, canAdvance }), [session, start, startFallback, next, exit, restart, resetDemo, setSpeed, canAdvance]);
  return <JudgeDemoContext.Provider value={value}>{children}</JudgeDemoContext.Provider>;
}

export function useJudgeDemo(): JudgeDemoValue {
  const value = useContext(JudgeDemoContext);
  if (!value) throw new Error("useJudgeDemo must be used inside JudgeDemoProvider.");
  return value;
}
