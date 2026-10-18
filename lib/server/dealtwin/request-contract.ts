import { z } from "zod";

export class JudgeHttpError extends Error {
  constructor(readonly httpStatus: number, readonly code: string) { super(code); }
}
const resetSchema = z.strictObject({ expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/) });
export async function parseBoundedJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  if (request.headers.get("origin") !== new URL(request.url).origin
    || request.headers.get("sec-fetch-site") === "cross-site") throw new JudgeHttpError(403, "INVALID_ORIGIN");
  if (new URL(request.url).search !== "") throw new JudgeHttpError(422, "INVALID_REQUEST");
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new JudgeHttpError(415, "JSON_REQUIRED");
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 4096)) throw new JudgeHttpError(413, "REQUEST_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new JudgeHttpError(422, "INVALID_REQUEST");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 4096) { await reader.cancel(); throw new JudgeHttpError(413, "REQUEST_TOO_LARGE"); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return schema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))); }
  catch { throw new JudgeHttpError(422, "INVALID_REQUEST"); }
}
export function parseJudgeResetRequest(request: Request): Promise<z.infer<typeof resetSchema>> { return parseBoundedJson(request, resetSchema); }
const commitmentSchema = z.strictObject({ expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/), proofId: z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/),
  dealVersionId: z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/), canonicalEventHash: z.string().regex(/^[0-9a-f]{64}$/) });
export function parseCommitmentRequest(request: Request): Promise<z.infer<typeof commitmentSchema>> { return parseBoundedJson(request, commitmentSchema); }
const lifecycleSchema = commitmentSchema.extend({ action: z.enum(['release','expire','cancel']) });
export function parseCommitmentLifecycleRequest(request: Request): Promise<z.infer<typeof lifecycleSchema>> { return parseBoundedJson(request, lifecycleSchema); }
export function judgeRouteError(error: unknown): Response {
  const status = error instanceof JudgeHttpError ? error.httpStatus : 503;
  const code = error instanceof JudgeHttpError ? error.code : "JUDGE_UNAVAILABLE";
  // Never serialize a SQL error, connection string, signing key or stack trace.
  return Response.json({ ok: false, error: { code } }, { status, headers: { "cache-control": "no-store" } });
}
