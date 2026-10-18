import { createRegisterSupplierCallApprovalHandler } from "@/lib/server/supplier-call-authorization";
import { getSupplierCallServerRuntime } from "@/lib/server/supplier-call-runtime";

export const POST = createRegisterSupplierCallApprovalHandler({
  repository: getSupplierCallServerRuntime().repository,
});
