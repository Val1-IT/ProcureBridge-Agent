"use client";

import { useEffect, useMemo, useState } from "react";
import type { SimulationSpeed } from "@/lib/demo/simulation";
import { simulationSpeedOptions } from "@/lib/demo/simulation";
import { getSupplierScenarioTranscript } from "@/lib/supplier-call/scripts";
import type { SupplierCall } from "@/lib/erp/types";
import type { FinishSupplierCallSimulationInput } from "@/lib/erp/commands/supplier-results";
import { formatDuration } from "@/lib/format";

export function getSupplierSimulationInterval(speed: SimulationSpeed): number {
  if (speed === "instant") return 0;
  return speed === "fast_demo" ? 4_000 : 10_000;
}

export function TranscriptConsole({ call, speed, onSpeedChange, onComplete }: { call: SupplierCall; speed: SimulationSpeed; onSpeedChange: (speed: SimulationSpeed) => void; onComplete: (input: FinishSupplierCallSimulationInput) => void }) {
  const scripted = useMemo(() => getSupplierScenarioTranscript(call.scenario), [call.scenario]);
  const [visibleCount, setVisibleCount] = useState(call.status === "completed" ? scripted.length : call.transcript.length);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (call.status !== "active" || paused) return;
    if (speed === "instant" || visibleCount >= scripted.length) { onComplete({ visibleTranscript: scripted, elapsedSeconds: scripted.at(-1)?.offsetSeconds ?? 0 }); return; }
    const timer = window.setTimeout(() => setVisibleCount((count) => count + 1), getSupplierSimulationInterval(speed));
    return () => window.clearTimeout(timer);
  }, [call.status, onComplete, paused, scripted, speed, visibleCount]);
  const visible = call.status === "completed" ? call.transcript : scripted.slice(0, visibleCount);
  return <article className="call-panel transcript-panel">
    <div className="panel-title"><h2>Live transcript</h2><span>SIMULATION • MASKING ACTIVE</span></div>
    <label className="field"><span>Simulation speed</span><select value={speed} onChange={(event) => onSpeedChange(event.target.value as SimulationSpeed)}>{simulationSpeedOptions.map((option) => <option key={option.value} value={option.value}>{option.label} • {option.note.replace(" simulation", "")}</option>)}</select></label>
    <div className="transcript-feed" aria-live="polite">{visible.length ? visible.map((segment) => <div className={`transcript-line speaker-${segment.speaker.toLowerCase()}`} key={segment.id}><div><span>{segment.speaker}</span><time>{formatDuration(segment.offsetSeconds)}</time></div><p>{segment.text}</p></div>) : <div className="connecting-state"><span className="pulse-ring" /><strong>MockSupplierCallProvider simulation</strong><p>AI disclosure is always the first line. No external network or credential is required.</p></div>}</div>
    <div className="call-controls"><button className="button button-secondary" type="button" disabled={call.status !== "active"} onClick={() => setPaused((value) => !value)}>{paused ? "Resume AI" : "Pause AI"}</button><button className="button button-danger" type="button" disabled={call.status !== "active"} onClick={() => onComplete({ visibleTranscript: visible, elapsedSeconds: visible.at(-1)?.offsetSeconds ?? 0 })}>End Call</button></div>
  </article>;
}
