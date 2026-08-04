import { NextResponse } from "next/server";
import { getCallProvider } from "@/lib/calle/client";
import type { CreateCallInput } from "@/lib/calle/types";

function validInput(input: Partial<CreateCallInput>): input is CreateCallInput {
  return Boolean(input.callId && input.customerId && input.invoiceId && input.phone && input.language && input.scenario && input.disclosure);
}

export async function POST(request: Request) {
  try {
    const input = await request.json() as Partial<CreateCallInput>;
    if (!validInput(input)) return NextResponse.json({ error: "Invalid call request." }, { status: 400 });
    const forceMock = new URL(request.url).searchParams.get("forceMock") === "1";
    const provider = getCallProvider(
      { CALLE_API_URL: process.env.CALLE_API_URL, CALLE_API_KEY: process.env.CALLE_API_KEY, CALLE_AGENT_ID: process.env.CALLE_AGENT_ID },
      { forceMock },
    );
    return NextResponse.json(await provider.createCall(input), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to create call." }, { status: 502 });
  }
}
