export function nextDocumentNumber(prefix: string, date: string | Date, existingNumbers: readonly string[]): string {
  const resolvedDate = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(resolvedDate.getTime())) throw new Error("Document date is invalid.");

  const year = resolvedDate.getUTCFullYear();
  const expression = new RegExp(`^${escapeRegExp(prefix)}-${year}-(\\d+)$`);
  const highest = existingNumbers.reduce((maximum, number) => {
    const match = expression.exec(number);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);

  return `${prefix}-${year}-${String(highest + 1).padStart(4, "0")}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
