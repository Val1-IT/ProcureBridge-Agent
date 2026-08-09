export function getJakartaClock(now: Date): { time: string; date: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return { time: `${part("hour")}:${part("minute")}`, date: `${part("year")}-${part("month")}-${part("day")}` };
}
