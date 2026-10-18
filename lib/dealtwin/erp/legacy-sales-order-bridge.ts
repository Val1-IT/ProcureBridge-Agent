import type { SalesOrderInput } from "../../erp/commands/sales";
import { canonicalizeDealTermsV1, type DealTermsV1 } from "../domain/deal-terms";
import type { Result } from "../domain/result";

const unsafe = (): Result<SalesOrderInput> => ({
  ok: false,
  error: {
    code: "LEGACY_SALES_ORDER_VALUE_OUT_OF_RANGE",
    message: "Deal terms cannot be represented safely by the legacy Sales Order command.",
  },
});

export function toLegacySalesOrderInput(terms: DealTermsV1): Result<SalesOrderInput> {
  let total = 0n;
  for (const line of terms.productLines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || typeof line.unitPriceRupiah !== "bigint") return unsafe();
    const lineTotal = BigInt(line.quantity) * line.unitPriceRupiah;
    total += lineTotal;
    if (line.unitPriceRupiah <= 0n || line.unitPriceRupiah > BigInt(Number.MAX_SAFE_INTEGER)
      || lineTotal > BigInt(Number.MAX_SAFE_INTEGER) || total > BigInt(Number.MAX_SAFE_INTEGER)) return unsafe();
    const convertedPrice = Number(line.unitPriceRupiah);
    if (!Number.isSafeInteger(convertedPrice) || BigInt(convertedPrice) !== line.unitPriceRupiah) return unsafe();
  }

  try {
    const dto = canonicalizeDealTermsV1(terms);
    return {
      ok: true,
      value: {
        customerId: dto.customerId,
        warehouseId: dto.warehouseId,
        lines: dto.productLines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: Number(line.unitPriceRupiah),
        })),
      },
    };
  } catch (error) {
    return { ok: false, error: { code: "INVALID_DEAL_TERMS", message: error instanceof Error ? error.message : "Deal terms are invalid." } };
  }
}
