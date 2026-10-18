import { nonNegativeRupiah, rupiah, type Rupiah } from "./money";

declare const basisPointsBrand: unique symbol;

export type BasisPoints = number & { readonly [basisPointsBrand]: "BasisPoints" };

export function basisPoints(value: number): BasisPoints {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw new Error("Basis points must be an integer from 0 through 10000.");
  }
  return value as BasisPoints;
}

export function applyRateFloor(amount: Rupiah, rate: BasisPoints): Rupiah {
  nonNegativeRupiah(amount);
  return rupiah((amount * BigInt(rate)) / 10_000n);
}

export function applyRateCeil(amount: Rupiah, rate: BasisPoints): Rupiah {
  nonNegativeRupiah(amount);
  const numerator = amount * BigInt(rate);
  return rupiah((numerator + 9_999n) / 10_000n);
}
