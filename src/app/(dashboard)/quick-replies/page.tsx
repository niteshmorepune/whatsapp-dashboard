"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { Plus, Pencil, Trash2, Loader2, Zap, X, Check } from "lucide-react";
import { QuickReply } from "@/types";
import { toast } from "sonner";

export default function QuickRepliesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user.role === "ADMIN";

  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", content: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get("/api/quick-replies").then((r) => setReplies(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function startEdit(reply: QuickReply) {
    setEditingId(reply.id);
    setForm({ name: reply.name, content: reply.content });
    setShowForm(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ name: "", content: "" });
  }

  async function handleSave() {
    if (!form.name.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        const res = await axios.patch(`/api/quick-replies/${editingId}`, form);
        setReplies((prev) => prev.map((r) => (r.id === editingId ? res.data : r)));
        setEditingId(null);
      } else {
        const res = await axios.post("/api/quick-replies", form);
        setReplies((prev) => [...prev, res.data]);
        setShowForm(false);
      }
      setForm({ name: "", content: "" });
      toast.success(editingId ? "Updated" : "Created");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await axios.delete(`/api/quick-replies/${id}`);
      setReplies((prev) => prev.filter((r) => r.id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-yellow-500/10 rounded-xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Quick Replies</h1>
            <p className="text-xs text-gray-500">Pre-saved responses agents can insert instantly</p>
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

      {/* Create form */}
      {isAdmin && showForm && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-4">
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Short name (e.g. Greeting)"
            className="w-full mb-2 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <textarea
            value={form.content}
            onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
            placeholder="Reply content…"
            rows={3}
            className="w-full mb-3 resize-none px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <div className="flex gap-2">
            <button onClick={() => { setShowForm(false); setForm({ name: "", content: "" }); }} className="flex-1 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.content.trim()} className="flex-1 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded-lg transition flex items-center justify-center gap-1">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
      ) : replies.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No quick replies yet{isAdmin ? " — create one above" : ""}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {replies.map((reply) =>
            editingId === reply.id ? (
              <div key={reply.id} className="bg-gray-800 border border-green-600/40 rounded-xl p-4">
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full mb-2 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                  rows={3}
                  className="w-full mb-3 resize-none px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                />
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
              <div key={reply.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-start gap-3 group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white mb-1">{reply.name}</p>
                  <p className="text-xs text-gray-400 whitespace-pre-wrap">{reply.content}</p>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                    <button onClick={() => startEdit(reply)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(reply.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition">
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
  );
}
