import { requireJudgeSession } from "@/lib/server/auth/judge-session";
import { getJudgeRuntime } from "@/lib/server/dealtwin/runtime";
import { JudgeHttpError, judgeRouteError } from "@/lib/server/dealtwin/request-contract";

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requireJudgeSession(request);
    if (new URL(request.url).search !== "") throw new JudgeHttpError(422, "INVALID_REQUEST");
    const state = await getJudgeRuntime().loadJudgeState(actor);
    return Response.json(state, { headers: { "cache-control": "no-store" } });
  } catch (error) { return judgeRouteError(error); }
}
