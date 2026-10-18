import type { ReactElement } from 'react';
export function WorkspaceStatus({state,message}:{state:'loading'|'error'|'empty';message?:string}):ReactElement {
 return <section className={'dt-panel dt-state-'+state} role={state==='error'?'alert':'status'} aria-live="polite">
  <h2>{state==='loading'?'Loading server workspace…':state==='empty'?'No authoritative workspace selected':'Server snapshot unavailable'}</h2>
  <p>{message??(state==='loading'?'Waiting for PostgreSQL-backed Judge state.':state==='empty'?'Select a Deal from the server Inbox.':'A trusted signed Judge session and local server database are required.')}</p>
  {state==='error'?<p>No local financial fallback is used. Mutating actions stay disabled until a fresh server snapshot is available.</p>:null}
 </section>;
}
