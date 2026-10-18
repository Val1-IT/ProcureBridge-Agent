import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJudgeSessionCookie, requireJudgeSession } from "../../../lib/server/auth/judge-session";
import { parseJudgeResetRequest } from "../../../lib/server/dealtwin/request-contract";
import { POST } from "../../../app/api/dealtwin/judge/reset/route";
import { GET } from "../../../app/api/dealtwin/judge/state/route";
import type { ActorContext, MutationContext } from "../../../lib/dealtwin/application/operation-contracts";
// Replace only external persistence composition; session/parser and registered HTTP handlers are real.
vi.mock("../../../lib/server/dealtwin/runtime", () => ({ getJudgeRuntime: () => ({
  resetJudgeTenant: async (context: MutationContext) => ({ httpStatus:200, body:{ ok:true, actorId:context.actorId, role:context.role,
    tenantId:context.tenantId, expectedRevision:context.expectedRevision, idempotencyKey:context.idempotencyKey } }),
  loadJudgeState: async (context: ActorContext) => ({ revision:17, synthetic:true, tenantId:context.tenantId, actorId:context.actorId }),
}) }));

const actor = { tenantId: "dealtwin-judge-v1", actorId: "judge-user", role: "admin" as const };
const key = "test-only-signing-key-with-at-least-32-bytes";
const now = Date.parse("2026-10-05T12:00:00.000Z");
function request(body: unknown, cookie?: string) {
  return new Request("http://localhost/api/dealtwin/judge/reset", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost", ...(cookie ? { cookie: cookie.split(";")[0]! } : {}) }, body: JSON.stringify(body) });
}
describe("Judge boundary", () => {
  beforeEach(() => { vi.stubEnv("DEALTWIN_JUDGE_SESSION_SIGNING_KEY", key); vi.useFakeTimers(); vi.setSystemTime(now); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  it("binds a signed HttpOnly SameSite cookie to the fixed tenant, actor and server role", async () => {
    const cookie = createJudgeSessionCookie(actor, { signingKey: key, now });
    expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("SameSite=Strict"); expect(cookie).toContain("Secure");
    expect(await requireJudgeSession(request({}, cookie))).toEqual(actor);
  });
  it("rejects absent, tampered, expired, wrong-key sessions and foreign tenant signing", async () => {
    await expect(requireJudgeSession(request({ tenantId: actor.tenantId, role: "admin" }))).rejects.toThrow();
    const cookie = createJudgeSessionCookie(actor, { signingKey: key, now, ttlSeconds: 60 });
    await expect(requireJudgeSession(request({}, cookie.replace("dealtwin_judge_session=", "dealtwin_judge_session=x")))).rejects.toThrow();
    vi.setSystemTime(now + 60000);
    await expect(requireJudgeSession(request({},cookie))).rejects.toThrow();
    vi.setSystemTime(now); vi.stubEnv("DEALTWIN_JUDGE_SESSION_SIGNING_KEY", "a-different-signing-key-at-least-32-bytes");
    await expect(requireJudgeSession(request({},cookie))).rejects.toThrow();
    expect(() => createJudgeSessionCookie({ ...actor, tenantId: "foreign" },{ signingKey:key, now })).toThrow();
  });
  it("accepts only bounded reset input and rejects tenant, role, time and unknown fields", async () => {
    const valid = { expectedRevision: 2, idempotencyKey: "reset-1" };
    expect(await parseJudgeResetRequest(request(valid))).toEqual(valid);
    for (const extra of [{ tenantId: actor.tenantId },{ role:"admin" },{ now: "2026-09-12" },{ sql:"drop table" }]) {
      await expect(parseJudgeResetRequest(request({ ...valid, ...extra }))).rejects.toThrow();
    }
    for (const invalid of [{ ...valid, expectedRevision: -1 },{ ...valid, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },{ ...valid, idempotencyKey: " " },{ ...valid, idempotencyKey:"a".repeat(5000) }]) {
      await expect(parseJudgeResetRequest(request(invalid))).rejects.toThrow();
    }
    const cross = new Request("http://localhost/api/dealtwin/judge/reset",{ method:"POST", headers:{ "content-type":"application/json", origin:"https://attacker.invalid" },body:JSON.stringify(valid) });
    await expect(parseJudgeResetRequest(cross)).rejects.toThrow();
  });
  it("the reset handler derives identity from session and forwards only validated mutation fields", async () => {
    const cookie = createJudgeSessionCookie(actor,{ signingKey:key, now });
    const response = await POST(request({ expectedRevision:3,idempotencyKey:"route-reset" },cookie));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok:true, actorId:"judge-user", role:"admin",tenantId:"dealtwin-judge-v1", expectedRevision:3,idempotencyKey:"route-reset" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await POST(request({ expectedRevision:3,idempotencyKey:"route-reset",role:"admin" },cookie))).status).toBe(422);
    expect((await POST(request({ expectedRevision:3,idempotencyKey:"route-reset" }))).status).toBe(401);
  });
  it("the state handler returns server state without client tenant identity or browser balances", async () => {
    const cookie = createJudgeSessionCookie(actor,{ signingKey:key, now }).split(";")[0]!;
    const response = await GET(new Request("http://localhost/api/dealtwin/judge/state",{ headers:{ cookie } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revision:17,synthetic:true,tenantId:"dealtwin-judge-v1",actorId:"judge-user" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await GET(new Request("http://localhost/api/dealtwin/judge/state?tenantId=foreign",{ headers:{cookie} }))).status).toBe(422);
    expect((await GET(new Request("http://localhost/api/dealtwin/judge/state"))).status).toBe(401);
  });
});
