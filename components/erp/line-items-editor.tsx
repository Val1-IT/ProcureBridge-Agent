"use client";

import type { Product, QuantityLine } from "@/lib/erp/types";
import { formatCurrency } from "@/lib/format";

export function LineItemsEditor({ products, lines, onChange, readOnly = false }: { products: readonly Product[]; lines: readonly QuantityLine[]; onChange: (lines: QuantityLine[]) => void; readOnly?: boolean }) {
  const update = (index: number, patch: Partial<QuantityLine>) => onChange(lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : { ...line }));
  const remove = (index: number) => onChange(lines.filter((_, lineIndex) => lineIndex !== index).map((line) => ({ ...line })));
  const add = () => {
    const product = products.find((item) => item.active && !lines.some((line) => line.productId === item.id));
    if (product) onChange([...lines.map((line) => ({ ...line })), { productId: product.id, quantity: 1, unitPrice: product.purchasePrice }]);
  };

  return <div className="line-items-editor">
    <div className="line-items-header"><strong>Item pembelian</strong>{!readOnly ? <button className="button button-secondary" type="button" onClick={add} disabled={!products.some((item) => item.active && !lines.some((line) => line.productId === item.id))}>Tambah item</button> : null}</div>
    {lines.length ? <div className="line-items-stack">{lines.map((line, index) => {
      const product = products.find((item) => item.id === line.productId);
      const productName = product?.name ?? "Produk tidak dikenal";
      return <div className="line-item-row" key={`${line.productId}-${index}`}>
        <label className="field"><span>Produk</span><select aria-label={`Produk baris ${index + 1}`} value={line.productId} disabled={readOnly} onChange={(event) => { const selected = products.find((item) => item.id === event.target.value); update(index, { productId: event.target.value, unitPrice: selected?.purchasePrice ?? line.unitPrice }); }}>{products.filter((item) => item.active || item.id === line.productId).map((item) => <option key={item.id} value={item.id}>{item.name} â€¢ {item.sku}</option>)}</select></label>
        <label className="field"><span>Jumlah</span><input aria-label={`Jumlah ${productName}`} type="number" min={1} step={1} value={line.quantity} readOnly={readOnly} onChange={(event) => update(index, { quantity: Number(event.target.value) })} /></label>
        <label className="field"><span>Harga satuan</span><input aria-label={`Harga satuan ${productName}`} type="number" min={1} value={line.unitPrice} readOnly={readOnly} onChange={(event) => update(index, { unitPrice: Number(event.target.value) })} /><small>{formatCurrency(line.unitPrice)} per {product?.unit ?? "unit"}</small></label>
        <div className="line-item-total"><span>Subtotal</span><strong>{formatCurrency(line.quantity * line.unitPrice)}</strong></div>
        {!readOnly ? <button className="button button-ghost line-remove" type="button" onClick={() => remove(index)} aria-label={`Hapus ${productName}`}>Hapus</button> : null}
      </div>;
    })}</div> : <div className="empty-state compact"><strong>Belum ada item.</strong><p>Tambahkan produk untuk menyiapkan dokumen pembelian.</p></div>}
  </div>;
}
