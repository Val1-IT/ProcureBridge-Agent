import type { ReactElement } from 'react';
export function WorkspaceStatus({state,message,onRetry,retrying=false}:{state:'loading'|'error'|'empty';message?:string;onRetry?:()=>void;retrying?:boolean}):ReactElement {
 return <section className={'dt-panel dt-state-'+state} role={state==='error'?'alert':'status'} aria-live="polite">
  <h2>{state==='loading'?'Loading server workspace…':state==='empty'?'No authoritative workspace selected':'Server snapshot unavailable'}</h2>
  <p>{message??(state==='loading'?'Waiting for PostgreSQL-backed Judge state.':state==='empty'?'Select a Deal from the server Inbox.':'A trusted signed Judge session and local server database are required.')}</p>
  {state==='error'?<><p>We could not verify the latest workspace. Reconnect and try again. Actions stay unavailable until fresh server state is loaded.</p>
   {onRetry?<button type="button" className="dt-button" onClick={onRetry} disabled={retrying}>{retrying?'Checking workspace…':'Try loading workspace again'}</button>:null}
   <p className="dt-muted">If access has expired, reopen the workspace through the trusted session launcher. Retrying does not grant access or reset your data.</p></>:null}
 </section>;
}
