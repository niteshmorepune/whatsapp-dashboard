"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Search, Plus, ChevronRight, Loader2 } from "lucide-react";
import { Contact } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { formatPhone, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

interface ContactsTableProps {
  onSelect: (contact: Contact) => void;
  selectedId: string | null;
}

export function ContactsTable({ onSelect, selectedId }: ContactsTableProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    tags: "",
  });

  const fetchContacts = useCallback(async () => {
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await axios.get(`/api/contacts${params}`);
      setContacts(res.data.contacts);
    } catch {
      toast.error("Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(fetchContacts, 300);
    return () => clearTimeout(t);
  }, [fetchContacts]);

  async function handleCreate() {
    if (!form.phone) return toast.error("Phone is required");
    setCreating(true);
    try {
      const tags = form.tags
        ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [];
      const res = await axios.post("/api/contacts", {
        phone: form.phone,
        name: form.name || null,
        email: form.email || null,
        tags,
      });
      setContacts((prev) => [res.data, ...prev]);
      setShowCreate(false);
      setForm({ name: "", phone: "", email: "", tags: "" });
      toast.success("Contact created");
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error ?? "Failed"
        : "Failed";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <h1 className="text-lg font-semibold text-white">Contacts</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          Add Contact
        </button>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-gray-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or email…"
            className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-green-500" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-600">
            <p className="text-sm">No contacts found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-900 border-b border-gray-800">
              <tr>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">
                  Contact
                </th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 hidden md:table-cell">
                  Phone
                </th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 hidden lg:table-cell">
                  Tags
                </th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 hidden lg:table-cell">
                  Status
                </th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 hidden xl:table-cell">
                  Last Active
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr
                  key={contact.id}
                  onClick={() => onSelect(contact)}
                  className={`border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition ${
                    selectedId === contact.id ? "bg-gray-800" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={contact.name ?? contact.phone}
                        size="sm"
                      />
                      <div>
                        <p className="text-sm font-medium text-white">
                          {contact.name ?? "—"}
                        </p>
                        <p className="text-xs text-gray-500 md:hidden">
                          {formatPhone(contact.phone)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-sm text-gray-300">
                      {formatPhone(contact.phone)}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {(contact.tags as string[]).map((tag) => (
                        <Badge key={tag} variant="blue">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <Badge variant={contact.optedOut ? "red" : "green"}>
                      {contact.optedOut ? "Opted out" : "Active"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <span className="text-xs text-gray-500">
                      {formatRelativeTime(contact.updatedAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add New Contact"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Phone Number <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="+1234567890"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="John Doe"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="john@example.com"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
              placeholder="vip, support, sales"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
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
              Create Contact
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
