import { createCreateSupplierCallHandler } from "@/lib/server/supplier-call-authorization";
import { getSupplierCallServerRuntime } from "@/lib/server/supplier-call-runtime";

export const POST = createCreateSupplierCallHandler({
  repository: getSupplierCallServerRuntime().repository,
  env: { CALLE_API_URL: process.env.CALLE_API_URL, CALLE_API_KEY: process.env.CALLE_API_KEY, CALLE_AGENT_ID: process.env.CALLE_AGENT_ID },
});
