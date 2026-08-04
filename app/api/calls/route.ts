import { createCreateCallHandler, DemoCallAuthorizationRepository } from "@/lib/server/call-authorization";

const repository = new DemoCallAuthorizationRepository();

export const POST = createCreateCallHandler({
  repository,
  env: { CALLE_API_URL: process.env.CALLE_API_URL, CALLE_API_KEY: process.env.CALLE_API_KEY, CALLE_AGENT_ID: process.env.CALLE_AGENT_ID },
});
