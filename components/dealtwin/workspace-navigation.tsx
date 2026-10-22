'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useWorkspace} from './workspace-provider';
import {workflowLinks} from '../../lib/dealtwin/ui/selection';
export function WorkspaceNavigation(){
 const {selectedDealId}=useWorkspace();const links=workflowLinks(selectedDealId||null);const pathname=usePathname();
 return <nav aria-label="DealTwin workflows"><Link href="/dealtwin/judge" aria-current={pathname==='/dealtwin/judge'?'page':undefined}>Judge Mode</Link><Link href="/dealtwin/alexa" aria-current={pathname==='/dealtwin/alexa'?'page':undefined}>Alexa+</Link><Link href="/dealtwin" aria-current={pathname==='/dealtwin'?'page':undefined}>Deal Inbox</Link><Link href={links.ledger} aria-current={pathname==='/dealtwin/commitments'?'page':undefined}>Commitment Ledger</Link><Link href={links.erp} aria-current={pathname==='/dealtwin/erp'?'page':undefined}>ERP Sandbox</Link></nav>;
}
