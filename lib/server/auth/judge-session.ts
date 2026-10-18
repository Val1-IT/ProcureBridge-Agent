import type { ActorContext } from "../../dealtwin/application/operation-contracts";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { JUDGE_TENANT_ID } from "../../dealtwin/judge/scenario";
import { JudgeHttpError } from "../dealtwin/request-contract";

const COOKIE = "dealtwin_judge_session";
const sessionSchema = z.strictObject({ schemaVersion: z.literal("dealtwin.judge-session.v1"), tenantId: z.literal(JUDGE_TENANT_ID),
  actorId: z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/), role: z.enum(["admin", "procurement", "warehouse", "sales", "finance", "approver"]),
  issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative() });
function signingKey(value: string | undefined): string {
  if (!value || Buffer.byteLength(value) < 32) throw new JudgeHttpError(503, "JUDGE_UNAVAILABLE");
  return value;
}
function signature(payload: string, key: string): Buffer { return createHmac("sha256", key).update(`${COOKIE}.${payload}`).digest(); }
/** Server-only issuance helper. No public unauthenticated session/bootstrap endpoint. */
export function createJudgeSessionCookie(context: ActorContext, options: { signingKey: string; now: number; ttlSeconds?: number }): string {
  const ttl = options.ttlSeconds ?? 3600;
  if (!Number.isSafeInteger(ttl) || ttl <= 0 || ttl > 3600 || !Number.isSafeInteger(options.now) || options.now < 0) throw new Error("INVALID_SESSION_LIFETIME");
  const issuedAt = Math.floor(options.now / 1000);
  const data = sessionSchema.parse({ ...context, schemaVersion: "dealtwin.judge-session.v1", issuedAt, expiresAt: issuedAt + ttl });
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${COOKIE}=${payload}.${signature(payload, signingKey(options.signingKey)).toString("base64url")}; Path=/api/dealtwin; Max-Age=${ttl}; HttpOnly; SameSite=Strict; Secure`;
}
export async function requireJudgeSession(request: Request): Promise<ActorContext> {
  const key = signingKey(process.env.DEALTWIN_JUDGE_SESSION_SIGNING_KEY);
  try {
    const raw = request.headers.get("cookie") ?? "";
    if (raw.length > 8192) throw new Error();
    const values = raw.split(";").map((entry) => entry.trim()).filter((entry) => entry.startsWith(`${COOKIE}=`));
    if (values.length !== 1) throw new Error();
    const token = values[0]!.slice(COOKIE.length + 1);
    if (token.length > 2048) throw new Error();
    const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
    if (!match) throw new Error();
    const supplied = Buffer.from(match[2]!, "base64url");
    if (supplied.length !== 32 || supplied.toString("base64url") !== match[2] || !timingSafeEqual(supplied, signature(match[1]!, key))) throw new Error();
    const data = sessionSchema.parse(JSON.parse(Buffer.from(match[1]!, "base64url").toString("utf8")));
    const now = Math.floor(Date.now() / 1000);
    if (data.issuedAt > now || data.expiresAt <= now || data.expiresAt <= data.issuedAt || data.expiresAt - data.issuedAt > 3600) throw new Error();
    return { tenantId: data.tenantId, actorId: data.actorId, role: data.role };
  } catch { throw new JudgeHttpError(401, "UNAUTHENTICATED"); }
}
