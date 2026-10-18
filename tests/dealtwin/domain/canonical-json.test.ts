import { describe, expect, it } from "vitest";

import { canonicalStringify, sha256Canonical, type CanonicalJsonValue } from "../../../lib/dealtwin/domain/canonical-json";
import { formatRupiahDto, parseRupiah } from "../../../lib/dealtwin/domain/money";

describe("canonical JSON", () => {
  it("sorts object keys recursively while preserving array order", () => {
    const left = { z: [{ b: 2, a: 1 }, "last"], a: true };
    const right = { a: true, z: [{ a: 1, b: 2 }, "last"] };

    expect(canonicalStringify(left)).toBe('{"a":true,"z":[{"a":1,"b":2},"last"]}');
    expect(canonicalStringify(right)).toBe(canonicalStringify(left));
    expect(canonicalStringify([2, 1])).not.toBe(canonicalStringify([1, 2]));
  });

  it("hashes canonical UTF-8 JSON with SHA-256", () => {
    expect(sha256Canonical({ b: 2, a: "x" })).toBe("768ca668c0f84dd39bf269e25c9a3f0af4812e41026b6fead9a2666078ef16f6");
  });

  it.each([1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects non-canonical numeric value %s",
    (value) => {
      expect(() => canonicalStringify(value)).toThrowError("Canonical JSON numbers must be finite safe integers.");
    },
  );

  it("rejects undefined and raw bigint at runtime", () => {
    expect(() => canonicalStringify(undefined as unknown as CanonicalJsonValue)).toThrowError("Unsupported canonical JSON value.");
    expect(() => canonicalStringify(1n as unknown as CanonicalJsonValue)).toThrowError("Unsupported canonical JSON value.");
  });

  it("requires callers to encode rupiah as a decimal-string DTO before hashing", () => {
    const dto = { amountRupiah: formatRupiahDto(parseRupiah("9007199254740993")) };

    expect(canonicalStringify(dto)).toBe('{"amountRupiah":"9007199254740993"}');
  });
});
