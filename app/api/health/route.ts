import { NextResponse } from "next/server";
import { getCallProviderMode } from "../../../lib/calle/client";

export function GET() {
  return NextResponse.json({
    status: "ok",
    app: "Arvanta ProcureBridge Recovery Agent",
    mode: "demo",
    callProvider: getCallProviderMode({ CALLE_API_URL: process.env.CALLE_API_URL, CALLE_API_KEY: process.env.CALLE_API_KEY, CALLE_AGENT_ID: process.env.CALLE_AGENT_ID }),
    version: "0.2.0",
  });
}
