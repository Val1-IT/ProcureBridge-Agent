import { createHash, timingSafeEqual } from "node:crypto";
import { createJudgeSessionCookie } from "@/lib/server/auth/judge-session";
import { JUDGE_TENANT_ID } from "@/lib/dealtwin/judge/scenario";

const destinations = { admin: "/dealtwin/alexa", approver: "/dealtwin/judge" } as const;
function digest(value: string): Buffer { return createHash("sha256").update(value).digest(); }
function notFound(): Response { return new Response(null, { status: 404, headers: { "cache-control": "no-store" } }); }
/** Local judge launch link. Disabled unless `judge:demo` set a random launch token
 * for this process; the token is printed only to the local terminal. It swaps the
 * token for the same one-hour HttpOnly session the Playwright bootstrap mints, so a
 * judge can open the simulator in any browser without importing storage state. */
export async function GET(request: Request): Promise<Response> {
  const expected = process.env.DEALTWIN_JUDGE_LAUNCH_TOKEN;
  const signingKey = process.env.DEALTWIN_JUDGE_SESSION_SIGNING_KEY;
  if (!expected || Buffer.byteLength(expected) < 32 || !signingKey) return notFound();
  const url = new URL(request.url);
  const role = url.searchParams.get("role"), token = url.searchParams.get("token");
  if ([...url.searchParams.keys()].some((name) => name !== "role" && name !== "token") || (role !== "admin" && role !== "approver")
    || typeof token !== "string" || token.length > 256 || !timingSafeEqual(digest(token), digest(expected))) return notFound();
  const cookie = createJudgeSessionCookie({ tenantId: JUDGE_TENANT_ID, actorId: "judge-browser-" + role, role }, { signingKey, now: Date.now() });
  return new Response(null, { status: 303, headers: { location: destinations[role], "set-cookie": cookie,
    "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
