import { requireJudgeSession } from '@/lib/server/auth/judge-session';
import { getJudgeRuntime } from '@/lib/server/dealtwin/runtime';
import { JudgeHttpError, judgeRouteError, parseCommitmentLifecycleRequest } from '@/lib/server/dealtwin/request-contract';

export async function POST(request: Request, context: { params: Promise<{ commitmentId: string }> }): Promise<Response> {
  try {
    const actor = await requireJudgeSession(request);
    if (actor.role !== 'admin' && actor.role !== 'sales') throw new JudgeHttpError(403, 'FORBIDDEN_ROLE');
    const { commitmentId } = await context.params;
    if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(commitmentId)) throw new JudgeHttpError(422, 'INVALID_REQUEST');
    const { action, expectedRevision, idempotencyKey, ...proof } = await parseCommitmentLifecycleRequest(request);
    const mutation = { ...actor, expectedRevision, idempotencyKey, now: new Date().toISOString() };
    const input = { ...proof, commitmentId };
    const runtime = getJudgeRuntime();
    const result = await (action === 'release' ? runtime.releaseCommitment(mutation, input)
      : action === 'expire' ? runtime.expireCommitment(mutation, input) : runtime.cancelCommitment(mutation, input));
    return Response.json(result.body, { status: result.httpStatus, headers: { 'cache-control': 'no-store' } });
  } catch (error) { return judgeRouteError(error); }
}
