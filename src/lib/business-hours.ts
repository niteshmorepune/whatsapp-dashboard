import { prisma } from "@/lib/prisma";
import type { AiMode } from "@prisma/client";

/** One entry per JS Date#getDay() index (0=Sunday .. 6=Saturday). */
export interface DayHours {
  day: number;
  isOpen: boolean;
  openTime: string; // "HH:mm"
  closeTime: string; // "HH:mm"
}

export type BusinessHours = DayHours[];

export const DEFAULT_BUSINESS_HOURS: BusinessHours = [
  { day: 0, isOpen: false, openTime: "10:00", closeTime: "19:00" }, // Sun
  { day: 1, isOpen: true, openTime: "10:00", closeTime: "19:00" },
  { day: 2, isOpen: true, openTime: "10:00", closeTime: "19:00" },
  { day: 3, isOpen: true, openTime: "10:00", closeTime: "19:00" },
  { day: 4, isOpen: true, openTime: "10:00", closeTime: "19:00" },
  { day: 5, isOpen: true, openTime: "10:00", closeTime: "19:00" },
  { day: 6, isOpen: true, openTime: "10:00", closeTime: "19:00" }, // Sat
];

const IST_OFFSET_MINUTES = 5 * 60 + 30;

/**
 * NEDS is a single-timezone (Asia/Kolkata, India Standard Time) business, so
 * this is hardcoded rather than stored per-number. IST has a fixed +05:30
 * offset year-round (no DST), so a plain millisecond shift is correct here —
 * no need for a timezone library.
 */
function toIstParts(date: Date): { day: number; minutesSinceMidnight: number; dateKey: string } {
  const ist = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  const day = ist.getUTCDay();
  const minutesSinceMidnight = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const dateKey = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(
    ist.getUTCDate()
  ).padStart(2, "0")}`;
  return { day, minutesSinceMidnight, dateKey };
}

/** Matches how a `Holiday.date` (`@db.Date`) round-trips through Prisma — UTC midnight for that calendar date. */
export function dateKeyForHolidayDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export async function getHolidayDateKeys(): Promise<Set<string>> {
  const holidays = await prisma.holiday.findMany({ select: { date: true } });
  return new Set(holidays.map((h) => dateKeyForHolidayDate(h.date)));
}

export function isWithinBusinessHours(
  businessHours: BusinessHours | null | undefined,
  holidayDateKeys: Set<string>,
  now: Date = new Date()
): boolean {
  const { day, minutesSinceMidnight, dateKey } = toIstParts(now);
  if (holidayDateKeys.has(dateKey)) return false;

  const schedule = businessHours && businessHours.length ? businessHours : DEFAULT_BUSINESS_HOURS;
  const today = schedule.find((d) => d.day === day);
  if (!today || !today.isOpen) return false;

  const open = parseTimeToMinutes(today.openTime);
  const close = parseTimeToMinutes(today.closeTime);
  return minutesSinceMidnight >= open && minutesSinceMidnight < close;
}

/**
 * Combines a line's AiMode with its weekly schedule + the holiday calendar
 * to decide whether the AI after-hours assistant should be replying right
 * now. FORCE_ON/FORCE_OFF are absolute overrides; AUTO defers to the
 * schedule (AI replies exactly when the business is closed).
 */
export function resolveAiLiveState(
  aiMode: AiMode,
  businessHours: BusinessHours | null | undefined,
  holidayDateKeys: Set<string>,
  now: Date = new Date()
): boolean {
  if (aiMode === "FORCE_ON") return true;
  if (aiMode === "FORCE_OFF") return false;
  return !isWithinBusinessHours(businessHours, holidayDateKeys, now);
}
