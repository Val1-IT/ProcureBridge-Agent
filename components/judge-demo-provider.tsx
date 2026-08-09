"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoStore } from "./demo-store-provider";
import {
  advanceJudgeDemo,
  exitJudgeDemo,
  restartJudgeDemo,
  type JudgeDemoSession,
} from "@/lib/demo/judge-mode";
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
import { deserializeDemoState } from "@/lib/demo/persistence";
import type { SimulationSpeed } from "@/lib/demo/simulation";

const JUDGE_SESSION_KEY = "arvanta-procurebridge-judge-session-v1";
type ActiveJudgeSession = ErpJudgeSession | JudgeDemoSession;

interface JudgeDemoValue {
  session: ActiveJudgeSession | null;
  start: () => void;
  startFallback: () => void;
  next: () => void;
  exit: () => void;
  restart: () => void;
  resetDemo: () => void;
  setSpeed: (speed: SimulationSpeed) => void;
  canAdvance: boolean;
}

const JudgeDemoContext = createContext<JudgeDemoValue | null>(null);

function isErpSession(session: ActiveJudgeSession): session is ErpJudgeSession {
  return typeof session.step === "string";
}

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

export function JudgeDemoProvider({ children }: { children: React.ReactNode }) {
  const { state, dispatch, hydrated } = useDemoStore();
  const router = useRouter();
  const [session, setSession] = useState<ActiveJudgeSession | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    const stored = window.sessionStorage.getItem(JUDGE_SESSION_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as ActiveJudgeSession;
      if (parsed.active && (typeof parsed.step === "number" ? Boolean(parsed.normalStoreSnapshot) : parsed.providerMode === "mock" && Boolean(parsed.preDemoSnapshot))) setSession(parsed);
      else window.sessionStorage.removeItem(JUDGE_SESSION_KEY);
    } catch {
      window.sessionStorage.removeItem(JUDGE_SESSION_KEY);
    }
  }, [hydrated]);

  useEffect(() => {
    if (!session) return;
    window.sessionStorage.setItem(JUDGE_SESSION_KEY, JSON.stringify(session));
  }, [session]);

  const snapshotBeforePrimaryDemo = useCallback(() => {
    if (!session?.active) return state;
    return isErpSession(session) ? session.preDemoSnapshot : deserializeDemoState(session.normalStoreSnapshot);
  }, [session, state]);

  const start = useCallback(() => {
    const started = startErpJudgeSession(snapshotBeforePrimaryDemo());
    dispatch({ type: "HYDRATE", state: started.state });
    setSession(started.session);
    router.push(erpStepHref(started.session.step));
  }, [dispatch, router, snapshotBeforePrimaryDemo]);

  const startFallback = useCallback(() => {
    const started = startPresentationFallback(snapshotBeforePrimaryDemo());
    dispatch({ type: "HYDRATE", state: started.state });
    setSession(started.session);
    router.push(erpStepHref(started.session.step));
  }, [dispatch, router, snapshotBeforePrimaryDemo]);

  const exit = useCallback(() => {
    if (session) {
      const restored = isErpSession(session) ? exitErpJudgeSession(session) : deserializeDemoState(exitJudgeDemo(session).restoreSnapshot ?? session.normalStoreSnapshot);
      dispatch({ type: "HYDRATE", state: restored });
    }
    window.sessionStorage.removeItem(JUDGE_SESSION_KEY);
    setSession(null);
    router.push("/");
  }, [dispatch, router, session]);

  const restart = useCallback(() => {
    if (!session) return;
    if (isErpSession(session)) {
      const restarted = restartErpJudgeSession(session);
      dispatch({ type: "HYDRATE", state: restarted.state });
      setSession(restarted.session);
      router.push(erpStepHref(restarted.session.step));
      return;
    }
    const restarted = restartJudgeDemo(session);
    dispatch({ type: "RESET" });
    dispatch({ type: "SET_SIMULATION_SPEED", value: restarted.speed });
    setSession(restarted);
    router.push("/collections");
  }, [dispatch, router, session]);

  const resetDemo = useCallback(() => {
    dispatch({ type: "RESET" });
    window.sessionStorage.removeItem(JUDGE_SESSION_KEY);
    setSession(null);
    router.push("/dashboard");
  }, [dispatch, router]);

  const canAdvance = useMemo(() => {
    if (!session) return false;
    if (isErpSession(session)) return canAdvanceErpJudgeSession(session, state);
    if (session.step === 3) return state.approvals.some((item) => item.callId === "call-sinar");
    if (session.step === 4) return state.calls.some((item) => item.id === "call-sinar");
    if (session.step === 5) return state.calls.some((item) => item.id === "call-sinar" && item.status === "result_pending_review");
    if (session.step === 6) return state.pendingResults.some((item) => item.callId === "call-sinar" && item.reviewStatus === "approved");
    return true;
  }, [session, state]);

  const next = useCallback(() => {
    if (!session || !canAdvance) return;
    if (isErpSession(session)) {
      const advanced = advanceErpJudgeSession(session, state);
      setSession(advanced);
      router.push(erpStepHref(advanced.step));
      return;
    }
    const advanced = advanceJudgeDemo(session);
    setSession(advanced);
    if (advanced.step === 2) router.push("/invoices/inv-sinar");
    if (advanced.step === 4) router.push("/invoices/inv-sinar");
    if (advanced.step === 5) router.push("/calls/call-sinar");
    if (advanced.step === 6) router.push("/calls/call-sinar/result");
    if (advanced.step === 7) router.push("/promises");
  }, [canAdvance, router, session, state]);

  const setSpeed = useCallback((speed: SimulationSpeed) => {
    dispatch({ type: "SET_SIMULATION_SPEED", value: speed });
    setSession((current) => current ? isErpSession(current) ? { ...current, simulationSpeed: speed } : { ...current, speed } : current);
  }, [dispatch]);

  const value = useMemo(() => ({ session, start, startFallback, next, exit, restart, resetDemo, setSpeed, canAdvance }), [session, start, startFallback, next, exit, restart, resetDemo, setSpeed, canAdvance]);
  return <JudgeDemoContext.Provider value={value}>{children}</JudgeDemoContext.Provider>;
}

export function useJudgeDemo(): JudgeDemoValue {
  const value = useContext(JudgeDemoContext);
  if (!value) throw new Error("useJudgeDemo must be used inside JudgeDemoProvider.");
  return value;
}
