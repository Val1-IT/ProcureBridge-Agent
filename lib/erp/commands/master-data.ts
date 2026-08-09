import type { ErpCommandResult } from "../errors";
import { authorize, type ErpPermission } from "../permissions";
import type { ErpCustomer, ErpRole, ErpState, Product, Supplier } from "../types";
import { appendErpAudit, commitErpState, isErpRole, rejectErpCommand } from "./shared";

export interface ProductInput {
  id?: string;
  sku: string;
  name: string;
  unit: string;
  salePrice: number;
  purchasePrice: number;
  reorderPoint: number;
  active: boolean;
}

export interface SupplierInput {
  id?: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  paymentTermDays: number;
  doNotContact: boolean;
  active: boolean;
}

export interface CustomerInput {
  id?: string;
  code: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  creditLimit: number;
  active: boolean;
}

function normalize(value: string): string {
  return value.trim();
}

function makeId(prefix: string, source: string, usedIds: readonly string[]): string {
  const stem = `${prefix}-${source.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "new"}`;
  let candidate = stem;
  let suffix = 2;
  while (usedIds.includes(candidate)) candidate = `${stem}-${suffix++}`;
  return candidate;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPhone(value: string): boolean {
  return /^\+?[0-9][0-9 .()-]{6,}$/.test(value);
}

function validateRole<T>(state: ErpState, role: ErpRole, permission: ErpPermission, noun: string): ErpCommandResult<T> | null {
  if (!isErpRole(role)) return rejectErpCommand(state, { code: "INVALID_INPUT", message: "Active role is invalid." });
  if (!authorize(role, permission)) return rejectErpCommand(state, { code: "FORBIDDEN", message: `You do not have permission to manage ${noun}.` });
  return null;
}

function invalid<T>(state: ErpState, message: string, details?: Record<string, string | number>): ErpCommandResult<T> {
  return rejectErpCommand(state, { code: "INVALID_INPUT", message, ...(details ? { details } : {}) });
}

function ensureTarget<T>(state: ErpState, id: string | undefined, existing: T | undefined): ErpCommandResult<T> | null {
  if (id && !existing) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Master-data record was not found." });
  return null;
}

export function upsertProduct(state: ErpState, role: ErpRole, input: ProductInput, now: string): ErpCommandResult<Product> {
  const authorization = validateRole<Product>(state, role, "master.manage", "products");
  if (authorization) return authorization;
  const current = input.id ? state.products.find((item) => item.id === input.id) : undefined;
  const target = ensureTarget<Product>(state, input.id, current);
  if (target) return target;
  const sku = normalize(input.sku);
  const name = normalize(input.name);
  const unit = normalize(input.unit);
  if (!sku || !name || !unit) return invalid(state, "Product SKU, name, and unit are required.");
  if (state.products.some((item) => item.id !== input.id && item.sku.toLowerCase() === sku.toLowerCase())) return invalid(state, "Product SKU must be unique.", { sku });
  if (!Number.isFinite(input.salePrice) || input.salePrice <= 0 || !Number.isFinite(input.purchasePrice) || input.purchasePrice <= 0) return invalid(state, "Product prices must be positive.");
  if (!Number.isFinite(input.reorderPoint) || input.reorderPoint < 0) return invalid(state, "Product reorder point cannot be negative.");
  const product: Product = {
    id: current?.id ?? makeId("product", sku, state.products.map((item) => item.id)),
    sku,
    name,
    unit,
    salePrice: input.salePrice,
    purchasePrice: input.purchasePrice,
    reorderPoint: input.reorderPoint,
    active: input.active,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
  const next = appendErpAudit({ ...state, products: current ? state.products.map((item) => item.id === current.id ? product : item) : [...state.products, product] }, {
    entityType: "product", entityId: product.id, action: "product.upserted", actorRole: role, actorId: `role:${role}`,
    detail: { sku: product.sku, operation: current ? "updated" : "created" },
  }, now);
  return commitErpState(state, next, product);
}

export function upsertSupplier(state: ErpState, role: ErpRole, input: SupplierInput, now: string): ErpCommandResult<Supplier> {
  const authorization = validateRole<Supplier>(state, role, "master.manage", "suppliers");
  if (authorization) return authorization;
  const current = input.id ? state.suppliers.find((item) => item.id === input.id) : undefined;
  const target = ensureTarget<Supplier>(state, input.id, current);
  if (target) return target;
  const code = normalize(input.code);
  const name = normalize(input.name);
  const phone = normalize(input.phone);
  const email = normalize(input.email);
  if (!code || !name) return invalid(state, "Supplier code and name are required.");
  if (state.suppliers.some((item) => item.id !== input.id && item.code.toLowerCase() === code.toLowerCase())) return invalid(state, "Supplier code must be unique.", { code });
  if (!isPhone(phone)) return invalid(state, "Supplier phone number is invalid.");
  if (!isEmail(email)) return invalid(state, "Supplier email is invalid.");
  if (!Number.isInteger(input.paymentTermDays) || input.paymentTermDays < 0) return invalid(state, "Supplier payment terms cannot be negative.");
  const supplier: Supplier = {
    id: current?.id ?? makeId("supplier", code, state.suppliers.map((item) => item.id)), code, name, phone, email,
    address: normalize(input.address), paymentTermDays: input.paymentTermDays, doNotContact: input.doNotContact, active: input.active,
    createdAt: current?.createdAt ?? now, updatedAt: now,
  };
  const next = appendErpAudit({ ...state, suppliers: current ? state.suppliers.map((item) => item.id === current.id ? supplier : item) : [...state.suppliers, supplier] }, {
    entityType: "supplier", entityId: supplier.id, action: "supplier.upserted", actorRole: role, actorId: `role:${role}`,
    detail: { code: supplier.code, operation: current ? "updated" : "created" },
  }, now);
  return commitErpState(state, next, supplier);
}

export function upsertCustomer(state: ErpState, role: ErpRole, input: CustomerInput, now: string): ErpCommandResult<ErpCustomer> {
  const authorization = validateRole<ErpCustomer>(state, role, "master.manage", "customers");
  if (authorization) return authorization;
  const current = input.id ? state.customers.find((item) => item.id === input.id) : undefined;
  const target = ensureTarget<ErpCustomer>(state, input.id, current);
  if (target) return target;
  const code = normalize(input.code);
  const name = normalize(input.name);
  const phone = normalize(input.phone);
  const email = normalize(input.email);
  if (!code || !name) return invalid(state, "Customer code and name are required.");
  if (state.customers.some((item) => item.id !== input.id && item.code.toLowerCase() === code.toLowerCase())) return invalid(state, "Customer code must be unique.", { code });
  if (!isPhone(phone)) return invalid(state, "Customer phone number is invalid.");
  if (!isEmail(email)) return invalid(state, "Customer email is invalid.");
  if (!Number.isFinite(input.creditLimit) || input.creditLimit < 0) return invalid(state, "Customer credit limit cannot be negative.");
  const customer: ErpCustomer = {
    id: current?.id ?? makeId("customer", code, state.customers.map((item) => item.id)), code, name,
    contactName: normalize(input.contactName), phone, email, address: normalize(input.address), creditLimit: input.creditLimit,
    active: input.active, createdAt: current?.createdAt ?? now, updatedAt: now,
  };
  const next = appendErpAudit({ ...state, customers: current ? state.customers.map((item) => item.id === current.id ? customer : item) : [...state.customers, customer] }, {
    entityType: "customer", entityId: customer.id, action: "customer.upserted", actorRole: role, actorId: `role:${role}`,
    detail: { code: customer.code, operation: current ? "updated" : "created" },
  }, now);
  return commitErpState(state, next, customer);
}

export function setActiveRole(state: ErpState, nextRole: ErpRole, now: string): ErpCommandResult<ErpRole> {
  if (!isErpRole(nextRole)) return rejectErpCommand(state, { code: "INVALID_INPUT", message: "Active role is invalid." });
  const next = appendErpAudit({ ...state, activeRole: nextRole }, {
    entityType: "demo_workspace", entityId: "erp-role", action: "demo.role_switched", actorRole: nextRole, actorId: `role:${nextRole}`,
    detail: { previousRole: state.activeRole, nextRole },
  }, now);
  return commitErpState(state, next, nextRole);
}
