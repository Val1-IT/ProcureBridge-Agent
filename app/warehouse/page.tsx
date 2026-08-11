"use client";

import { useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { EntityForm, type EntityFormValue } from "@/components/erp/entity-form";
import { EntityTable } from "@/components/erp/entity-table";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import type { WarehouseInput } from "@/lib/erp/commands/master-data";
import type { Warehouse } from "@/lib/erp/types";

export default function WarehousePage() {
  const { state } = useDemoStore(); const commands = useErpCommands(); const [editing, setEditing] = useState<Warehouse | null>(null);
  const canManage = state.erp.activeRole === "admin"; const warehouse = editing ?? state.erp.warehouses[0];
  const submit = async (values: Record<string, EntityFormValue>) => { const input: WarehouseInput = { id: warehouse.id, code: String(values.code), name: String(values.name), address: String(values.address), active: true }; const result = await commands.upsertWarehouse(input, new Date().toISOString()); if (!result.ok) return result.error.message; setEditing(null); return null; };
  return <><PageHeader eyebrow="Master Data • Demo Data" title="Warehouse" description="Versi satu memakai satu gudang aktif. Semua role dapat melihat; hanya Admin dapat mengubah identitas gudang." /><div className="document-grid">
    <EntityTable rows={state.erp.warehouses} searchLabel="Filter warehouse" emptyTitle="Warehouse tidak tersedia." emptyDescription="Reset Demo Data untuk memulihkan satu warehouse aktif versi satu." onEdit={canManage ? setEditing : undefined} columns={[
      { label: "Warehouse", searchValue: (row) => `${row.code} ${row.name}`, render: (row) => <><span className="cell-title">{row.name}</span><span className="cell-sub mono">{row.code}</span></> }, { label: "Alamat", searchValue: (row) => row.address, render: (row) => row.address },
      { label: "Mode", render: () => <StatusChip tone="amber">Single warehouse</StatusChip> }, { label: "Status", searchValue: (row) => row.active ? "aktif" : "nonaktif", render: (row) => <StatusChip tone={row.active ? "green" : "neutral"}>{row.active ? "Aktif" : "Nonaktif"}</StatusChip> },
    ]} />
    {warehouse ? <EntityForm key={editing?.id ?? `warehouse-${state.erp.revision}`} title="Edit warehouse" description={canManage ? "Perubahan Admin melewati validasi dan audit. Warehouse versi satu selalu aktif." : "Role aktif memiliki akses baca saja."} fields={[{ name: "code", label: "Kode", required: true }, { name: "name", label: "Nama", required: true }, { name: "address", label: "Alamat", required: true }]} initialValues={{ code: warehouse.code, name: warehouse.name, address: warehouse.address }} submitLabel="Simpan warehouse" disabled={!canManage} onSubmit={submit} onCancel={editing ? () => setEditing(null) : undefined} /> : <section className="panel empty-state"><strong>Warehouse tidak tersedia.</strong><p>Gunakan Reset Demo Data untuk memulihkan seed yang aman.</p></section>}
  </div></>;
}
