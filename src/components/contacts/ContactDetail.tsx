"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  X,
  Phone,
  Mail,
  Tag,
  Loader2,
  MessageSquare,
  CheckCircle,
  XCircle,
  Trash2,
  StickyNote,
  Send,
} from "lucide-react";
import { Contact, Conversation, ContactNote } from "@/types";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { QuickSendModal } from "@/components/contacts/QuickSendModal";
import { formatPhone, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

interface ContactDetailProps {
  contact: Contact;
  onClose: () => void;
  onUpdate: (updated: Contact) => void;
  onDelete?: (id: string) => void;
}

export function ContactDetail({
  contact,
  onClose,
  onUpdate,
  onDelete,
}: ContactDetailProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [quickSendOpen, setQuickSendOpen] = useState(false);
  const [form, setForm] = useState({
    name: contact.name ?? "",
    email: contact.email ?? "",
    tags: (contact.tags as string[]).join(", "),
  });

  const refetchConversations = useCallback(() => {
    axios
      .get(`/api/contacts/${contact.id}`)
      .then((r) => setConversations(r.data.conversations ?? []))
      .catch(() => {})
      .finally(() => setLoadingConvs(false));
  }, [contact.id]);

  useEffect(() => {
    refetchConversations();
    axios.get(`/api/contacts/${contact.id}/notes`).then((r) => setNotes(r.data)).catch(() => {});
  }, [contact.id, refetchConversations]);

  async function addNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      const res = await axios.post(`/api/contacts/${contact.id}/notes`, { content: noteText.trim() });
      setNotes((prev) => [res.data, ...prev]);
      setNoteText("");
    } catch {
      toast.error("Failed to save note");
    } finally {
      setSavingNote(false);
    }
  }

  async function deleteNote(noteId: string) {
    try {
      await axios.delete(`/api/contacts/${contact.id}/notes/${noteId}`);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {
      toast.error("Failed to delete note");
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const tags = form.tags
        ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [];
      const res = await axios.patch(`/api/contacts/${contact.id}`, {
        name: form.name || null,
        email: form.email || null,
        tags,
      });
      onUpdate(res.data);
      setEditing(false);
      toast.success("Contact updated");
    } catch {
      toast.error("Failed to update contact");
    } finally {
      setSaving(false);
    }
  }

  async function toggleOptOut() {
    try {
      const res = await axios.patch(`/api/contacts/${contact.id}`, {
        optedOut: !contact.optedOut,
      });
      onUpdate(res.data);
      toast.success(res.data.optedOut ? "Contact opted out" : "Contact opted back in");
    } catch {
      toast.error("Failed to update opt-out status");
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await axios.delete(`/api/contacts/${contact.id}`);
      toast.success("Contact deleted");
      onDelete?.(contact.id);
      onClose();
    } catch {
      toast.error("Failed to delete contact");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-900 border-l border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-white">Contact Details</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setQuickSendOpen(true)}
            title="Send message or template"
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition"
          >
            <Send className="w-3.5 h-3.5" /> Send
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Profile */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-start gap-3 mb-3">
            <Avatar
              name={contact.name ?? contact.phone}
              size="lg"
            />
            <div className="flex-1">
              {editing ? (
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="Name"
                  className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500 mb-1"
                />
              ) : (
                <p className="text-sm font-semibold text-white">
                  {contact.name ?? "No name"}
                </p>
              )}
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Phone className="w-3 h-3" />
                {formatPhone(contact.phone)}
              </div>
            </div>
          </div>

          {/* Email */}
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-3.5 h-3.5 text-gray-500" />
            {editing ? (
              <input
                value={form.email}
                onChange={(e) =>
                  setForm((p) => ({ ...p, email: e.target.value }))
                }
                placeholder="Email"
                type="email"
                className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            ) : (
              <span className="text-xs text-gray-400">
                {contact.email ?? "No email"}
              </span>
            )}
          </div>

          {/* Tags */}
          <div className="flex items-start gap-2 mb-3">
            <Tag className="w-3.5 h-3.5 text-gray-500 mt-0.5" />
            {editing ? (
              <input
                value={form.tags}
                onChange={(e) =>
                  setForm((p) => ({ ...p, tags: e.target.value }))
                }
                placeholder="vip, support"
                className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            ) : (
              <div className="flex flex-wrap gap-1">
                {(contact.tags as string[]).length > 0 ? (
                  (contact.tags as string[]).map((tag) => (
                    <Badge key={tag} variant="blue">
                      {tag}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-gray-600">No tags</span>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-1.5 text-xs bg-green-500 hover:bg-green-600 text-white rounded-lg transition flex items-center justify-center gap-1"
                >
                  {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                  Save
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="flex-1 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
                >
                  Edit
                </button>
                <button
                  onClick={toggleOptOut}
                  className={`flex-1 py-1.5 text-xs rounded-lg transition flex items-center justify-center gap-1 ${
                    contact.optedOut
                      ? "bg-green-700 hover:bg-green-600 text-white"
                      : "bg-red-700 hover:bg-red-600 text-white"
                  }`}
                >
                  {contact.optedOut ? (
                    <>
                      <CheckCircle className="w-3 h-3" /> Opt in
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3" /> Opt out
                    </>
                  )}
                </button>
              </>
            )}
          </div>

          {/* Delete */}
          {!editing && (
            <div className="mt-2">
              {confirmDelete ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg transition flex items-center justify-center gap-1"
                  >
                    {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Confirm Delete
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full py-1.5 text-xs bg-gray-800 hover:bg-red-900/40 border border-gray-700 hover:border-red-700 text-gray-400 hover:text-red-400 rounded-lg transition flex items-center justify-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Delete Contact
                </button>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="p-4 border-b border-gray-800">
          <h4 className="text-xs font-medium text-gray-500 mb-3 flex items-center gap-2">
            <StickyNote className="w-3.5 h-3.5" />
            INTERNAL NOTES
          </h4>
          <div className="flex gap-2 mb-3">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note visible to all agents…"
              rows={2}
              className="flex-1 resize-none px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); }
              }}
            />
            <button
              onClick={addNote}
              disabled={savingNote || !noteText.trim()}
              className="w-8 h-8 mt-auto flex items-center justify-center rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white transition"
            >
              {savingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            </button>
          </div>
          <div className="space-y-2">
            {notes.map((note) => (
              <div key={note.id} className="p-2.5 bg-gray-800 rounded-lg border border-gray-700 group">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-white leading-relaxed whitespace-pre-wrap flex-1">{note.content}</p>
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition flex-shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  {note.agent.name} · {new Date(note.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Conversations */}
        <div className="p-4">
          <h4 className="text-xs font-medium text-gray-500 mb-3 flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5" />
            CONVERSATION HISTORY ({conversations.length})
          </h4>

          {loadingConvs ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-4">
              No conversations yet
            </p>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className="p-3 bg-gray-800 rounded-lg border border-gray-700"
                >
                  <div className="flex items-center justify-between mb-1">
                    <Badge
                      variant={
                        conv.status === "OPEN"
                          ? "green"
                          : conv.status === "PENDING"
                          ? "yellow"
                          : "gray"
                      }
                    >
                      {conv.status}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {formatRelativeTime(conv.lastMessageAt)}
                    </span>
                  </div>
                  {conv.messages?.[0] && (
                    <p className="text-xs text-gray-400 truncate">
                      {conv.messages[0].content}
                    </p>
                  )}
                  {conv.agent && (
                    <p className="text-xs text-gray-600 mt-1">
                      Assigned: {conv.agent.name}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <QuickSendModal
        contact={quickSendOpen ? contact : null}
        onClose={() => setQuickSendOpen(false)}
        onSent={refetchConversations}
      />
    </div>
  );
}
