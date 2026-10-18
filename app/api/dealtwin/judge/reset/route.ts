import { requireJudgeSession } from "@/lib/server/auth/judge-session";
import { getJudgeRuntime } from "@/lib/server/dealtwin/runtime";
import { JudgeHttpError, judgeRouteError, parseJudgeResetRequest } from "@/lib/server/dealtwin/request-contract";

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireJudgeSession(request);
    if (actor.role !== "admin") throw new JudgeHttpError(403, "FORBIDDEN_ROLE");
    const input = await parseJudgeResetRequest(request);
    const result = await getJudgeRuntime().resetJudgeTenant({ ...actor, ...input, now: new Date().toISOString() });
    return Response.json(result.body, { status: result.httpStatus, headers: { "cache-control": "no-store" } });
  } catch (error) { return judgeRouteError(error); }
}
