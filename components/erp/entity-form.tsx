"use client";

import { useState, type FormEvent } from "react";
import { upsertSupplier, upsertWarehouse, type SupplierInput, type WarehouseInput } from "@/lib/erp/commands/master-data";
import type { ErpRole, ErpState } from "@/lib/erp/types";

export type EntityFormValue = string | number | boolean;

export interface EntityFormField {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "number" | "checkbox";
  required?: boolean;
  min?: number;
}

export function submitSupplierForm(state: ErpState, role: ErpRole, input: SupplierInput, now: string) {
  return upsertSupplier(state, role, input, now);
}

export function submitWarehouseForm(state: ErpState, role: ErpRole, input: WarehouseInput, now: string) {
  return upsertWarehouse(state, role, input, now);
}

export function EntityForm({
  title,
  description,
  fields,
  initialValues,
  submitLabel,
  disabled = false,
  onSubmit,
  onCancel,
}: {
  title: string;
  description: string;
  fields: readonly EntityFormField[];
  initialValues: Record<string, EntityFormValue>;
  submitLabel: string;
  disabled?: boolean;
  onSubmit: (values: Record<string, EntityFormValue>) => string | null | Promise<string | null>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState(initialValues);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = await onSubmit(values);
    setMessage(error ? { tone: "error", text: error } : { tone: "success", text: "Perubahan tersimpan sebagai Demo Data dan dicatat di audit log." });
  };

  return (
    <form className="entity-form panel" onSubmit={submit}>
      <div className="panel-title"><div><h2>{title}</h2><p>{description}</p></div></div>
      <div className="entity-form-grid">
        {fields.map((field) => field.type === "checkbox" ? (
          <label className="entity-checkbox" key={field.name}>
            <input type="checkbox" checked={Boolean(values[field.name])} disabled={disabled} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.checked }))} />
            <span>{field.label}</span>
          </label>
        ) : (
          <label className="field" key={field.name}>
            <span>{field.label}</span>
            <input
              type={field.type ?? "text"}
              required={field.required}
              min={field.min}
              disabled={disabled}
              value={String(values[field.name] ?? "")}
              onChange={(event) => setValues((current) => ({ ...current, [field.name]: field.type === "number" ? Number(event.target.value) : event.target.value }))}
            />
          </label>
        ))}
      </div>
      {disabled ? <div className="operational-note">Role aktif memiliki akses baca saja untuk data ini.</div> : null}
      {message ? <div className={`form-message ${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</div> : null}
      <div className="entity-form-actions">
        <button className="button" type="submit" disabled={disabled}>{submitLabel}</button>
        {onCancel ? <button className="button button-secondary" type="button" onClick={onCancel}>Batal</button> : null}
      </div>
    </form>
  );
}
