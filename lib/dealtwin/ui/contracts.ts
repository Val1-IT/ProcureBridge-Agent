import type { Deal } from '../domain/deal';
import type { DealProofDto } from '../proof/proof-dto';
export type DealSummaryDto=Deal;
export interface CashEventDto {eventId:string;date:string;sameDayOrder:number;direction:'inflow'|'outflow';amountRupiah:string;certainty:string;eventClass:string;dependencyKey:string}
export interface CompileResultDto {
 outcome:'COMPILES'|'CONDITIONALLY_VALID'|'DOES_NOT_COMPILE'|'UNRESOLVED';reasonCode:string|null;firstViolationDate:string|null;cashFloorRupiah:string;shortfallRupiah:string|null;
 effectiveHorizonEnd:string;horizonExpanded:boolean;horizonExpansionEventIds:readonly string[];conflictingCommitmentIds:readonly string[];unresolvedConstraintIds:readonly string[];
 evaluations:readonly {constraintId:string;kind:string;status:string;reasonCode:string|null;violationDate:string|null;shortfallRupiah:string|null}[];
 worstLiquidityPoint:{eventId:string;date:string;projectedBalanceAfter:string;confirmedBalanceAfter:string}|null;
 timeline:{events:readonly CashEventDto[];minimumConfirmedBalance:string;minimumProjectedBalance:string}|null;
}
export interface ProofPresentation {proof:DealProofDto;currentStatus?:string;staleReason?:string|null;replay?:{replayed:boolean;historical?:{resultHash:string;recomputedResultHash:string}}|null}
