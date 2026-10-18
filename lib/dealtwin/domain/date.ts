declare const isoDateBrand: unique symbol;

export type IsoDate = string & { readonly [isoDateBrand]: "IsoDate" };

interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseDate(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function dayIndex({ year: inputYear, month, day }: DateParts): number {
  const year = inputYear - (month <= 2 ? 1 : 0);
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const shiftedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  return era * 146_097 + yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
}

function dateFromDayIndex(index: number): DateParts {
  const era = Math.floor(index / 146_097);
  const dayOfEra = index - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1_460) + Math.floor(dayOfEra / 36_524) - Math.floor(dayOfEra / 146_096)) / 365,
  );
  let year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth + (shiftedMonth < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  return { year, month, day };
}

function formatDate(parts: DateParts): string {
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

export function isoDate(value: string): IsoDate {
  if (!parseDate(value)) {
    throw new Error("Date must be a valid ISO calendar date.");
  }
  return value as IsoDate;
}

export function compareIsoDate(left: IsoDate, right: IsoDate): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function addCalendarDays(date: IsoDate, days: number): IsoDate {
  if (!Number.isSafeInteger(days)) {
    throw new Error("Calendar-day offset must be a safe integer.");
  }
  const parts = parseDate(date);
  if (!parts) {
    throw new Error("Date must be a valid ISO calendar date.");
  }
  const result = dateFromDayIndex(dayIndex(parts) + days);
  return isoDate(formatDate(result));
}
