"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Plus, Loader2, Radio, CheckCircle2, XCircle, Clock, Users, ChevronRight, X } from "lucide-react";
import { Broadcast, BroadcastStatus, Template, Contact } from "@/types";
import { formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";

function StatusBadge({ status }: { status: BroadcastStatus }) {
  const map: Record<BroadcastStatus, { label: string; className: string; icon: React.ReactNode }> = {
    DRAFT:     { label: "Draft",     className: "bg-gray-700 text-gray-300",   icon: <Clock className="w-3 h-3" /> },
    SENDING:   { label: "Sending",   className: "bg-blue-900/40 text-blue-400", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    COMPLETED: { label: "Completed", className: "bg-green-900/40 text-green-400", icon: <CheckCircle2 className="w-3 h-3" /> },
    FAILED:    { label: "Failed",    className: "bg-red-900/40 text-red-400",  icon: <XCircle className="w-3 h-3" /> },
  };
  const { label, className, icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {icon}{label}
    </span>
  );
}

export default function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchBroadcasts = useCallback(async () => {
    try {
      const res = await axios.get("/api/broadcasts");
      setBroadcasts(res.data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBroadcasts(); }, [fetchBroadcasts]);

  async function handleSend(id: string) {
    try {
      await axios.post(`/api/broadcasts/${id}/send`);
      toast.success("Broadcast started — messages will be sent in the background");
      setBroadcasts((prev) => prev.map((b) => b.id === id ? { ...b, status: "SENDING" } : b));
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error ?? "Failed" : "Failed";
      toast.error(msg);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center">
            <Radio className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Broadcasts</h1>
            <p className="text-xs text-gray-500">Send template messages to multiple contacts at once</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-xl transition"
        >
          <Plus className="w-4 h-4" /> New Broadcast
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
      ) : broadcasts.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          <Radio className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No broadcasts yet — create one to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {broadcasts.map((b) => (
            <div key={b.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-white truncate">{b.name}</p>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    Template: <span className="text-gray-400">{b.template?.name}</span>
                    {" · "}
                    <Users className="inline w-3 h-3 mb-0.5" /> {b._count?.recipients ?? 0} recipients
                    {" · "}
                    {formatRelativeTime(b.createdAt)}
                  </p>
                  {b.status === "COMPLETED" && (
                    <p className="text-xs">
                      <span className="text-green-400">{b.sentCount} sent</span>
                      {b.failedCount > 0 && <span className="text-red-400 ml-2">{b.failedCount} failed</span>}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {b.status === "DRAFT" && (
                    <button
                      onClick={() => handleSend(b.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg transition"
                    >
                      <ChevronRight className="w-3.5 h-3.5" /> Send
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateBroadcastModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={(b) => { setBroadcasts((prev) => [b, ...prev]); setShowCreate(false); }}
      />
    </div>
  );
}

function CreateBroadcastModal({
  isOpen,
  onClose,
  onCreate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (b: Broadcast) => void;
}) {
  const [step, setStep] = useState<"template" | "contacts">("template");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStep("template");
    setSelectedTemplate(null);
    setSelectedIds(new Set());
    setName("");
    setTagFilter("");
    axios.get("/api/templates").then((r) => setTemplates(r.data.filter((t: Template) => t.isApproved))).catch(() => {});
    axios.get("/api/contacts?limit=500").then((r) => setContacts(r.data.contacts ?? [])).catch(() => {});
  }, [isOpen]);

  const allTags = Array.from(new Set(contacts.flatMap((c) => (c.tags as string[]) || [])));
  const filteredContacts = contacts.filter((c) => {
    if (c.optedOut) return false;
    if (tagFilter) return (c.tags as string[]).includes(tagFilter);
    return true;
  });

  function toggleAll() {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map((c) => c.id)));
    }
  }

  async function handleCreate() {
    if (!selectedTemplate || selectedIds.size === 0) return;
    setSaving(true);
    try {
      const res = await axios.post("/api/broadcasts", {
        name: name.trim() || undefined,
        templateId: selectedTemplate.id,
        contactIds: Array.from(selectedIds),
      });
      onCreate(res.data);
      toast.success(`Broadcast created with ${selectedIds.size} recipients`);
    } catch {
      toast.error("Failed to create broadcast");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Broadcast" className="max-w-lg">
      {step === "template" ? (
        <div>
          <p className="text-xs text-gray-500 mb-3">Only approved templates can be sent as broadcasts</p>
          <div className="space-y-2 max-h-72 overflow-y-auto mb-4">
            {templates.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">No approved templates found</p>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t)}
                  className={`w-full text-left p-3 rounded-xl border transition ${
                    selectedTemplate?.id === t.id
                      ? "border-green-500 bg-green-900/20"
                      : "border-gray-700 bg-gray-800 hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-white">{t.name}</span>
                    <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">{t.category}</span>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2">{t.content}</p>
                </button>
              ))
            )}
          </div>
          <button
            onClick={() => setStep("contacts")}
            disabled={!selectedTemplate}
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm rounded-xl transition"
          >
            Next: Select Recipients
          </button>
        </div>
      ) : (
        <div>
          <button onClick={() => setStep("template")} className="text-xs text-gray-500 hover:text-white mb-3 flex items-center gap-1">
            <X className="w-3 h-3" /> Back
          </button>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Broadcast name (optional)"
            className="w-full mb-3 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <div className="flex items-center gap-2 mb-3">
            <select
              value={tagFilter}
              onChange={(e) => { setTagFilter(e.target.value); setSelectedIds(new Set()); }}
              className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none"
            >
              <option value="">All non-opted-out contacts</option>
              {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
            <button onClick={toggleAll} className="text-xs text-green-400 hover:text-green-300 whitespace-nowrap">
              {selectedIds.size === filteredContacts.length ? "Deselect all" : "Select all"} ({filteredContacts.length})
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto space-y-1 mb-4 border border-gray-700 rounded-xl p-2">
            {filteredContacts.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">No contacts available</p>
            ) : (
              filteredContacts.map((c) => (
                <label key={c.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={(e) => {
                      const next = new Set(selectedIds);
                      if (e.target.checked) { next.add(c.id); } else { next.delete(c.id); }
                      setSelectedIds(next);
                    }}
                    className="accent-green-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">{c.name ?? c.phone}</p>
                    {c.name && <p className="text-[10px] text-gray-500">+{c.phone}</p>}
                  </div>
                </label>
              ))
            )}
          </div>
          <button
            onClick={handleCreate}
            disabled={saving || selectedIds.size === 0}
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm rounded-xl transition flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Create Broadcast ({selectedIds.size} recipients)
          </button>
        </div>
      )}
    </Modal>
  );
}
