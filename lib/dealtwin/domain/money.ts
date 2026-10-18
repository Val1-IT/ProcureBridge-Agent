declare const rupiahBrand: unique symbol;

export type Rupiah = bigint & { readonly [rupiahBrand]: "Rupiah" };

export function rupiah(value: bigint): Rupiah {
  if (typeof value !== "bigint") {
    throw new Error("Rupiah must be a bigint.");
  }
  return value as Rupiah;
}

export function nonNegativeRupiah(value: bigint): Rupiah {
  if (value < 0n) {
    throw new Error("Rupiah amount must be non-negative.");
  }
  return rupiah(value);
}

export function parseRupiah(value: string): Rupiah {
  if (!/^(?:0|-[1-9]\d*|[1-9]\d*)$/.test(value)) {
    throw new Error("Rupiah must be a canonical base-10 integer.");
  }
  return rupiah(BigInt(value));
}

export function formatRupiahDto(value: Rupiah): string {
  return value.toString(10);
}
