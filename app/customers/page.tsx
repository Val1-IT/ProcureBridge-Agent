"use client";

import { useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { EntityForm, type EntityFormValue } from "@/components/erp/entity-form";
import { EntityTable } from "@/components/erp/entity-table";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import type { CustomerInput } from "@/lib/erp/commands/master-data";
import { authorize } from "@/lib/erp/permissions";
import type { ErpCustomer } from "@/lib/erp/types";
import { formatCurrency } from "@/lib/format";

const blankCustomer: CustomerInput = { code: "", name: "", contactName: "", phone: "", email: "", address: "", creditLimit: 0, active: true };

export default function CustomersPage() {
  const { state } = useDemoStore(); const commands = useErpCommands(); const [editing, setEditing] = useState<ErpCustomer | null>(null);
  const canManage = authorize(state.erp.activeRole, "master.manage"); const initial = editing ?? blankCustomer;
  const submit = async (values: Record<string, EntityFormValue>) => { const input: CustomerInput = { ...(editing ? { id: editing.id } : {}), code: String(values.code), name: String(values.name), contactName: String(values.contactName), phone: String(values.phone), email: String(values.email), address: String(values.address), creditLimit: Number(values.creditLimit), active: Boolean(values.active) }; const result = await commands.upsertCustomer(input, new Date().toISOString()); if (!result.ok) return result.error.message; setEditing(null); return null; };
  return <><PageHeader eyebrow="Master Data • Demo Data" title="Customers" description="Kelola pelanggan, PIC, kontak, dan batas kredit untuk alur penjualan distributor." /><div className="document-grid">
    <EntityTable rows={state.erp.customers} searchLabel="Filter customer" emptyTitle="Customer tidak ditemukan." emptyDescription="Ubah kata pencarian atau tambahkan customer baru jika role Anda diizinkan." onEdit={canManage ? setEditing : undefined} columns={[
      { label: "Customer", searchValue: (row) => `${row.code} ${row.name}`, render: (row) => <><span className="cell-title">{row.name}</span><span className="cell-sub mono">{row.code}</span></> }, { label: "PIC", searchValue: (row) => row.contactName, render: (row) => row.contactName || "—" },
      { label: "Kontak", searchValue: (row) => `${row.phone} ${row.email}`, render: (row) => <><span className="cell-title">{row.phone}</span><span className="cell-sub">{row.email}</span></> }, { label: "Alamat", searchValue: (row) => row.address, render: (row) => row.address || "—" },
      { label: "Batas kredit", render: (row) => <span className="mono">{formatCurrency(row.creditLimit)}</span> }, { label: "Status", searchValue: (row) => row.active ? "aktif" : "nonaktif", render: (row) => <StatusChip tone={row.active ? "green" : "neutral"}>{row.active ? "Aktif" : "Nonaktif"}</StatusChip> },
    ]} />
    <EntityForm key={editing?.id ?? "new-customer"} title={editing ? "Edit customer" : "Tambah customer"} description={canManage ? "Kontak dan batas kredit divalidasi sebelum commit." : "Role aktif memiliki akses baca saja."} fields={[
      { name: "code", label: "Kode", required: true }, { name: "name", label: "Nama", required: true }, { name: "contactName", label: "Nama PIC" }, { name: "phone", label: "Telepon", type: "tel", required: true }, { name: "email", label: "Email", type: "email", required: true },
      { name: "address", label: "Alamat" }, { name: "creditLimit", label: "Batas kredit", type: "number", min: 0, required: true }, { name: "active", label: "Customer aktif", type: "checkbox" },
    ]} initialValues={{ code: initial.code, name: initial.name, contactName: initial.contactName, phone: initial.phone, email: initial.email, address: initial.address, creditLimit: initial.creditLimit, active: initial.active }} submitLabel={editing ? "Simpan customer" : "Tambah customer"} disabled={!canManage} onSubmit={submit} onCancel={editing ? () => setEditing(null) : undefined} />
  </div></>;
}
