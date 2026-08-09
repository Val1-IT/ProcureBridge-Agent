"use client";

import Link from "next/link";
import { buildErpNavigation } from "@/lib/erp/navigation";
import type { ErpRole } from "@/lib/erp/types";

export function GroupedNav({ pathname, role }: { pathname: string; role: ErpRole }) {
  return (
    <nav aria-label="ERP navigation">
      {buildErpNavigation(role).map((group) => (
        <section className="nav-group" key={group.label}>
          <h2>{group.label}</h2>
          {group.items.map((item, index) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
            return <Link key={item.href} href={item.href} className={active ? "nav-link active" : "nav-link"}><span className="nav-index">{String(index + 1).padStart(2, "0")}</span><span>{item.label}</span></Link>;
          })}
        </section>
      ))}
    </nav>
  );
}
