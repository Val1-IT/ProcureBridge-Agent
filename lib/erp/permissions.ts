import type { ErpRole } from "./types";

export type ErpPermission =
  | "master.manage"
  | "purchase.write"
  | "purchase.approve"
  | "stock.receive"
  | "stock.deliver"
  | "stock.adjust"
  | "stock.adjust.approve"
  | "sales.write"
  | "finance.write"
  | "call.approve";

const allPermissions: readonly ErpPermission[] = [
  "master.manage",
  "purchase.write",
  "purchase.approve",
  "stock.receive",
  "stock.deliver",
  "stock.adjust",
  "stock.adjust.approve",
  "sales.write",
  "finance.write",
  "call.approve",
];

export const rolePermissions: Readonly<Record<ErpRole, readonly ErpPermission[]>> = {
  admin: allPermissions,
  procurement: ["master.manage", "purchase.write"],
  warehouse: ["stock.receive", "stock.deliver", "stock.adjust"],
  sales: ["sales.write"],
  finance: ["finance.write"],
  approver: ["purchase.approve", "stock.adjust.approve", "call.approve"],
};

export function authorize(role: ErpRole, permission: ErpPermission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}
