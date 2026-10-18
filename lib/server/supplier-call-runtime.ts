import { DemoSupplierCallAuthorizationRepository } from "./supplier-call-authorization";

export interface SupplierCallServerRuntime {
  repository: DemoSupplierCallAuthorizationRepository;
}

const runtimeGlobal = globalThis as typeof globalThis & {
  __arvantaSupplierCallServerRuntime?: SupplierCallServerRuntime;
};

export function getSupplierCallServerRuntime(): SupplierCallServerRuntime {
  runtimeGlobal.__arvantaSupplierCallServerRuntime ??= {
    repository: new DemoSupplierCallAuthorizationRepository(),
  };
  return runtimeGlobal.__arvantaSupplierCallServerRuntime;
}
