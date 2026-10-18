'use client';
import Link from 'next/link';
import {useWorkspace} from './workspace-provider';
import {workflowLinks} from '../../lib/dealtwin/ui/selection';
export function WorkspaceNavigation(){
 const {selectedDealId}=useWorkspace();const links=workflowLinks(selectedDealId||null);
 return <nav aria-label="DealTwin workflows"><Link href="/dealtwin/judge">Judge Mode</Link><Link href="/dealtwin">Deal Inbox</Link><Link href={links.ledger}>Commitment Ledger</Link><Link href={links.erp}>ERP Sandbox</Link></nav>;
}
