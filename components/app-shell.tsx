"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { simulationSpeedOptions, type SimulationSpeed } from "@/lib/demo/simulation";
import { DemoBadge } from "./demo-badge";
import { useDemoStore } from "./demo-store-provider";
import { GroupedNav } from "./erp/grouped-nav";
import { formatErpRole, RoleSwitcher } from "./erp/role-switcher";
import { ErpDemoGuide } from "./erp-demo-guide";
import { JudgeDemoGuide } from "./judge-demo-guide";
import { useJudgeDemo } from "./judge-demo-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, hydrated, recoveryReason, dismissRecovery } = useDemoStore();
  const { session, start, startFallback, resetDemo, setSpeed } = useJudgeDemo();

  const reset = () => {
    if (!window.confirm("Reset seluruh perubahan Demo Data ke kondisi awal? Sesi browser baru akan dibuat dan hanya data simulasi lokal yang dihapus.")) return;
    resetDemo();
    dismissRecovery();
  };

  if (!hydrated) return <main className="boot-screen"><div className="boot-mark">AD</div><p>Preparing Distributor ERP Demo Data and command policies…</p></main>;
  if (pathname === "/") return <div className="landing-frame">{children}<ErpDemoGuide /><JudgeDemoGuide /></div>;

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand-block" href="/">
          <div className="brand-mark">AD</div>
          <div><span>Arvanta</span><strong>Distributor ERP</strong></div>
        </Link>
        <DemoBadge />
        <GroupedNav pathname={pathname} role={state.erp.activeRole} />
        <section className="side-policy">
          <span className="eyebrow">ERP command boundary</span>
          <strong>Role checks and audit required</strong>
          <p>Purchasing, stock, sales, finance, and Supplier Agent mutations commit atomically.</p>
        </section>
        <div className="sidebar-actions">
          <button className="button button-full" onClick={start}>Start Distributor Demo</button>
          <button className="button button-ghost button-full" onClick={startFallback}>Presentation Fallback</button>
          <label className="speed-control">
            <span>Simulation speed</span>
            <select value={state.demo.simulationSpeed} onChange={(event) => setSpeed(event.target.value as SimulationSpeed)}>
              {simulationSpeedOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <small>{simulationSpeedOptions.find((option) => option.value === state.demo.simulationSpeed)?.note} • Supplier calls remain simulated</small>
          </label>
          <button className="button button-ghost button-full" onClick={reset}>Reset Demo Data</button>
        </div>
      </aside>
      <div className="main-column">
        <div className="topbar">
          <div><span className="live-dot" /> {session?.presentationFallback ? "Presentation Fallback — Mock Demo Data" : "MockSupplierCallProvider active • Demo Data"}</div>
          <div className="topbar-role"><RoleSwitcher activeRole={state.erp.activeRole} /><div className="operator"><span>DO</span><div><strong>Demo Operator</strong><small>{formatErpRole(state.erp.activeRole)}</small></div></div></div>
        </div>
        {recoveryReason ? <section className="recovery-banner" role="alert"><div><strong>Browser data dipulihkan ke Demo Data yang aman.</strong><p>Data tersimpan tidak valid ({recoveryReason === "INVALID_JSON" ? "format JSON rusak" : "schema tidak dikenali"}) dan tidak digunakan. Legacy Recovery records remain supported when valid.</p></div><div><button className="button" type="button" onClick={reset}>Reset Demo Data</button><button className="button button-secondary" type="button" onClick={dismissRecovery} aria-label="Tutup pemberitahuan pemulihan">Tutup</button></div></section> : null}
        <main className="page-content">{children}</main>
        <ErpDemoGuide />
        <JudgeDemoGuide />
      </div>
    </div>
  );
}
