"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDemoStore } from "./demo-store-provider";
import { DemoBadge } from "./demo-badge";

const nav = [
  ["/dashboard", "Dashboard", "01"],
  ["/collections", "Collection Queue", "02"],
  ["/promises", "Promise Tracker", "03"],
  ["/disputes", "Dispute Center", "04"],
  ["/activity", "Call & Audit", "05"],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, dispatch, hydrated } = useDemoStore();

  const reset = () => {
    if (!window.confirm("Reset seluruh perubahan Demo Data ke kondisi awal? Tindakan ini hanya menghapus data simulasi di browser ini.")) return;
    dispatch({ type: "RESET" });
    router.push("/dashboard");
  };

  if (!hydrated) {
    return <main className="boot-screen"><div className="boot-mark">AP</div><p>Menyiapkan Demo Data dan policy engine…</p></main>;
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">AP</div>
          <div><span>Arvanta</span><strong>ProcureBridge</strong></div>
        </div>
        <DemoBadge />
        <nav aria-label="Navigasi utama">
          {nav.map(([href, label, index]) => (
            <Link key={href} href={href} className={pathname.startsWith(href) ? "nav-link active" : "nav-link"}>
              <span className="nav-index">{index}</span><span>{label}</span>
            </Link>
          ))}
        </nav>
        <section className="side-policy">
          <span className="eyebrow">Recovery policy</span>
          <strong>Human approval required</strong>
          <p>CALL-E hanya aktif setelah 8 pemeriksaan kebijakan lolos.</p>
        </section>
        <div className="sidebar-actions">
          <label className="switch-row">
            <span><strong>Fast Demo</strong><small>Transcript ±8 detik</small></span>
            <input type="checkbox" checked={state.demo.fastMode} onChange={(event) => dispatch({ type: "SET_FAST_MODE", value: event.target.checked })} />
          </label>
          <button className="button button-ghost button-full" onClick={reset}>Reset Demo Data</button>
        </div>
      </aside>
      <div className="main-column">
        <div className="topbar">
          <div><span className="live-dot" /> MockCallProvider aktif</div>
          <div className="operator"><span>NP</span><div><strong>Nadia Pratama</strong><small>Collections Manager</small></div></div>
        </div>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
