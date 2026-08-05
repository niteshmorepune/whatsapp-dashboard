"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { Plus, Trash2, Loader2, CalendarOff } from "lucide-react";
import { Holiday } from "@/types";
import { format } from "date-fns";
import { toast } from "sonner";

// h.date arrives as a UTC-midnight ISO string for a calendar date (not a
// specific instant) — parsing it as local-midnight-for-that-same-calendar-day
// instead of `new Date(iso)` avoids the display date shifting by one day for
// any viewer west of UTC.
function formatHolidayDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return format(new Date(y, m - 1, d), "EEEE, MMMM d, yyyy");
}

export default function HolidaysPage() {
  const { data: session } = useSession();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  if (session && session.user.role !== "ADMIN") {
    redirect("/inbox");
  }

  function load() {
    setLoading(true);
    axios.get("/api/holidays").then((r) => setHolidays(r.data)).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleAdd() {
    if (!date || !label.trim()) return toast.error("Date and label are required");
    setSaving(true);
    try {
      await axios.post("/api/holidays", { date, label: label.trim() });
      setDate("");
      setLabel("");
      toast.success("Holiday added — AI will treat this as closed on that date");
      load();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error ?? "Failed" : "Failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await axios.delete(`/api/holidays/${id}`);
      setHolidays((prev) => prev.filter((h) => h.id !== id));
      toast.success("Removed");
    } catch {
      toast.error("Failed to remove");
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 bg-green-500/10 rounded-xl flex items-center justify-center">
            <CalendarOff className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Holidays</h1>
            <p className="text-xs text-gray-500">Company-wide — every AUTO-mode line treats these dates as closed</p>
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 my-6 flex flex-col sm:flex-row gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Diwali)"
            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <button
            onClick={handleAdd}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
        ) : holidays.length === 0 ? (
          <p className="text-center text-sm text-gray-600 py-12">No holidays added yet</p>
        ) : (
          <div className="space-y-2">
            {holidays.map((h) => (
              <div key={h.id} className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 group">
                <div>
                  <p className="text-sm font-medium text-white">{h.label}</p>
                  <p className="text-xs text-gray-500">{formatHolidayDate(h.date)}</p>
                </div>
                <button
                  onClick={() => handleDelete(h.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
