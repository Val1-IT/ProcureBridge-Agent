import { NextResponse } from "next/server";
import { getCallProvider } from "@/lib/calle/client";

export async function GET(_request: Request, context: { params: Promise<{ callId: string }> }) {
  try {
    const { callId } = await context.params;
    return NextResponse.json(await getCallProvider({ CALLE_API_URL: process.env.CALLE_API_URL, CALLE_API_KEY: process.env.CALLE_API_KEY, CALLE_AGENT_ID: process.env.CALLE_AGENT_ID }).getCall(callId));
  } catch {
    return NextResponse.json({ error: "Unable to read call status." }, { status: 502 });
  }
}
