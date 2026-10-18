"use client";

import { useState } from "react";
import { useErpCommands } from "@/components/erp-command-provider";
import type { ErpRole } from "@/lib/erp/types";

const roles: Array<{ value: ErpRole; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "procurement", label: "Procurement" },
  { value: "warehouse", label: "Warehouse" },
  { value: "sales", label: "Sales" },
  { value: "finance", label: "Finance" },
  { value: "approver", label: "Approver" },
];

export function formatErpRole(role: ErpRole): string {
  return roles.find((item) => item.value === role)?.label ?? role;
}

export function RoleSwitcher({ activeRole }: { activeRole: ErpRole }) {
  const commands = useErpCommands();
  const [error, setError] = useState<string | null>(null);

  const changeRole = async (nextRole: ErpRole) => {
    const result = await commands.setActiveRole(nextRole, new Date().toISOString());
    setError(result.ok ? null : result.error.message);
  };

  return (
    <label className="role-switcher">
      <span>Active role</span>
      <select aria-label="Active ERP role" value={activeRole} onChange={(event) => changeRole(event.target.value as ErpRole)}>
        {roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
      </select>
      {error ? <small role="alert">{error}</small> : null}
    </label>
  );
}
