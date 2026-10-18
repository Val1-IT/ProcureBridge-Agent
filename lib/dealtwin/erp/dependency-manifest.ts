import type { SelfReservationIdentity } from "../domain/commitment";
import type { SourceDependency } from "./adapter-types";

declare const dependencyKeyBrand: unique symbol;
declare const snapshotHashBrand: unique symbol;

export type DependencyKey = string & { readonly [dependencyKeyBrand]: "DependencyKey" };
export type SnapshotHash = string & { readonly [snapshotHashBrand]: "SnapshotHash" };

export interface DependencyManifest {
  readonly entries: readonly SourceDependency[];
  readonly keys: readonly DependencyKey[];
}

export interface DependencyChange {
  readonly tenantId: string;
  readonly priorRevision: number;
  readonly currentRevision: number;
  readonly changes: readonly {
    readonly key: DependencyKey;
    readonly beforeHash: string | null;
    readonly afterHash: string | null;
  }[];
  readonly self: SelfReservationIdentity | null;
  readonly selfCapacityKeys: readonly DependencyKey[];
}

export function dependencyKey(value: string): DependencyKey {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) throw new Error("Dependency key must be canonical text.");
  return value as DependencyKey;
}
