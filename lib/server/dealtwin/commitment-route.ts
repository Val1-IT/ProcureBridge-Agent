import { requireJudgeSession } from '../auth/judge-session';
import { getJudgeRuntime } from './runtime';
import { JudgeHttpError, judgeRouteError, parseCommitmentRequest } from './request-contract';
export async function handleCommitmentRequest(request: Request, params: Promise<{dealId:string}>, operation: 'reserve' | 'commit'): Promise<Response> {
  try {
    const actor=await requireJudgeSession(request);
    if (actor.role!=='admin' && actor.role!=='sales') throw new JudgeHttpError(403,'FORBIDDEN_ROLE');
    const {dealId}=await params;
    if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(dealId)) throw new JudgeHttpError(422,'INVALID_REQUEST');
    const {expectedRevision,idempotencyKey,...proof}=await parseCommitmentRequest(request);
    const context={...actor,expectedRevision,idempotencyKey,now:new Date().toISOString()};
    const runtime=getJudgeRuntime();
    const result=await (operation==='reserve'?runtime.reserveLiquidity(context,{...proof,dealId}):runtime.commitDeal(context,{...proof,dealId}));
    return Response.json(result.body,{status:result.httpStatus,headers:{'cache-control':'no-store'}});
  } catch (error) { return judgeRouteError(error); }
}
