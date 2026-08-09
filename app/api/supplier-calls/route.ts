import { createCreateSupplierCallHandler, DemoSupplierCallAuthorizationRepository } from "@/lib/server/supplier-call-authorization";

const repository = new DemoSupplierCallAuthorizationRepository();

export const POST = createCreateSupplierCallHandler({
  repository,
  env: { CALLE_API_URL: process.env.CALLE_API_URL, CALLE_API_KEY: process.env.CALLE_API_KEY, CALLE_AGENT_ID: process.env.CALLE_AGENT_ID },
});
