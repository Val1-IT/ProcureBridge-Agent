import { NextResponse } from "next/server";
import { getCallProvider } from "@/lib/calle/client";

export async function POST(_request: Request, context: { params: Promise<{ callId: string }> }) {
  try {
    const { callId } = await context.params;
    await getCallProvider({ CALLE_API_URL: process.env.CALLE_API_URL, CALLE_API_KEY: process.env.CALLE_API_KEY, CALLE_AGENT_ID: process.env.CALLE_AGENT_ID }).endCall(callId);
    return NextResponse.json({ ended: true });
  } catch {
    return NextResponse.json({ error: "Unable to end call." }, { status: 502 });
  }
}
