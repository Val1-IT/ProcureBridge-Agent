"use client";

import { useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { EntityForm, submitSupplierForm, type EntityFormValue } from "@/components/erp/entity-form";
import { EntityTable } from "@/components/erp/entity-table";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import type { SupplierInput } from "@/lib/erp/commands/master-data";
import { authorize } from "@/lib/erp/permissions";
import type { Supplier } from "@/lib/erp/types";

const blankSupplier: SupplierInput = { code: "", name: "", phone: "", email: "", address: "", paymentTermDays: 30, doNotContact: false, active: true };

export default function SuppliersPage() {
  const { state } = useDemoStore(); const { run } = useErpCommands(); const [editing, setEditing] = useState<Supplier | null>(null);
  const canManage = authorize(state.erp.activeRole, "master.manage"); const initial = editing ?? blankSupplier;
  const submit = (values: Record<string, EntityFormValue>) => { const input: SupplierInput = { ...(editing ? { id: editing.id } : {}), code: String(values.code), name: String(values.name), phone: String(values.phone), email: String(values.email), address: String(values.address), paymentTermDays: Number(values.paymentTermDays), doNotContact: Boolean(values.doNotContact), active: Boolean(values.active) }; const result = run((erp) => submitSupplierForm(erp, state.erp.activeRole, input, new Date().toISOString())); if (!result.ok) return result.error.message; setEditing(null); return null; };
  return <><PageHeader eyebrow="Master Data • Demo Data" title="Suppliers" description="Kelola identitas pemasok, kontak operasional, termin pembayaran, dan kebijakan do-not-contact." /><div className="document-grid">
    <EntityTable rows={state.erp.suppliers} searchLabel="Filter supplier" emptyTitle="Supplier tidak ditemukan." emptyDescription="Ubah kata pencarian atau tambahkan supplier baru jika role Anda diizinkan." onEdit={canManage ? setEditing : undefined} columns={[
      { label: "Supplier", searchValue: (row) => `${row.code} ${row.name}`, render: (row) => <><span className="cell-title">{row.name}</span><span className="cell-sub mono">{row.code}</span></> },
      { label: "Kontak", searchValue: (row) => `${row.phone} ${row.email}`, render: (row) => <><span className="cell-title">{row.phone}</span><span className="cell-sub">{row.email}</span></> }, { label: "Alamat", searchValue: (row) => row.address, render: (row) => row.address || "—" },
      { label: "Termin", render: (row) => `${row.paymentTermDays} hari` }, { label: "Kontak AI", searchValue: (row) => row.doNotContact ? "dilarang" : "diizinkan", render: (row) => <StatusChip tone={row.doNotContact ? "red" : "blue"}>{row.doNotContact ? "Do not contact" : "Diizinkan"}</StatusChip> },
      { label: "Status", searchValue: (row) => row.active ? "aktif" : "nonaktif", render: (row) => <StatusChip tone={row.active ? "green" : "neutral"}>{row.active ? "Aktif" : "Nonaktif"}</StatusChip> },
    ]} />
    <EntityForm key={editing?.id ?? "new-supplier"} title={editing ? "Edit supplier" : "Tambah supplier"} description={canManage ? "Validasi telepon dan email dijalankan sebelum commit." : "Role aktif memiliki akses baca saja."} fields={[
      { name: "code", label: "Kode", required: true }, { name: "name", label: "Nama", required: true }, { name: "phone", label: "Telepon", type: "tel", required: true }, { name: "email", label: "Email", type: "email", required: true }, { name: "address", label: "Alamat" },
      { name: "paymentTermDays", label: "Termin (hari)", type: "number", min: 0, required: true }, { name: "doNotContact", label: "Do not contact", type: "checkbox" }, { name: "active", label: "Supplier aktif", type: "checkbox" },
    ]} initialValues={{ code: initial.code, name: initial.name, phone: initial.phone, email: initial.email, address: initial.address, paymentTermDays: initial.paymentTermDays, doNotContact: initial.doNotContact, active: initial.active }} submitLabel={editing ? "Simpan supplier" : "Tambah supplier"} disabled={!canManage} onSubmit={submit} onCancel={editing ? () => setEditing(null) : undefined} />
  </div></>;
}
