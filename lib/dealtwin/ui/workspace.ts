import type { DealVersion } from '../domain/deal';
import type { DealProofDto } from '../proof/proof-dto';
import type { ActorContext } from '../application/operation-contracts';
import type { ErpState } from '../../erp/types';
import type { CommandState } from './commands';
import type { CashEventDto } from './contracts';
import { ApiClientError } from './api-client';
export interface ServerWorkspace extends Omit<CommandState,'proofs'|'commitments'|'approvals'|'constraints'> {
 readonly schemaVersion:'dealtwin.judge-state.v1';readonly tenantId:'dealtwin-judge-v1';readonly synthetic:true;
 readonly actor?:Pick<ActorContext,'actorId'|'role'>;readonly versions:readonly DealVersion[];
 readonly proofs:readonly {id:string;status:string;stale_reason:string|null;replayed_at?:string|null;proof_json:DealProofDto}[];
 readonly compileRuns?:readonly {id:string;deal_version_id:string;kind:string;outcome:string;violation_data:{conflictingCommitmentIds?:readonly string[]}}[];
 readonly commitments:readonly {id:string;proof_id:string;deal_version_id:string;canonical_event_hash:string;status:string;amount_rupiah:string;direction:string;canonical_events:readonly CashEventDto[];expires_at:string|null}[];
 readonly approvals:readonly {id:string;proof_id:string;deal_version_id:string;requirement_code:string;status:string}[];
 readonly constraints:readonly {id:string;deal_version_id:string;kind:string;resolution:string;value:unknown}[];
 readonly cash:{openingBalanceRupiah:string;asOfDate:string};readonly timeline:{erpEvents:readonly CashEventDto[]};
 readonly erp:ErpState;
}
export function decodeWorkspace(value:unknown):ServerWorkspace {
 if(!value||typeof value!=='object')throw new ApiClientError('INVALID_SERVER_SNAPSHOT');
 const row=value as Record<string,unknown>;
 for(const key of ['deals','versions','proofs','commitments','approvals','constraints'])if(!Array.isArray(row[key]))throw new ApiClientError('INVALID_SERVER_SNAPSHOT');
 if(row.compileRuns!==undefined&&!Array.isArray(row.compileRuns))throw new ApiClientError('INVALID_SERVER_SNAPSHOT');
 if(!row.erp||typeof row.erp!=='object'||!row.timeline||typeof row.timeline!=='object'||!Array.isArray((row.timeline as {erpEvents?:unknown}).erpEvents))throw new ApiClientError('INVALID_SERVER_SNAPSHOT');
 return value as ServerWorkspace;
}
