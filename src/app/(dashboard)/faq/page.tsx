"use client";

import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { Plus, Pencil, Trash2, Loader2, Bot, X, Check, EyeOff } from "lucide-react";
import { FaqEntry, WhatsappNumber } from "@/types";
import { toast } from "sonner";

const BOTH_LINES_VALUE = "";

export default function FaqPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user.role === "ADMIN";

  const [entries, setEntries] = useState<FaqEntry[]>([]);
  const [numbers, setNumbers] = useState<WhatsappNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ question: "", answer: "", whatsappNumberId: BOTH_LINES_VALUE });
  const [saving, setSaving] = useState(false);
  const [filterId, setFilterId] = useState<string>("all");

  useEffect(() => {
    Promise.all([axios.get("/api/faq"), axios.get("/api/whatsapp-numbers")])
      .then(([faqRes, numbersRes]) => {
        setEntries(faqRes.data);
        setNumbers(numbersRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // "both" shows only unscoped entries; a specific line's filter shows that
  // line's entries PLUS the Both-lines ones, since that's the AI's actual
  // effective FAQ set for that line (see generateAiReply()'s OR filter).
  const visibleEntries = useMemo(() => {
    if (filterId === "all") return entries;
    if (filterId === "both") return entries.filter((e) => !e.whatsappNumberId);
    return entries.filter((e) => !e.whatsappNumberId || e.whatsappNumberId === filterId);
  }, [entries, filterId]);

  function scopeLabel(entry: FaqEntry): string {
    return entry.whatsappNumber?.label ?? "Both lines";
  }

  function startEdit(entry: FaqEntry) {
    setEditingId(entry.id);
    setForm({ question: entry.question, answer: entry.answer, whatsappNumberId: entry.whatsappNumberId ?? BOTH_LINES_VALUE });
    setShowForm(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ question: "", answer: "", whatsappNumberId: BOTH_LINES_VALUE });
  }

  async function handleSave() {
    if (!form.question.trim() || !form.answer.trim()) return;
    setSaving(true);
    try {
      const payload = { question: form.question, answer: form.answer, whatsappNumberId: form.whatsappNumberId || null };
      if (editingId) {
        const res = await axios.patch(`/api/faq/${editingId}`, payload);
        setEntries((prev) => prev.map((e) => (e.id === editingId ? res.data : e)));
        setEditingId(null);
      } else {
        const res = await axios.post("/api/faq", payload);
        setEntries((prev) => [...prev, res.data]);
        setShowForm(false);
      }
      setForm({ question: "", answer: "", whatsappNumberId: BOTH_LINES_VALUE });
      toast.success(editingId ? "Updated" : "Created");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(entry: FaqEntry) {
    try {
      const res = await axios.patch(`/api/faq/${entry.id}`, { isActive: !entry.isActive });
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? res.data : e)));
    } catch {
      toast.error("Failed to update");
    }
  }

  async function handleDelete(id: string) {
    try {
      await axios.delete(`/api/faq/${id}`);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-500/10 rounded-xl flex items-center justify-center">
              <Bot className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">AI FAQ Knowledge Base</h1>
              <p className="text-xs text-gray-500">What the after-hours AI assistant is allowed to answer with</p>
            </div>
          </div>
          {isAdmin && !showForm && !editingId && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-xl transition"
            >
              <Plus className="w-4 h-4" /> New
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-4">
          The AI only answers questions covered here — it never invents pricing, timelines, or commitments. Anything
          not covered gets a &quot;the team will follow up during business hours&quot; reply instead. Each entry
          applies to Both lines, or you can scope it to one — the AI on a given line only ever sees entries scoped
          to it plus the Both-lines entries.
        </p>

        {numbers.length > 0 && (
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xs text-gray-500">Show:</span>
            <select
              value={filterId}
              onChange={(e) => setFilterId(e.target.value)}
              className="px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="all">All entries</option>
              <option value="both">Both-lines entries</option>
              {numbers.map((n) => (
                <option key={n.id} value={n.id}>{n.label} only (incl. Both-lines)</option>
              ))}
            </select>
          </div>
        )}

        {isAdmin && showForm && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-4">
            <input
              value={form.question}
              onChange={(e) => setForm((p) => ({ ...p, question: e.target.value }))}
              placeholder="Question (e.g. What services do you offer?)"
              className="w-full mb-2 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <textarea
              value={form.answer}
              onChange={(e) => setForm((p) => ({ ...p, answer: e.target.value }))}
              placeholder="Answer…"
              rows={3}
              className="w-full mb-2 resize-none px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <select
              value={form.whatsappNumberId}
              onChange={(e) => setForm((p) => ({ ...p, whatsappNumberId: e.target.value }))}
              className="w-full mb-3 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value={BOTH_LINES_VALUE}>Both lines</option>
              {numbers.map((n) => (
                <option key={n.id} value={n.id}>{n.label} only</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={() => { setShowForm(false); setForm({ question: "", answer: "", whatsappNumberId: BOTH_LINES_VALUE }); }} className="flex-1 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !form.question.trim() || !form.answer.trim()} className="flex-1 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded-lg transition flex items-center justify-center gap-1">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
        ) : visibleEntries.length === 0 ? (
          <div className="text-center py-12 text-gray-600">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No FAQ entries{filterId === "all" ? "" : " for this filter"} yet{isAdmin && filterId === "all" ? " — add one above" : ""}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleEntries.map((entry) =>
              editingId === entry.id ? (
                <div key={entry.id} className="bg-gray-800 border border-green-600/40 rounded-xl p-4">
                  <input
                    value={form.question}
                    onChange={(e) => setForm((p) => ({ ...p, question: e.target.value }))}
                    className="w-full mb-2 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  <textarea
                    value={form.answer}
                    onChange={(e) => setForm((p) => ({ ...p, answer: e.target.value }))}
                    rows={3}
                    className="w-full mb-2 resize-none px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  <select
                    value={form.whatsappNumberId}
                    onChange={(e) => setForm((p) => ({ ...p, whatsappNumberId: e.target.value }))}
                    className="w-full mb-3 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  >
                    <option value={BOTH_LINES_VALUE}>Both lines</option>
                    {numbers.map((n) => (
                      <option key={n.id} value={n.id}>{n.label} only</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={cancelEdit} className="flex-1 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition flex items-center justify-center gap-1">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving} className="flex-1 py-1.5 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded-lg transition flex items-center justify-center gap-1">
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={entry.id}
                  className={`bg-gray-800 border rounded-xl p-4 flex items-start gap-3 group ${
                    entry.isActive ? "border-gray-700" : "border-gray-800 opacity-50"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-white mb-1">{entry.question}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${entry.whatsappNumberId ? "bg-green-500/10 text-green-400" : "bg-gray-700 text-gray-400"}`}>
                        {scopeLabel(entry)}
                      </span>
                      {!entry.isActive && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 flex items-center gap-1">
                          <EyeOff className="w-2.5 h-2.5" /> Disabled
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 whitespace-pre-wrap">{entry.answer}</p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                      <button
                        onClick={() => handleToggleActive(entry)}
                        title={entry.isActive ? "Disable (AI will stop using this)" : "Enable"}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => startEdit(entry)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(entry.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
