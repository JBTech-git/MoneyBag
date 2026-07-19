import {
  fullMonthName,
  shortDayName,
  shortMonthName,
  t,
  type Language,
} from '@/lib/i18n';
import { parseLanguage } from '@/lib/i18n/types';

export function localDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function localDateIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function combineLocalDatetime(day: Date, timeStr?: string): Date {
  const now = new Date();
  let hours = now.getHours();
  let minutes = now.getMinutes();
  if (timeStr && timeStr.includes(':')) {
    const [h, mi] = timeStr.split(':').map(Number);
    hours = h;
    minutes = mi;
  }
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0);
}

export function parseDatetimeLocal(value: string): Date {
  // YYYY-MM-DDTHH:mm
  const [datePart, timePart = '00:00'] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export function toDatetimeLocalValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function asLang(lang?: string | Language | null): Language {
  return parseLanguage(lang, 'en');
}

export function formatTxnTime(value: Date | string, lang?: string | Language | null): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const L = asLang(lang);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? t(L, 'date.pm') : t(L, 'date.am');
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function shortDateLabel(day: Date | string, lang?: string | Language | null): string {
  const d = typeof day === 'string' ? parseIsoDate(day) : day;
  const L = asLang(lang);
  const yy = String(d.getFullYear()).slice(-2);
  return `${shortDayName(L, d.getDay())}, ${d.getDate()} ${shortMonthName(L, d.getMonth())} '${yy}`;
}

export function monthLabel(year: number, month: number, lang?: string | Language | null): string {
  const L = asLang(lang);
  return `${fullMonthName(L, month - 1)} ${year}`;
}

export function shortMonthLabel(year: number, month: number, lang?: string | Language | null): string {
  const L = asLang(lang);
  return `${shortMonthName(L, month - 1)} ${year}`;
}

export function startOfMonth(year: number, month: number): Date {
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

export function endOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function iterMonthsBack(endYear: number, endMonth: number, count = 12): Array<[number, number]> {
  const months: Array<[number, number]> = [];
  let y = endYear;
  let m = endMonth;
  for (let i = 0; i < count; i++) {
    months.push([y, m]);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return months;
}
