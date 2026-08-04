"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDemoStore } from "./demo-store-provider";
import {
  advanceJudgeDemo,
  createJudgeDemoSession,
  exitJudgeDemo,
  restartJudgeDemo,
  type JudgeDemoSession,
  type JudgeStep,
} from "@/lib/demo/judge-mode";
import { deserializeDemoState, serializeDemoState } from "@/lib/demo/persistence";
import type { SimulationSpeed } from "@/lib/demo/simulation";

const JUDGE_SESSION_KEY = "arvanta-procurebridge-judge-session-v1";

interface JudgeDemoValue {
  session: JudgeDemoSession | null;
  start: () => void;
  next: () => void;
  exit: () => void;
  restart: () => void;
  setSpeed: (speed: SimulationSpeed) => void;
  canAdvance: boolean;
}

const JudgeDemoContext = createContext<JudgeDemoValue | null>(null);

export function JudgeDemoProvider({ children }: { children: React.ReactNode }) {
  const { state, dispatch, hydrated } = useDemoStore();
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<JudgeDemoSession | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    const stored = window.sessionStorage.getItem(JUDGE_SESSION_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as JudgeDemoSession;
      if (parsed.active && parsed.normalStoreSnapshot) setSession(parsed);
    } catch {
      window.sessionStorage.removeItem(JUDGE_SESSION_KEY);
    }
  }, [hydrated]);

  useEffect(() => {
    if (!session) return;
    window.sessionStorage.setItem(JUDGE_SESSION_KEY, JSON.stringify(session));
  }, [session]);

  useEffect(() => {
    if (!session?.active) return;
    let step: JudgeStep | null = null;
    if (pathname.startsWith("/calls/") && pathname.endsWith("/result")) step = 6;
    else if (pathname.startsWith("/calls/")) step = 5;
    else if (["/promises", "/dashboard", "/activity", "/audit"].some((route) => pathname.startsWith(route)) && state.paymentCommitments.length) step = 7;
    if (step && session.step !== step) setSession((current) => current ? { ...current, step } : current);
  }, [pathname, session, state.paymentCommitments.length]);

  const start = useCallback(() => {
    if (session?.active) {
      dispatch({ type: "RESET" });
      dispatch({ type: "SET_SIMULATION_SPEED", value: "fast_demo" });
      setSession(restartJudgeDemo(session));
      router.push("/collections");
      return;
    }
    const next = createJudgeDemoSession(serializeDemoState(state));
    dispatch({ type: "RESET" });
    dispatch({ type: "SET_SIMULATION_SPEED", value: "fast_demo" });
    setSession(next);
    router.push("/collections");
  }, [dispatch, router, session, state]);

  const exit = useCallback(() => {
    if (session) {
      const ended = exitJudgeDemo(session);
      if (ended.restoreSnapshot) dispatch({ type: "HYDRATE", state: deserializeDemoState(ended.restoreSnapshot) });
    }
    window.sessionStorage.removeItem(JUDGE_SESSION_KEY);
    setSession(null);
    router.push("/");
  }, [dispatch, router, session]);

  const restart = useCallback(() => {
    if (!session) return;
    dispatch({ type: "RESET" });
    dispatch({ type: "SET_SIMULATION_SPEED", value: "fast_demo" });
    setSession(restartJudgeDemo(session));
    router.push("/collections");
  }, [dispatch, router, session]);

  const canAdvance = useMemo(() => {
    if (!session) return false;
    if (session.step === 3) return state.approvals.some((item) => item.callId === "call-sinar");
    if (session.step === 4) return state.calls.some((item) => item.id === "call-sinar");
    if (session.step === 5) return state.calls.some((item) => item.id === "call-sinar" && item.status === "result_pending_review");
    if (session.step === 6) return state.pendingResults.some((item) => item.callId === "call-sinar" && item.reviewStatus === "approved");
    return true;
  }, [session, state]);

  const next = useCallback(() => {
    if (!session || !canAdvance) return;
    const advanced = advanceJudgeDemo(session);
    setSession(advanced);
    if (advanced.step === 2) router.push("/invoices/inv-sinar");
    if (advanced.step === 4) router.push("/invoices/inv-sinar");
    if (advanced.step === 5) router.push("/calls/call-sinar");
    if (advanced.step === 6) router.push("/calls/call-sinar/result");
    if (advanced.step === 7) router.push("/promises");
  }, [canAdvance, router, session]);

  const setSpeed = useCallback((speed: SimulationSpeed) => {
    dispatch({ type: "SET_SIMULATION_SPEED", value: speed });
    setSession((current) => current ? { ...current, speed } : current);
  }, [dispatch]);

  const value = useMemo(() => ({ session, start, next, exit, restart, setSpeed, canAdvance }), [session, start, next, exit, restart, setSpeed, canAdvance]);
  return <JudgeDemoContext.Provider value={value}>{children}</JudgeDemoContext.Provider>;
}

export function useJudgeDemo(): JudgeDemoValue {
  const value = useContext(JudgeDemoContext);
  if (!value) throw new Error("useJudgeDemo must be used inside JudgeDemoProvider.");
  return value;
}
