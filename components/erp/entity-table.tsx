"use client";

import { useMemo, useState, type ReactNode } from "react";

export interface EntityColumn<T> {
  label: string;
  render: (row: T) => ReactNode;
  searchValue?: (row: T) => string;
}

export function EntityTable<T extends { id: string }>({
  rows,
  columns,
  searchLabel,
  emptyTitle,
  emptyDescription,
  onEdit,
}: {
  rows: readonly T[];
  columns: readonly EntityColumn<T>[];
  searchLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  onEdit?: (row: T) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) => columns.some((column) => column.searchValue?.(row).toLowerCase().includes(normalized)));
  }, [columns, query, rows]);

  return (
    <section className="entity-table-stack">
      <div className="erp-toolbar">
        <label className="field">
          <span>{searchLabel}</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari kode, nama, atau kontak…" />
        </label>
        <span>{filtered.length} dari {rows.length} data</span>
      </div>
      <div className="table-panel">
        {filtered.length ? (
          <table className="data-table">
            <thead><tr>{columns.map((column) => <th key={column.label}>{column.label}</th>)}{onEdit ? <th>Aksi</th> : null}</tr></thead>
            <tbody>{filtered.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column.label}>{column.render(row)}</td>)}{onEdit ? <td><button className="button button-secondary entity-edit-button" type="button" onClick={() => onEdit(row)}>Edit</button></td> : null}</tr>)}</tbody>
          </table>
        ) : <div className="empty-state"><strong>{emptyTitle}</strong><p>{emptyDescription}</p></div>}
      </div>
    </section>
  );
}
