"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { UserPlus, Loader2 } from "lucide-react";
import { Agent, Conversation } from "@/types";
import { toast } from "sonner";

interface AssignAgentProps {
  conversation: Conversation;
  onAssigned: (updated: Conversation) => void;
}

export function AssignAgent({ conversation, onAssigned }: AssignAgentProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios
      .get("/api/agents")
      .then((r) => setAgents(r.data))
      .catch(() => {});
  }, []);

  async function handleAssign(agentId: string | null) {
    setLoading(true);
    try {
      const res = await axios.post(`/api/conversations/${conversation.id}/assign`, {
        agentId,
      });
      onAssigned(res.data);
      toast.success(
        agentId
          ? `Assigned to ${agents.find((a) => a.id === agentId)?.name}`
          : "Unassigned"
      );
    } catch {
      toast.error("Failed to assign agent");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <UserPlus className="w-4 h-4 text-gray-400 flex-shrink-0 hidden sm:block" />
      <select
        value={conversation.agentId ?? ""}
        onChange={(e) => handleAssign(e.target.value || null)}
        disabled={loading}
        className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50 max-w-[110px] sm:max-w-none sm:text-sm"
      >
        <option value="">Unassigned</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
      {loading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
    </div>
  );
}
