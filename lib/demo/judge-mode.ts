import type { SimulationSpeed } from "./simulation";

export type JudgeStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface JudgeDemoSession {
  active: boolean;
  step: JudgeStep;
  speed: SimulationSpeed;
  normalStoreSnapshot: string;
  restoreSnapshot: string | null;
}

export function createJudgeDemoSession(normalStoreSnapshot: string): JudgeDemoSession {
  return { active: true, step: 1, speed: "fast_demo", normalStoreSnapshot, restoreSnapshot: null };
}

export function advanceJudgeDemo(session: JudgeDemoSession): JudgeDemoSession {
  return { ...session, step: Math.min(7, session.step + 1) as JudgeStep };
}

export function restartJudgeDemo(session: JudgeDemoSession): JudgeDemoSession {
  return { ...session, active: true, step: 1, speed: "fast_demo", restoreSnapshot: null };
}

export function exitJudgeDemo(session: JudgeDemoSession): JudgeDemoSession {
  return { ...session, active: false, restoreSnapshot: session.normalStoreSnapshot };
}

