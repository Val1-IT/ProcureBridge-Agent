import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../../app/api/dealtwin/judge/launch/route";
import { requireJudgeSession } from "../../../lib/server/auth/judge-session";

const key = "launch-test-signing-key-with-more-than-32-bytes";
const token = "launch-token-that-is-long-enough-for-local-use-0123456789";
const launch = (query: string) => GET(new Request("http://127.0.0.1:4177/api/dealtwin/judge/launch?" + query));
afterEach(() => { vi.unstubAllEnvs(); });

describe("local judge launch link", () => {
  it("is absent unless the local demo configured a launch token", async () => {
    vi.stubEnv("DEALTWIN_JUDGE_SESSION_SIGNING_KEY", key);
    vi.stubEnv("DEALTWIN_JUDGE_LAUNCH_TOKEN", "");
    expect((await launch("role=admin&token=" + token)).status).toBe(404);
    vi.stubEnv("DEALTWIN_JUDGE_LAUNCH_TOKEN", "short");
    expect((await launch("role=admin&token=short")).status).toBe(404);
  });
  it("swaps a matching token for a one-hour HttpOnly session and redirects by role", async () => {
    vi.stubEnv("DEALTWIN_JUDGE_SESSION_SIGNING_KEY", key);
    vi.stubEnv("DEALTWIN_JUDGE_LAUNCH_TOKEN", token);
    const admin = await launch("role=admin&token=" + token);
    expect(admin.status).toBe(303);
    expect(admin.headers.get("location")).toBe("/dealtwin/voice");
    expect(admin.headers.get("referrer-policy")).toBe("no-referrer");
    const cookie = admin.headers.get("set-cookie")!;
    expect(cookie).toMatch(/; Path=\/api\/dealtwin; Max-Age=3600; HttpOnly; SameSite=Strict; Secure$/);
    const actor = await requireJudgeSession(new Request("http://127.0.0.1:4177/api/dealtwin/judge/state", { headers: { cookie: cookie.split(";")[0]! } }));
    expect(actor).toMatchObject({ role: "admin", actorId: "judge-browser-admin" });
    expect((await launch("role=approver&token=" + token)).headers.get("location")).toBe("/dealtwin/judge");
  });
  it("refuses wrong tokens, unknown roles and extra parameters without a cookie", async () => {
    vi.stubEnv("DEALTWIN_JUDGE_SESSION_SIGNING_KEY", key);
    vi.stubEnv("DEALTWIN_JUDGE_LAUNCH_TOKEN", token);
    for (const query of ["role=admin&token=" + token.slice(0, -1) + "x", "role=finance&token=" + token, "role=admin", "role=admin&token=" + token + "&next=//evil.example"]) {
      const response = await launch(query);
      expect(response.status).toBe(404);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });
});
