import type { PurchaseOrderStatus } from "@/lib/erp/types";

const mainSteps: ReadonlyArray<{ status: PurchaseOrderStatus; label: string }> = [
  { status: "draft", label: "Draft" },
  { status: "pending_approval", label: "Menunggu approval" },
  { status: "sent", label: "Dikirim" },
  { status: "confirmed", label: "Dikonfirmasi" },
  { status: "partially_received", label: "Diterima sebagian" },
  { status: "fully_received", label: "Diterima penuh" },
  { status: "completed", label: "Selesai" },
];

export function DocumentStatusTimeline({ currentStatus }: { currentStatus: PurchaseOrderStatus }) {
  const terminal = currentStatus === "rejected" || currentStatus === "cancelled";
  const activeIndex = mainSteps.findIndex((step) => step.status === currentStatus);
  return (
    <ol className="document-status-timeline" aria-label="Status dokumen pembelian">
      {mainSteps.map((step, index) => {
        const state = terminal ? "upcoming" : index < activeIndex ? "complete" : index === activeIndex ? "current" : "upcoming";
        return <li className={`timeline-step timeline-${state}`} key={step.status} {...(state === "current" ? { "aria-current": "step" as const } : {})}><span className="timeline-dot" aria-hidden="true" /><span>{step.label}</span></li>;
      })}
      {terminal ? <li className="timeline-step timeline-terminal" aria-current="step"><span className="timeline-dot" aria-hidden="true" /><span>{currentStatus === "rejected" ? "Ditolak" : "Dibatalkan"}</span></li> : null}
    </ol>
  );
}
