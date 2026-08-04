import { NextResponse } from "next/server";
import { createWebhookMemory, processWebhook } from "@/lib/calle/webhook-handler";

const memory = createWebhookMemory();

function verifySignature(signature: string | null): boolean {
  const secret = process.env.CALLE_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production" && signature === "demo";
  return signature === secret;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
  const result = await processWebhook(payload, { memory, signatureValid: verifySignature(request.headers.get("x-calle-signature")) });
  if (!result.accepted) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result, { status: 202 });
}
