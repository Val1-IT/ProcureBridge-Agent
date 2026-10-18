import type { ReactElement } from 'react';
import type { CashEventDto } from '../../lib/dealtwin/ui/contracts';
import { formatRupiah } from './format';
export function ErpEvidence({openingCashRupiah,asOfDate,events,revision}:{openingCashRupiah:string;asOfDate:string;events:readonly CashEventDto[];revision:number}):ReactElement {
 return <section className="dt-panel" aria-labelledby="erp-heading"><div className="dt-panel-heading"><h2 id="erp-heading">ERP Sandbox Evidence</h2><span>PostgreSQL · revision {revision}</span></div>
  <p className="dt-muted">Synthetic server workspace only. No production account or real financial data.</p>
  <div className="dt-metrics"><div><span>Authoritative opening cash</span><strong data-testid="opening-cash">{formatRupiah(openingCashRupiah)}</strong></div><div><span>As of</span><strong>{asOfDate}</strong></div></div>
  {events.length===0?<p role="status">No source cash events in this workspace snapshot.</p>:<div className="dt-table-scroll" role="region" aria-label="ERP source cash events" tabIndex={0}><table className="dt-table"><thead><tr><th>Source event</th><th>Date</th><th>Certainty</th><th>Amount</th></tr></thead><tbody>{events.map(event=><tr key={event.eventId}><td>{event.eventId}<small>{event.dependencyKey}</small></td><td>{event.date}</td><td>{event.certainty} · {event.eventClass}</td><td>{formatRupiah(event.amountRupiah)}</td></tr>)}</tbody></table></div>}
 </section>;
}
