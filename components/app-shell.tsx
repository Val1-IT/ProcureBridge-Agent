"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDemoStore } from "./demo-store-provider";
import { DemoBadge } from "./demo-badge";
import { JudgeDemoGuide } from "./judge-demo-guide";
import { useJudgeDemo } from "./judge-demo-provider";
import { simulationSpeedOptions, type SimulationSpeed } from "@/lib/demo/simulation";

const nav = [
  ["/dashboard", "Dashboard", "01"],
  ["/collections", "Collection Queue", "02"],
  ["/promises", "Promise Tracker", "03"],
  ["/disputes", "Dispute Center", "04"],
  ["/activity", "Call & Audit", "05"],
  ["/architecture", "Architecture", "06"],
  ["/technical-notes", "Technical Notes", "07"],
  ["/submission", "Submission Hub", "08"],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, dispatch, hydrated } = useDemoStore();
  const { session, start, startFallback, setSpeed } = useJudgeDemo();

  const reset = () => {
    if (!window.confirm("Reset seluruh perubahan Demo Data ke kondisi awal? Tindakan ini hanya menghapus data simulasi di browser ini.")) return;
    dispatch({ type: "RESET" });
    router.push("/dashboard");
  };

  if (!hydrated) return <main className="boot-screen"><div className="boot-mark">AP</div><p>Preparing Demo Data and policy engine…</p></main>;
  if (pathname === "/") return <div className="landing-frame">{children}<JudgeDemoGuide /></div>;

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand-block" href="/">
          <div className="brand-mark">AP</div>
          <div><span>Arvanta</span><strong>ProcureBridge</strong></div>
        </Link>
        <DemoBadge />
        <nav aria-label="Main navigation">
          {nav.map(([href, label, index]) => (
            <Link key={href} href={href} className={pathname.startsWith(href) ? "nav-link active" : "nav-link"}>
              <span className="nav-index">{index}</span><span>{label}</span>
            </Link>
          ))}
        </nav>
        <section className="side-policy">
          <span className="eyebrow">Recovery policy</span>
          <strong>Human approval required</strong>
          <p>CALL-E activates only after all eight policy checks pass.</p>
        </section>
        <div className="sidebar-actions">
          <button className="button button-full" onClick={start}>Start 2-Minute Demo</button>
          <button className="button button-ghost button-full" onClick={startFallback}>Presentation Fallback</button>
          <label className="speed-control">
            <span>Simulation speed</span>
            <select value={state.demo.simulationSpeed} onChange={(event) => setSpeed(event.target.value as SimulationSpeed)}>
              {simulationSpeedOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <small>{simulationSpeedOptions.find((option) => option.value === state.demo.simulationSpeed)?.note} • Simulation</small>
          </label>
          <button className="button button-ghost button-full" onClick={reset}>Reset Demo Data</button>
        </div>
      </aside>
      <div className="main-column">
        <div className="topbar">
          <div><span className="live-dot" /> {session?.presentationFallback ? "Presentation Fallback — Demo Data" : "MockCallProvider active • Demo Data"}</div>
          <div className="operator"><span>NP</span><div><strong>Nadia Pratama</strong><small>Collections Manager</small></div></div>
        </div>
        <main className="page-content">{children}</main>
        <JudgeDemoGuide />
      </div>
    </div>
  );
}
