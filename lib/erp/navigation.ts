import type { ErpRole } from "./types";

export interface ErpNavigationItem {
  href: string;
  label: string;
  allowedRoles: readonly ErpRole[];
}

export interface ErpNavigationGroup {
  label: "Overview" | "Purchasing" | "Inventory" | "Sales" | "Finance" | "Master Data" | "Control";
  items: ErpNavigationItem[];
}

const everyRole: readonly ErpRole[] = ["admin", "procurement", "warehouse", "sales", "finance", "approver"];
const operations: readonly ErpRole[] = ["admin", "procurement", "warehouse", "approver"];

const navigation: readonly ErpNavigationGroup[] = [
  { label: "Overview", items: [{ href: "/dashboard", label: "Dashboard", allowedRoles: everyRole }, { href: "/actions", label: "Action Center", allowedRoles: everyRole }] },
  {
    label: "Purchasing",
    items: [
      { href: "/purchasing/requests", label: "Purchase Requests", allowedRoles: operations },
      { href: "/purchasing/orders", label: "Purchase Orders", allowedRoles: operations },
      { href: "/purchasing/receipts", label: "Goods Receipts", allowedRoles: operations },
      { href: "/purchasing/follow-up", label: "Supplier Follow-up", allowedRoles: ["admin", "procurement", "approver"] },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/inventory", label: "Stock Overview", allowedRoles: everyRole },
      { href: "/inventory/adjustments", label: "Adjustments", allowedRoles: ["admin", "warehouse", "approver"] },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/sales/orders", label: "Sales Orders", allowedRoles: ["admin", "sales", "warehouse", "finance"] },
      { href: "/sales/deliveries", label: "Deliveries", allowedRoles: ["admin", "sales", "warehouse"] },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/finance/payables", label: "Payables", allowedRoles: ["admin", "finance"] },
      { href: "/finance/receivables", label: "Receivables", allowedRoles: ["admin", "finance", "sales"] },
      { href: "/finance/payments", label: "Payments", allowedRoles: ["admin", "finance"] },
    ],
  },
  {
    label: "Master Data",
    items: [
      { href: "/products", label: "Products", allowedRoles: everyRole },
      { href: "/suppliers", label: "Suppliers", allowedRoles: ["admin", "procurement", "warehouse", "approver"] },
      { href: "/customers", label: "Customers", allowedRoles: ["admin", "sales", "finance"] },
      { href: "/warehouse", label: "Warehouse", allowedRoles: everyRole },
    ],
  },
  {
    label: "Control",
    items: [
      { href: "/approvals", label: "Approvals", allowedRoles: ["admin", "approver"] },
      { href: "/audit", label: "Audit Log", allowedRoles: everyRole },
    ],
  },
];

export function buildErpNavigation(role: ErpRole): ErpNavigationGroup[] {
  return navigation.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.allowedRoles.includes(role)),
  })).filter((group) => group.items.length > 0);
}
