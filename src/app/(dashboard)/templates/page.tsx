"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Plus, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { Template } from "@/types";
import { TemplateList } from "@/components/templates/TemplateList";
import { TemplateEditor } from "@/components/templates/TemplateEditor";
import { toast } from "sonner";

export default function TemplatesPage() {
  const { data: session } = useSession();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const isAdmin = session?.user?.role === "ADMIN";

  useEffect(() => {
    axios
      .get("/api/templates")
      .then((r) => setTemplates(r.data))
      .catch(() => toast.error("Failed to load templates"))
      .finally(() => setLoading(false));
  }, []);

  function handleEdit(template: Template) {
    setEditingTemplate(template);
    setEditorOpen(true);
  }

  function handleCreate() {
    setEditingTemplate(null);
    setEditorOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    try {
      await axios.delete(`/api/templates/${id}`);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast.success("Template deleted");
    } catch {
      toast.error("Failed to delete template");
    }
  }

  async function handleToggleApprove(template: Template) {
    try {
      const res = await axios.patch(`/api/templates/${template.id}`, {
        isApproved: !template.isApproved,
      });
      setTemplates((prev) =>
        prev.map((t) => (t.id === template.id ? res.data : t))
      );
      toast.success(
        res.data.isApproved ? "Template approved" : "Approval revoked"
      );
    } catch {
      toast.error("Failed to update template");
    }
  }

  function handleSaved(saved: Template) {
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === saved.id);
      if (idx === -1) return [saved, ...prev];
      const updated = [...prev];
      updated[idx] = saved;
      return updated;
    });
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900">
        <div>
          <h1 className="text-lg font-semibold text-white">Templates</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage approved WhatsApp message templates
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          New Template
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-green-500" />
          </div>
        ) : (
          <TemplateList
            templates={templates}
            isAdmin={isAdmin}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleApprove={handleToggleApprove}
          />
        )}
      </div>

      <TemplateEditor
        key={editingTemplate?.id ?? "new"}
        template={editingTemplate}
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaved}
      />
    </div>
  );
}
