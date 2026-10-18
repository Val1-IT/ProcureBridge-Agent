import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { WorkspaceProvider } from '../../components/dealtwin/workspace-provider';
import { WorkspaceNavigation } from '../../components/dealtwin/workspace-navigation';
import './dealtwin.css';
export const metadata:Metadata={title:{default:'DealTwin — Proof-carrying commerce',template:'%s | DealTwin'},description:'Synthetic server-backed financial compiler, immutable proofs and atomic planning commitments.'};
export default function DealTwinLayout({children}:{children:ReactNode}){
 return <WorkspaceProvider><div className="dt-root"><a className="dt-skip-link" href="#dealtwin-main">Skip to workspace</a><header className="dt-header"><Link className="dt-brand" href="/dealtwin"><span>DT</span><div><strong>DealTwin</strong><small>Proof-carrying commerce</small></div></Link>
  <WorkspaceNavigation/><span className="dt-synthetic">Synthetic · local Judge</span></header>
  <main id="dealtwin-main" className="dt-main" tabIndex={-1}>{children}</main><footer className="dt-footer">Every deal should compile before you commit. · Synthetic business data · No real payments</footer></div></WorkspaceProvider>;
}
