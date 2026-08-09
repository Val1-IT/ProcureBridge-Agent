"use client";

import { useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { EntityForm, type EntityFormValue } from "@/components/erp/entity-form";
import { EntityTable } from "@/components/erp/entity-table";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { upsertProduct, type ProductInput } from "@/lib/erp/commands/master-data";
import { authorize } from "@/lib/erp/permissions";
import type { Product } from "@/lib/erp/types";
import { formatCurrency } from "@/lib/format";

const blankProduct: ProductInput = { sku: "", name: "", unit: "unit", salePrice: 0, purchasePrice: 0, reorderPoint: 0, active: true };

export default function ProductsPage() {
  const { state } = useDemoStore();
  const { run } = useErpCommands();
  const [editing, setEditing] = useState<Product | null>(null);
  const canManage = authorize(state.erp.activeRole, "master.manage");
  const initial = editing ?? blankProduct;
  const submit = (values: Record<string, EntityFormValue>) => {
    const input: ProductInput = { ...(editing ? { id: editing.id } : {}), sku: String(values.sku), name: String(values.name), unit: String(values.unit), salePrice: Number(values.salePrice), purchasePrice: Number(values.purchasePrice), reorderPoint: Number(values.reorderPoint), active: Boolean(values.active) };
    const result = run((erp) => upsertProduct(erp, state.erp.activeRole, input, new Date().toISOString()));
    if (!result.ok) return result.error.message;
    setEditing(null);
    return null;
  };

  return <><PageHeader eyebrow="Master Data • Demo Data" title="Products" description="Kelola SKU, harga beli dan jual, satuan, serta titik pemesanan ulang melalui command ERP yang diaudit." /><div className="document-grid">
    <EntityTable rows={state.erp.products} searchLabel="Filter produk" emptyTitle="Produk tidak ditemukan." emptyDescription="Ubah kata pencarian atau tambahkan produk baru jika role Anda diizinkan." onEdit={canManage ? setEditing : undefined} columns={[
      { label: "Produk", searchValue: (row) => `${row.sku} ${row.name}`, render: (row) => <><span className="cell-title">{row.name}</span><span className="cell-sub mono">{row.sku}</span></> },
      { label: "Satuan", searchValue: (row) => row.unit, render: (row) => row.unit }, { label: "Harga beli", render: (row) => <span className="mono">{formatCurrency(row.purchasePrice)}</span> },
      { label: "Harga jual", render: (row) => <span className="mono">{formatCurrency(row.salePrice)}</span> }, { label: "Reorder", render: (row) => <span className="mono">{row.reorderPoint}</span> },
      { label: "Status", searchValue: (row) => row.active ? "aktif" : "nonaktif", render: (row) => <StatusChip tone={row.active ? "green" : "neutral"}>{row.active ? "Aktif" : "Nonaktif"}</StatusChip> },
    ]} />
    <EntityForm key={editing?.id ?? "new-product"} title={editing ? "Edit product" : "Tambah product"} description={canManage ? "Simpan perubahan melalui command master data." : "Role aktif memiliki akses baca saja."} fields={[
      { name: "sku", label: "SKU", required: true }, { name: "name", label: "Nama", required: true }, { name: "unit", label: "Satuan", required: true }, { name: "purchasePrice", label: "Harga beli", type: "number", min: 1, required: true },
      { name: "salePrice", label: "Harga jual", type: "number", min: 1, required: true }, { name: "reorderPoint", label: "Reorder point", type: "number", min: 0, required: true }, { name: "active", label: "Produk aktif", type: "checkbox" },
    ]} initialValues={{ sku: initial.sku, name: initial.name, unit: initial.unit, purchasePrice: initial.purchasePrice, salePrice: initial.salePrice, reorderPoint: initial.reorderPoint, active: initial.active }} submitLabel={editing ? "Simpan product" : "Tambah product"} disabled={!canManage} onSubmit={submit} onCancel={editing ? () => setEditing(null) : undefined} />
  </div></>;
}
