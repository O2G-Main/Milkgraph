const wibDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
});

export const DEFAULT_PRODUCTION_DATE = "2026-11-01";

export function dateInWib(date: Date = new Date()): string {
  return wibDate.format(date);
}

export function completedOnProductionDate(value: string, date: string): boolean {
  const iso = value.replace(" ", "T");
  const instant = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}+07:00`);
  return Number.isFinite(instant.getTime()) && dateInWib(instant) === date;
}
