"use client";

import Link from "next/link";
import { useJudgeDemo } from "./judge-demo-provider";

const guidance = [
  "Start in the Collection Queue and locate the highlighted PT Sinar Jaya Retail invoice.",
  "Review the AI pre-call brief for invoice context, negotiation limits, and recommended tone.",
  "Complete both Human Approval checks, then save the approved brief.",
  "Use Start CALL-E to begin the clearly labeled simulated customer call.",
  "Watch the accelerated transcript and continue once the structured result is ready.",
  "Approve the extracted promise only after checking amount, date, and follow-up.",
  "Verify the promise in the tracker, then inspect the synchronized dashboard and Audit Log.",
] as const;

export function JudgeDemoGuide() {
  const { session, next, exit, restart, canAdvance } = useJudgeDemo();
  if (!session?.active) return null;
  return (
    <aside className="judge-guide" aria-label="Judge Demo Mode guide">
      <div className="judge-guide-head"><span>Judge Demo Mode</span><strong>Step {session.step} of 7</strong></div>
      <div className="judge-progress" aria-hidden="true"><span style={{ width: `${(session.step / 7) * 100}%` }} /></div>
      <p>{guidance[session.step - 1]}</p>
      {!canAdvance ? <small>{session.step === 3 ? "Save the Human Approval to unlock Next." : session.step === 4 ? "Start the call from this page." : session.step === 5 ? "Complete the simulated call first." : "Approve the structured result first."}</small> : null}
      <div className="judge-actions">
        {session.step < 7 ? <button className="button" disabled={!canAdvance} onClick={next}>Next →</button> : <><Link className="button" href="/activity">Open Audit Log</Link><Link className="button button-secondary" href="/dashboard">Dashboard</Link></>}
        <button className="text-button" onClick={restart}>Restart Demo</button>
        <button className="text-button" onClick={exit}>Exit Demo</button>
      </div>
    </aside>
  );
}
