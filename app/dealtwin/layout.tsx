import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { WorkspaceProvider } from '../../components/dealtwin/workspace-provider';
import { WorkspaceNavigation } from '../../components/dealtwin/workspace-navigation';
import './dealtwin.css';
export const metadata:Metadata={title:{default:'DealTwin — Proof-carrying commerce',template:'%s | DealTwin'},description:'Synthetic server-backed financial compiler, immutable proofs and atomic planning commitments.'};
export default function DealTwinLayout({children}:{children:ReactNode}){
 return <WorkspaceProvider><div className="dt-root"><header className="dt-header"><Link className="dt-brand" href="/dealtwin"><span>DT</span><div><strong>DealTwin</strong><small>Proof-carrying commerce</small></div></Link>
  <WorkspaceNavigation/><span className="dt-synthetic">Synthetic · local Judge</span></header>
  <main className="dt-main">{children}</main><footer className="dt-footer">One deterministic compiler · PostgreSQL source of truth · signed server sessions · no local financial fallback</footer></div></WorkspaceProvider>;
}
