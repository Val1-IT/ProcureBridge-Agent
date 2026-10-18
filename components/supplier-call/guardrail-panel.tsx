import type { SupplierCallGuardrailCode, SupplierCallGuardrailDecision } from "@/lib/erp/guardrails/supplier-call";

const guardrails: Array<{ label: string; codes: SupplierCallGuardrailCode[] }> = [
  { label: "Approval lengkap dan cocok dengan PO", codes: ["APPROVAL_INCOMPLETE"] },
  { label: "Nomor telepon supplier valid", codes: ["INVALID_PHONE"] },
  { label: "Supplier tidak berstatus Do Not Contact", codes: ["DO_NOT_CONTACT"] },
  { label: "Waktu panggilan berada di jam 08:00–18:00", codes: ["OUTSIDE_CALLING_HOURS"] },
  { label: "Belum ada panggilan untuk PO ini hari ini", codes: ["ALREADY_CALLED_TODAY"] },
  { label: "Purchase Order masih terbuka dan layak dihubungi", codes: ["PURCHASE_ORDER_CLOSED", "PURCHASE_ORDER_NOT_ELIGIBLE"] },
  { label: "Kuantitas, harga, supplier, dan produk PO valid", codes: ["INVALID_ORDER_DATA"] },
  { label: "Tidak ada dispute terbuka yang memerlukan review", codes: ["OPEN_DISPUTE"] },
];

export function GuardrailPanel({ decision, pending = false }: { decision: SupplierCallGuardrailDecision; pending?: boolean }) {
  return <section className={`guardrail-box ${decision.allowed ? "allowed" : ""}`} aria-label="Supplier call guardrails">
    <div className="panel-title"><h3>8 mandatory guardrails</h3><span>{pending ? "CLOCK PENDING" : decision.allowed ? "8/8 PASS" : "CALL LOCKED"}</span></div>
    <div className="brief-list">{guardrails.map((guardrail) => {
      const blocked = pending || guardrail.codes.some((code) => decision.codes.includes(code));
      return <div className="brief-row" data-guardrail={guardrail.codes[0]} data-guardrail-status={blocked ? "block" : "pass"} key={guardrail.label}>
        <span>{blocked ? "BLOCK" : "PASS"}</span><p>{guardrail.label}</p>
      </div>;
    })}</div>
    {!decision.allowed ? <ul>{decision.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
  </section>;
}
