import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMessageTime(date: Date | string): string {
  const d = new Date(date);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "dd/MM/yyyy");
}

export function formatFullTime(date: Date | string): string {
  return format(new Date(date), "dd MMM yyyy, HH:mm");
}

export function formatRelativeTime(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatPhone(phone: string): string {
  // Format as +XX XXXX XXXX XXXX
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length <= 4) return `+${cleaned}`;
  if (cleaned.length <= 8) return `+${cleaned.slice(0, 2)} ${cleaned.slice(2)}`;
  return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 6)} ${cleaned.slice(6)}`;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function isWindowExpired(windowExpiresAt: Date | string | null): boolean {
  if (!windowExpiresAt) return true;
  return new Date(windowExpiresAt) < new Date();
}

export function getWindowTimeLeft(windowExpiresAt: Date | string | null): number {
  if (!windowExpiresAt) return 0;
  const diff = new Date(windowExpiresAt).getTime() - Date.now();
  return Math.max(0, diff);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "…";
}
