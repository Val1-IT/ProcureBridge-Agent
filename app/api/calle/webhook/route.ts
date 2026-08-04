import { NextResponse } from "next/server";
import { createWebhookMemory, processWebhook } from "@/lib/calle/webhook-handler";
import { verifyPlaceholderHmac } from "@/lib/calle/webhook-signature";

const memory = createWebhookMemory();

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.CALLE_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production" && signature === "demo";
  return verifyPlaceholderHmac(rawBody, signature, secret);
}

export async function POST(request: Request) {
  let rawBody: string;
  let payload: unknown;
  try {
    rawBody = await request.text();
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
  // Generic placeholder header; replace only after the official CALL-E signing contract is confirmed.
  const signatureHeader = process.env.CALLE_WEBHOOK_SIGNATURE_HEADER ?? "x-procurebridge-signature";
  const result = await processWebhook(payload, { store: memory, signatureValid: verifySignature(rawBody, request.headers.get(signatureHeader)) });
  if (!result.accepted) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result, { status: 202 });
}
