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
} from "lucide-react";
import { Agent } from "@/types";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

export default function AgentsPage() {
  const { data: session } = useSession();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "AGENT" as "ADMIN" | "AGENT",
  });

  if (session && session.user.role !== "ADMIN") {
    redirect("/inbox");
  }

  useEffect(() => {
    axios
      .get("/api/agents")
      .then((r) => setAgents(r.data))
      .catch(() => toast.error("Failed to load agents"))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!form.name || !form.email || !form.password) {
      return toast.error("All fields are required");
    }
    setCreating(true);
    try {
      const res = await axios.post("/api/agents", form);
      setAgents((prev) => [res.data, ...prev]);
      setShowCreate(false);
      setForm({ name: "", email: "", password: "", role: "AGENT" });
      toast.success(`Agent ${res.data.name} created`);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error ?? "Failed"
        : "Failed";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(agent: Agent) {
    try {
      const res = await axios.patch(`/api/agents/${agent.id}`, {
        isActive: !agent.isActive,
      });
      setAgents((prev) =>
        prev.map((a) => (a.id === agent.id ? res.data : a))
      );
      toast.success(
        res.data.isActive ? `${agent.name} reactivated` : `${agent.name} deactivated`
      );
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
          <p className="text-xs text-gray-500 mt-0.5">
            Manage your support team members
          </p>
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
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">
                  Agent
                </th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 hidden md:table-cell">
                  Email
                </th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">
                  Role
                </th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">
                  Status
                </th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 hidden lg:table-cell">
                  Joined
                </th>
                <th className="text-right text-xs text-gray-500 font-medium px-4 py-3">
                  Actions
                </th>
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
                      <span className="text-sm font-medium text-white">
                        {agent.name}
                        {agent.id === session?.user?.id && (
                          <span className="ml-1 text-xs text-gray-500">(you)</span>
                        )}
                      </span>
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
                      <Badge variant={agent.role === "ADMIN" ? "purple" : "blue"}>
                        {agent.role}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={agent.isActive ? "green" : "red"}>
                      {agent.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs text-gray-500">
                      {formatRelativeTime(agent.createdAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {agent.id !== session?.user?.id && (
                      <button
                        onClick={() => toggleActive(agent)}
                        className={`flex items-center gap-1 ml-auto text-xs transition px-2 py-1 rounded ${
                          agent.isActive
                            ? "text-red-400 hover:text-red-300 hover:bg-red-900/20"
                            : "text-green-400 hover:text-green-300 hover:bg-green-900/20"
                        }`}
                      >
                        {agent.isActive ? (
                          <>
                            <UserX className="w-3.5 h-3.5" /> Deactivate
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3.5 h-3.5" /> Reactivate
                          </>
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Agent Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Invite New Agent"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Full Name <span className="text-red-400">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Jane Smith"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="jane@yourcompany.com"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Password <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) =>
                setForm((p) => ({ ...p, password: e.target.value }))
              }
              placeholder="Strong password"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  role: e.target.value as "ADMIN" | "AGENT",
                }))
              }
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="AGENT">Agent</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
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
    </div>
  );
}
