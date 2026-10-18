import type { ReactElement } from 'react';
import type { DealSummaryDto } from '../../lib/dealtwin/ui/contracts';
export function DealInbox({deals}:{deals:readonly DealSummaryDto[]}):ReactElement {
 return <section className="dt-panel" aria-labelledby="inbox-heading"><div className="dt-panel-heading"><h2 id="inbox-heading">Deal Inbox</h2><span>{deals.length} server records</span></div>
  {deals.length===0?<p role="status">No server Deals yet.</p>:<div className="dt-deal-list">{deals.map(deal=><a className="dt-deal-row" key={deal.id} href={'/dealtwin/deals/'+encodeURIComponent(deal.id)} aria-label={'Open '+deal.title}>
   <div><strong>{deal.title}</strong><small>{deal.id}</small></div><span className="dt-badge">{deal.status}</span><small>Sales Order: {deal.committedSalesOrderId??'Not committed'}</small>
  </a>)}</div>}</section>;
}
