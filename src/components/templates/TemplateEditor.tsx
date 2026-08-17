"use client";

import { useState } from "react";
import axios from "axios";
import { Loader2 } from "lucide-react";
import { Template } from "@/types";
import { Modal } from "@/components/ui/Modal";
import { toast } from "sonner";

interface TemplateEditorProps {
  template: Template | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (template: Template) => void;
}

const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION", "SERVICE"];
const LANGUAGES = ["en", "en_US"];

export function TemplateEditor({
  template,
  isOpen,
  onClose,
  onSave,
}: TemplateEditorProps) {
  const [form, setForm] = useState({
    name: template?.name ?? "",
    content: template?.content ?? "",
    category: template?.category ?? "UTILITY",
    language: template?.language ?? "en",
    hasButtonParam: template?.hasButtonParam ?? false,
    metaTemplateId: template?.metaTemplateId ?? "",
  });
  const [saving, setSaving] = useState(false);

  // Reset form when template changes
  if (template?.id !== undefined) {
    // handled via key on parent
  }

  async function handleSave() {
    if (!form.name || !form.content) {
      return toast.error("Name and content are required");
    }

    setSaving(true);
    try {
      let res;
      if (template?.id) {
        res = await axios.patch(`/api/templates/${template.id}`, {
          name: form.name,
          content: form.content,
          category: form.category,
          language: form.language,
          hasButtonParam: form.hasButtonParam,
          metaTemplateId: form.metaTemplateId || null,
        });
      } else {
        res = await axios.post("/api/templates", {
          name: form.name,
          content: form.content,
          category: form.category,
          language: form.language,
          hasButtonParam: form.hasButtonParam,
          metaTemplateId: form.metaTemplateId || null,
        });
      }
      onSave(res.data);
      toast.success(template?.id ? "Template updated" : "Template created");
      onClose();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error ?? "Failed"
        : "Failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={template?.id ? "Edit Template" : "Create Template"}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            Template Name <span className="text-red-400">*</span>
          </label>
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="hello_world"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <p className="text-xs text-gray-600 mt-1">
            Must match the template name registered with Meta
          </p>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1">Language</label>
            <select
              value={form.language}
              onChange={(e) => setForm((p) => ({ ...p, language: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-600 mt-1">
              Must match exactly what was selected in Meta at submission
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">
            Content / Preview <span className="text-red-400">*</span>
          </label>
          <textarea
            value={form.content}
            onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
            placeholder="Hello {{1}}, your order {{2}} has been shipped…"
            rows={5}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500 resize-none"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-400">
          <input
            type="checkbox"
            checked={form.hasButtonParam}
            onChange={(e) => setForm((p) => ({ ...p, hasButtonParam: e.target.checked }))}
            className="accent-green-500"
          />
          Has a Dynamic URL button (needs a link value at send time)
        </label>

        <div>
          <label className="block text-sm text-gray-400 mb-1">
            Meta Template ID (optional)
          </label>
          <input
            value={form.metaTemplateId}
            onChange={(e) => setForm((p) => ({ ...p, metaTemplateId: e.target.value }))}
            placeholder="1234567890"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-800 text-white text-sm font-medium rounded-lg transition flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {template?.id ? "Save Changes" : "Create Template"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
