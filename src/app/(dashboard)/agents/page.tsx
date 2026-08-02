"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import {
  Plus,
  Loader2,
  UserCheck,
  UserX,
  Shield,
  User,
  Pencil,
} from "lucide-react";
import { Agent, WhatsappNumber } from "@/types";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

const emptyCreate = { name: "", email: "", password: "", role: "AGENT" as "ADMIN" | "AGENT", whatsappNumberIds: [] as string[] };
const emptyEdit = { name: "", email: "", password: "", role: "AGENT" as "ADMIN" | "AGENT", whatsappNumberIds: [] as string[] };

function LineCheckboxes({
  numbers,
  selected,
  onChange,
}: {
  numbers: WhatsappNumber[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      {numbers.map((n) => (
        <label key={n.id} className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={selected.includes(n.id)}
            onChange={(e) =>
              onChange(e.target.checked ? [...selected, n.id] : selected.filter((id) => id !== n.id))
            }
            className="rounded border-gray-700 bg-gray-800 text-green-500 focus:ring-green-500"
          />
          {n.label} <span className="text-gray-600">({n.businessNumber})</span>
        </label>
      ))}
      {numbers.length === 0 && (
        <p className="text-xs text-gray-600">No WhatsApp numbers configured yet — add one on the Numbers page.</p>
      )}
    </div>
  );
}

export default function AgentsPage() {
  const { data: session } = useSession();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [numbers, setNumbers] = useState<WhatsappNumber[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);

  const [editTarget, setEditTarget] = useState<Agent | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState(emptyEdit);

  if (session && session.user.role !== "ADMIN") {
    redirect("/inbox");
  }

  useEffect(() => {
    axios
      .get("/api/agents")
      .then((r) => setAgents(r.data))
      .catch(() => toast.error("Failed to load agents"))
      .finally(() => setLoading(false));
    axios
      .get("/api/whatsapp-numbers")
      .then((r) => setNumbers(r.data))
      .catch(() => toast.error("Failed to load WhatsApp numbers"));
  }, []);

  function openEdit(agent: Agent) {
    setEditTarget(agent);
    setEditForm({
      name: agent.name,
      email: agent.email,
      password: "",
      role: agent.role,
      whatsappNumberIds: agent.whatsappNumberGrants?.map((g) => g.whatsappNumber.id) ?? [],
    });
  }

  async function handleCreate() {
    if (!createForm.name || !createForm.email || !createForm.password) {
      return toast.error("All fields are required");
    }
    setCreating(true);
    try {
      const res = await axios.post("/api/agents", createForm);
      setAgents((prev) => [res.data, ...prev]);
      setShowCreate(false);
      setCreateForm(emptyCreate);
      toast.success(`Agent ${res.data.name} created`);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error ?? "Failed" : "Failed";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    if (!editForm.name || !editForm.email) return toast.error("Name and email are required");
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        whatsappNumberIds: editForm.whatsappNumberIds,
      };
      if (editForm.password) payload.password = editForm.password;
      const res = await axios.patch(`/api/agents/${editTarget.id}`, payload);
      setAgents((prev) => prev.map((a) => (a.id === editTarget.id ? res.data : a)));
      setEditTarget(null);
      toast.success(`${res.data.name} updated`);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error ?? "Failed" : "Failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(agent: Agent) {
    try {
      const res = await axios.patch(`/api/agents/${agent.id}`, {
        isActive: !agent.isActive,
      });
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? res.data : a)));
      toast.success(res.data.isActive ? `${agent.name} reactivated` : `${agent.name} deactivated`);
    } catch {
      toast.error("Failed to update agent");
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900">
        <div>
          <h1 className="text-lg font-semibold text-white">Agents</h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage your support team members</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          Invite Agent
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-green-500" />
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-900 border-b border-gray-800">
              <tr>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Agent</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 hidden md:table-cell">Email</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Role</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Status</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 hidden lg:table-cell">Joined</th>
                <th className="text-right text-xs text-gray-500 font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr
                  key={agent.id}
                  className="border-b border-gray-800/50 hover:bg-gray-800/20 transition"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={agent.name} size="sm" />
                      <div>
                        <span className="text-sm font-medium text-white">
                          {agent.name}
                          {agent.id === session?.user?.id && (
                            <span className="ml-1 text-xs text-gray-500">(you)</span>
                          )}
                        </span>
                        {agent.role !== "ADMIN" && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {(agent.whatsappNumberGrants ?? []).length === 0 ? (
                              <span className="text-[10px] text-amber-500">No lines granted</span>
                            ) : (
                              agent.whatsappNumberGrants!.map((g) => (
                                <span
                                  key={g.whatsappNumber.id}
                                  className="text-[10px] text-gray-500 bg-gray-800 rounded px-1.5 py-0.5"
                                >
                                  {g.whatsappNumber.label}
                                </span>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-sm text-gray-300">{agent.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {agent.role === "ADMIN" ? (
                        <Shield className="w-3.5 h-3.5 text-purple-400" />
                      ) : (
                        <User className="w-3.5 h-3.5 text-blue-400" />
                      )}
                      <Badge variant={agent.role === "ADMIN" ? "purple" : "blue"}>{agent.role}</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={agent.isActive ? "green" : "red"}>
                      {agent.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs text-gray-500">{formatRelativeTime(agent.createdAt)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(agent)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition px-2 py-1 rounded"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      {agent.id !== session?.user?.id && (
                        <button
                          onClick={() => toggleActive(agent)}
                          className={`flex items-center gap-1 text-xs transition px-2 py-1 rounded ${
                            agent.isActive
                              ? "text-red-400 hover:text-red-300 hover:bg-red-900/20"
                              : "text-green-400 hover:text-green-300 hover:bg-green-900/20"
                          }`}
                        >
                          {agent.isActive ? (
                            <><UserX className="w-3.5 h-3.5" /> Deactivate</>
                          ) : (
                            <><UserCheck className="w-3.5 h-3.5" /> Reactivate</>
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Agent Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Invite New Agent">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Full Name <span className="text-red-400">*</span></label>
            <input
              value={createForm.name}
              onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Jane Smith"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email <span className="text-red-400">*</span></label>
            <input
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="jane@yourcompany.com"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password <span className="text-red-400">*</span></label>
            <input
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
              placeholder="Strong password"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Role</label>
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value as "ADMIN" | "AGENT" }))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="AGENT">Agent</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          {createForm.role === "AGENT" && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">WhatsApp lines this agent can see</label>
              <LineCheckboxes
                numbers={numbers}
                selected={createForm.whatsappNumberIds}
                onChange={(ids) => setCreateForm((p) => ({ ...p, whatsappNumberIds: ids }))}
              />
            </div>
          )}
          <div className="flex gap-3 pt-2">
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
              Create Agent
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Agent Modal */}
      <Modal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Edit — ${editTarget?.name ?? ""}`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Full Name <span className="text-red-400">*</span></label>
            <input
              value={editForm.name}
              onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email <span className="text-red-400">*</span></label>
            <input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              New Password <span className="text-gray-600">(leave blank to keep current)</span>
            </label>
            <input
              type="password"
              value={editForm.password}
              onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))}
              placeholder="Leave blank to keep unchanged"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Role</label>
            <select
              value={editForm.role}
              onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value as "ADMIN" | "AGENT" }))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="AGENT">Agent</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          {editForm.role === "AGENT" && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">WhatsApp lines this agent can see</label>
              <LineCheckboxes
                numbers={numbers}
                selected={editForm.whatsappNumberIds}
                onChange={(ids) => setEditForm((p) => ({ ...p, whatsappNumberIds: ids }))}
              />
            </div>
          )}
          <div className="flex gap-3 pt-2">
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
        </div>
      </Modal>
    </div>
  );
}
