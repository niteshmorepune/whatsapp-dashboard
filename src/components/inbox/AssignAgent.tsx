"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { UserPlus, X, Loader2 } from "lucide-react";
import { Conversation } from "@/types";
import { toast } from "sonner";

interface EligibleAgent {
  id: string;
  name: string;
}

interface AssignAgentProps {
  conversation: Conversation;
  onAssigned: (updated: Conversation) => void;
}

/**
 * Fully equal multi-agent assignment (2026-09-02) — every assignee shows
 * as a removable chip; the select adds one more. Replaces the old single
 * "Unassigned"/one-name dropdown.
 */
export function AssignAgent({ conversation, onAssigned }: AssignAgentProps) {
  const [eligibleAgents, setEligibleAgents] = useState<EligibleAgent[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    axios
      .get(`/api/conversations/${conversation.id}/eligible-agents`)
      .then((r) => setEligibleAgents(r.data))
      .catch(() => {});
  }, [conversation.id]);

  const assignees = conversation.assignees ?? [];
  const assignedIds = new Set(assignees.map((a) => a.agentId));
  const addableAgents = eligibleAgents.filter((a) => !assignedIds.has(a.id));

  async function handleAdd(agentId: string) {
    if (!agentId) return;
    setLoadingId(agentId);
    try {
      const res = await axios.post(`/api/conversations/${conversation.id}/assignees`, { agentId });
      onAssigned(res.data);
      toast.success(`Assigned to ${eligibleAgents.find((a) => a.id === agentId)?.name}`);
    } catch {
      toast.error("Failed to assign agent");
    } finally {
      setLoadingId(null);
    }
  }

  async function handleRemove(agentId: string, agentName: string) {
    setLoadingId(agentId);
    try {
      const res = await axios.delete(`/api/conversations/${conversation.id}/assignees/${agentId}`);
      onAssigned(res.data);
      toast.success(`Removed ${agentName}`);
    } catch {
      toast.error("Failed to unassign agent");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <UserPlus className="w-4 h-4 text-gray-400 flex-shrink-0 hidden sm:block" />
      {assignees.length === 0 && (
        <span className="text-xs text-gray-500">Unassigned</span>
      )}
      {assignees.map((a) => (
        <span
          key={a.agentId}
          className="inline-flex items-center gap-1 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-2 py-1"
        >
          {a.agent.name}
          <button
            type="button"
            onClick={() => handleRemove(a.agentId, a.agent.name)}
            disabled={loadingId === a.agentId}
            aria-label={`Remove ${a.agent.name}`}
            className="text-gray-500 hover:text-red-400 disabled:opacity-50"
          >
            {loadingId === a.agentId ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
          </button>
        </span>
      ))}
      {addableAgents.length > 0 && (
        <select
          value=""
          onChange={(e) => handleAdd(e.target.value)}
          disabled={loadingId !== null}
          className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50 max-w-[110px] sm:max-w-none sm:text-sm"
        >
          <option value="">+ Add agent</option>
          {addableAgents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
