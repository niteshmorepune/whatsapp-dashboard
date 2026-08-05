"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { Plus, Loader2, Pencil, Star, Phone, Bot } from "lucide-react";
import { WhatsappNumber, AiMode, DayHours } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

const emptyForm = {
  label: "",
  businessNumber: "",
  phoneNumberId: "",
  wabaId: "",
  accessToken: "",
  isDefault: false,
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Mirrors src/lib/business-hours.ts's DEFAULT_BUSINESS_HOURS — duplicated
// here (not imported) since that module pulls in the Prisma client, which
// can't run in a "use client" component.
const DEFAULT_BUSINESS_HOURS: DayHours[] = [
  { day: 0, isOpen: false, openTime: "10:00", closeTime: "19:00" },
  { day: 1, isOpen: true, openTime: "10:00", closeTime: "19:00" },
  { day: 2, isOpen: true, openTime: "10:00", closeTime: "19:00" },
  { day: 3, isOpen: true, openTime: "10:00", closeTime: "19:00" },
  { day: 4, isOpen: true, openTime: "10:00", closeTime: "19:00" },
  { day: 5, isOpen: true, openTime: "10:00", closeTime: "19:00" },
  { day: 6, isOpen: true, openTime: "10:00", closeTime: "19:00" },
];

const AI_MODE_OPTIONS: { value: AiMode; label: string; hint: string }[] = [
  { value: "AUTO", label: "Auto", hint: "AI replies only outside the hours/holidays below" },
  { value: "FORCE_ON", label: "Force On", hint: "AI replies to every message, all the time" },
  { value: "FORCE_OFF", label: "Force Off", hint: "AI never replies, even outside hours" },
];

export default function NumbersPage() {
  const { data: session } = useSession();
  const [numbers, setNumbers] = useState<WhatsappNumber[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm);

  const [editTarget, setEditTarget] = useState<WhatsappNumber | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState(emptyForm);
  const [aiMode, setAiMode] = useState<AiMode>("AUTO");
  const [businessHours, setBusinessHours] = useState<DayHours[]>(DEFAULT_BUSINESS_HOURS);

  if (session && session.user.role !== "ADMIN") {
    redirect("/inbox");
  }

  function load() {
    setLoading(true);
    axios
      .get("/api/whatsapp-numbers")
      .then((r) => setNumbers(r.data))
      .catch(() => toast.error("Failed to load numbers"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function openEdit(n: WhatsappNumber) {
    setEditTarget(n);
    setEditForm({
      label: n.label,
      businessNumber: n.businessNumber,
      phoneNumberId: n.phoneNumberId ?? "",
      wabaId: n.wabaId ?? "",
      accessToken: "",
      isDefault: n.isDefault,
    });
    setAiMode(n.aiMode ?? "AUTO");
    setBusinessHours(n.businessHours && n.businessHours.length ? n.businessHours : DEFAULT_BUSINESS_HOURS);
  }

  function updateDayHours(day: number, patch: Partial<DayHours>) {
    setBusinessHours((prev) => prev.map((d) => (d.day === day ? { ...d, ...patch } : d)));
  }

  async function handleCreate() {
    if (!createForm.label || !createForm.businessNumber || !createForm.phoneNumberId || !createForm.wabaId || !createForm.accessToken) {
      return toast.error("All fields except default are required");
    }
    setCreating(true);
    try {
      await axios.post("/api/whatsapp-numbers", createForm);
      setShowCreate(false);
      setCreateForm(emptyForm);
      toast.success("Number added — now grant agents access to it on the Agents page");
      load();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error ?? "Failed" : "Failed";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        label: editForm.label,
        businessNumber: editForm.businessNumber,
        phoneNumberId: editForm.phoneNumberId,
        wabaId: editForm.wabaId,
        isDefault: editForm.isDefault,
        aiMode,
        businessHours,
      };
      if (editForm.accessToken) payload.accessToken = editForm.accessToken;
      await axios.patch(`/api/whatsapp-numbers/${editTarget.id}`, payload);
      setEditTarget(null);
      toast.success(`${editForm.label} updated`);
      load();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error ?? "Failed" : "Failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900">
        <div>
          <h1 className="text-lg font-semibold text-white">WhatsApp Numbers</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Every number your team messages from — grant agents access to each one on the Agents page.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          Add Number
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-green-500" />
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {numbers.length === 0 && (
            <p className="text-sm text-gray-500">No numbers configured yet.</p>
          )}
          {numbers.map((n) => (
            <div
              key={n.id}
              className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center">
                  <Phone className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{n.label}</span>
                    {n.isDefault && (
                      <span title="Default number">
                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      </span>
                    )}
                    {n._count !== undefined && (
                      <Badge variant="blue">{n._count.conversations} conversations</Badge>
                    )}
                    <Badge variant={n.aiCurrentlyLive ? "green" : "gray"}>
                      <Bot className="w-3 h-3 mr-1" />
                      AI {n.aiCurrentlyLive ? "live now" : "off now"}
                      {n.aiMode && n.aiMode !== "AUTO" ? ` (${n.aiMode === "FORCE_ON" ? "forced on" : "forced off"})` : ""}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    {n.businessNumber} · phone_number_id {n.phoneNumberId} · added {formatRelativeTime(n.createdAt)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => openEdit(n)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition px-2 py-1 rounded"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Add WhatsApp Number">
        <NumberForm form={createForm} setForm={setCreateForm} accessTokenRequired />
        <div className="flex gap-3 pt-4">
          <button
            onClick={() => setShowCreate(false)}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex-1 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-800 text-white text-sm font-medium rounded-lg transition flex items-center justify-center gap-2"
          >
            {creating && <Loader2 className="w-4 h-4 animate-spin" />}
            Add Number
          </button>
        </div>
      </Modal>

      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit — ${editTarget?.label ?? ""}`}>
        <NumberForm form={editForm} setForm={setEditForm} accessTokenRequired={false} />

        <div className="mt-6 pt-5 border-t border-gray-800">
          <div className="flex items-center gap-2 mb-1">
            <Bot className="w-4 h-4 text-green-400" />
            <h3 className="text-sm font-semibold text-white">AI After-Hours Assistant</h3>
            {editTarget && (
              <Badge variant={editTarget.aiCurrentlyLive ? "green" : "gray"} className="ml-auto">
                {editTarget.aiCurrentlyLive ? "Live right now" : "Off right now"}
              </Badge>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Answers FAQs from the <span className="text-gray-400">AI FAQ</span> page and captures name/requirement —
            never quotes prices or commits to anything. Muted automatically on any conversation a human replies on.
          </p>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {AI_MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAiMode(opt.value)}
                title={opt.hint}
                className={`px-2 py-2 rounded-lg text-xs font-medium border transition ${
                  aiMode === opt.value
                    ? "bg-green-600/20 border-green-600 text-green-400"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {aiMode === "AUTO" && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                Business hours (Asia/Kolkata) — AI replies outside these hours, and on any day marked closed
              </label>
              <div className="space-y-1.5">
                {businessHours
                  .slice()
                  .sort((a, b) => a.day - b.day)
                  .map((d) => (
                    <div key={d.day} className="flex items-center gap-2 text-xs">
                      <label className="flex items-center gap-1.5 w-24 flex-shrink-0 text-gray-300">
                        <input
                          type="checkbox"
                          checked={d.isOpen}
                          onChange={(e) => updateDayHours(d.day, { isOpen: e.target.checked })}
                          className="rounded border-gray-700 bg-gray-800 text-green-500 focus:ring-green-500"
                        />
                        {DAY_NAMES[d.day]}
                      </label>
                      <input
                        type="time"
                        value={d.openTime}
                        disabled={!d.isOpen}
                        onChange={(e) => updateDayHours(d.day, { openTime: e.target.value })}
                        className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white disabled:opacity-30 focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                      <span className="text-gray-600">to</span>
                      <input
                        type="time"
                        value={d.closeTime}
                        disabled={!d.isOpen}
                        onChange={(e) => updateDayHours(d.day, { closeTime: e.target.value })}
                        className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white disabled:opacity-30 focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                    </div>
                  ))}
              </div>
              <p className="text-[11px] text-gray-600 mt-2">
                Company-wide holidays (also treated as closed) are managed on the Holidays page.
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <button
            onClick={() => setEditTarget(null)}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveEdit}
            disabled={saving}
            className="flex-1 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-800 text-white text-sm font-medium rounded-lg transition flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </Modal>
    </div>
  );
}

function NumberForm({
  form,
  setForm,
  accessTokenRequired,
}: {
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  accessTokenRequired: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1">Label <span className="text-red-400">*</span></label>
        <input
          value={form.label}
          onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
          placeholder="e.g. Marketing"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Business Number <span className="text-red-400">*</span></label>
        <input
          value={form.businessNumber}
          onChange={(e) => setForm((p) => ({ ...p, businessNumber: e.target.value.replace(/\D/g, "") }))}
          placeholder="919112095202 (digits only, country code first)"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Meta Phone Number ID <span className="text-red-400">*</span></label>
        <input
          value={form.phoneNumberId}
          onChange={(e) => setForm((p) => ({ ...p, phoneNumberId: e.target.value }))}
          placeholder="From WhatsApp Manager → API Setup"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Meta WABA ID <span className="text-red-400">*</span></label>
        <input
          value={form.wabaId}
          onChange={(e) => setForm((p) => ({ ...p, wabaId: e.target.value }))}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">
          Access Token {accessTokenRequired ? <span className="text-red-400">*</span> : <span className="text-gray-600">(leave blank to keep current)</span>}
        </label>
        <input
          type="password"
          value={form.accessToken}
          onChange={(e) => setForm((p) => ({ ...p, accessToken: e.target.value }))}
          placeholder={accessTokenRequired ? "Permanent System User token" : "Leave blank to keep unchanged"}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
          className="rounded border-gray-700 bg-gray-800 text-green-500 focus:ring-green-500"
        />
        Default number (used when a client link doesn&apos;t specify a line)
      </label>
    </div>
  );
}
