import type { ReactElement } from 'react';
import type { CompileResultDto } from '../../lib/dealtwin/ui/contracts';
import { formatRupiah } from './format';
export function CommitmentTimeline({result}:{result:CompileResultDto}):ReactElement {
 const events=result.timeline?.events??[];
 return <section className="dt-panel" aria-labelledby="timeline-heading"><div className="dt-panel-heading"><h2 id="timeline-heading">Dated cash events</h2><span>Server order · {events.length} events</span></div>
  <p className="dt-muted">Confirmed bank facts and projected / reserved planning capacity remain separate.</p>
  {events.length===0?<p role="status">No computed timeline available.</p>:<div className="dt-table-scroll"><table className="dt-table"><thead><tr><th>Date / order</th><th>Event</th><th>Class / certainty</th><th>Direction</th><th>Exact amount</th></tr></thead><tbody>
   {events.map(event=><tr key={event.eventId} data-certainty={event.certainty}><td><time dateTime={event.date}>{event.date}</time><small>order {event.sameDayOrder}</small></td><td>{event.eventId}<small>{event.dependencyKey}</small></td><td>{event.eventClass}<small>{event.certainty}</small></td><td>{event.direction}</td><td className="dt-money">{formatRupiah(event.amountRupiah)}</td></tr>)}
  </tbody></table></div>}
  {result.worstLiquidityPoint?<p className="dt-caption">Worst projected point: {result.worstLiquidityPoint.date} · {result.worstLiquidityPoint.eventId} · {formatRupiah(result.worstLiquidityPoint.projectedBalanceAfter)}</p>:null}
 </section>;
}
