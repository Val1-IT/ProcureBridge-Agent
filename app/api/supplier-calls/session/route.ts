import { createInvalidateSupplierCallSessionHandler, createRestartSupplierCallSessionHandler } from "@/lib/server/supplier-call-authorization";
import { getSupplierCallServerRuntime } from "@/lib/server/supplier-call-runtime";

export const DELETE = createInvalidateSupplierCallSessionHandler({
  repository: getSupplierCallServerRuntime().repository,
});

export const PUT = createRestartSupplierCallSessionHandler({
  repository: getSupplierCallServerRuntime().repository,
});
