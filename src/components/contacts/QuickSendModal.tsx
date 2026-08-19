"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Send, FileText, Loader2, MessageSquare } from "lucide-react";
import { Contact, Template, WhatsappNumber } from "@/types";
import { Modal } from "@/components/ui/Modal";
import { isWindowExpired, templateParamCount, renderTemplateContent } from "@/lib/utils";
import { toast } from "sonner";

interface QuickSendModalProps {
  contact: Contact | null;
  onClose: () => void;
  onSent?: () => void;
}

/**
 * One-step "send from the Contacts list" modal — resolves (or creates) the
 * open/pending conversation for the chosen WhatsApp line behind the scenes,
 * then sends through the same /api/send route the Inbox uses, so window
 * expiry, AI-mute-on-human-reply, CRM notify, and SSE fan-out all behave
 * identically to sending from the Inbox thread.
 */
export function QuickSendModal({ contact, onClose, onSent }: QuickSendModalProps) {
  const [numbers, setNumbers] = useState<WhatsappNumber[]>([]);
  const [numberId, setNumberId] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [windowExpiresAt, setWindowExpiresAt] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [mode, setMode] = useState<"text" | "template">("text");
  const [text, setText] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [variableValues, setVariableValues] = useState<string[]>([]);
  const [buttonUrlValue, setButtonUrlValue] = useState("");
  const [sending, setSending] = useState(false);

  const isOpen = !!contact;
  const contactId = contact?.id ?? null;
  const windowExpired = isWindowExpired(windowExpiresAt);

  useEffect(() => {
    if (!isOpen) return;
    axios
      .get("/api/whatsapp-numbers")
      .then((r) => {
        setNumbers(r.data);
        if (r.data.length > 0) {
          const def = r.data.find((n: WhatsappNumber) => n.isDefault) ?? r.data[0];
          setNumberId(def.id);
        }
      })
      .catch(() => toast.error("Failed to load WhatsApp lines"));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !contactId || !numberId) return;
    setResolving(true);
    setConversationId(null);
    setWindowExpiresAt(null);
    axios
      .post(`/api/contacts/${contactId}/conversations`, { whatsappNumberId: numberId })
      .then((r) => {
        setConversationId(r.data.id);
        setWindowExpiresAt(r.data.windowExpiresAt);
      })
      .catch(() => toast.error("Failed to open a conversation on that line"))
      .finally(() => setResolving(false));
  }, [isOpen, contactId, numberId]);

  useEffect(() => {
    if (windowExpired) setMode("template");
  }, [windowExpired]);

  useEffect(() => {
    if (mode === "template" && isOpen && templates.length === 0) {
      axios
        .get("/api/templates")
        .then((r) => setTemplates(r.data.filter((t: Template) => t.isApproved)))
        .catch(() => {});
    }
  }, [mode, isOpen, templates.length]);

  useEffect(() => {
    if (isOpen) return;
    setNumbers([]);
    setNumberId("");
    setConversationId(null);
    setWindowExpiresAt(null);
    setMode("text");
    setText("");
    setTemplates([]);
    setSelectedTemplate(null);
    setVariableValues([]);
    setButtonUrlValue("");
  }, [isOpen]);

  async function doSendTemplate(template: Template, variables: string[], buttonUrlParam: string) {
    if (!conversationId || sending) return;
    setSending(true);
    try {
      const renderedContent = renderTemplateContent(template.content, variables);
      await axios.post("/api/send", {
        conversationId,
        content: renderedContent,
        type: "template",
        templateId: template.id,
        variables,
        buttonUrlParam: buttonUrlParam || undefined,
      });
      toast.success(`Template "${template.name}" sent to ${contact?.name ?? contact?.phone}`);
      onSent?.();
      onClose();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error ?? "Failed to send template"
        : "Failed to send template";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  // Sends immediately for a template with no {{n}} placeholders and no
  // button param; otherwise opens the inline variable-entry step, same
  // shape as the Inbox's own template send (MessageInput.tsx).
  function selectTemplate(template: Template) {
    const paramCount = templateParamCount(template.content);
    if (paramCount === 0 && !template.hasButtonParam) {
      doSendTemplate(template, [], "");
      return;
    }
    setSelectedTemplate(template);
    setVariableValues(Array(paramCount).fill(""));
    setButtonUrlValue("");
  }

  async function sendText() {
    if (!conversationId || !text.trim() || sending) return;
    setSending(true);
    try {
      await axios.post("/api/send", { conversationId, content: text.trim(), type: "text" });
      toast.success(`Message sent to ${contact?.name ?? contact?.phone}`);
      onSent?.();
      onClose();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error ?? "Failed to send"
        : "Failed to send";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={contact ? `Send to ${contact.name ?? contact.phone}` : ""}
      className="max-w-xl"
    >
      {!contact ? null : (
        <div className="space-y-4">
          {numbers.length > 1 && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Send from</label>
              <select
                value={numberId}
                onChange={(e) => setNumberId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
              >
                {numbers.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label} ({n.businessNumber})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setMode("text")}
              disabled={windowExpired}
              className={`flex-1 py-1.5 text-xs rounded-lg transition flex items-center justify-center gap-1.5 ${
                mode === "text" ? "bg-green-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <MessageSquare className="w-3.5 h-3.5" /> Message
            </button>
            <button
              onClick={() => setMode("template")}
              className={`flex-1 py-1.5 text-xs rounded-lg transition flex items-center justify-center gap-1.5 ${
                mode === "template" ? "bg-green-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> Template
            </button>
          </div>

          {windowExpired && mode === "text" && (
            <p className="text-xs text-red-400">
              24-hour window expired on this line — use a template.
            </p>
          )}

          {mode === "text" ? (
            <div className="space-y-3">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={windowExpired || resolving}
                placeholder="Type a message…"
                rows={4}
                className="w-full resize-none px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
              />
              <button
                onClick={sendText}
                disabled={!text.trim() || windowExpired || resolving || sending || !conversationId}
                className="w-full py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition flex items-center justify-center gap-2"
              >
                {(sending || resolving) && <Loader2 className="w-4 h-4 animate-spin" />}
                <Send className="w-4 h-4" /> Send
              </button>
            </div>
          ) : selectedTemplate ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-400 whitespace-pre-line bg-gray-800 border border-gray-700 rounded-lg p-3">
                {selectedTemplate.content}
              </p>
              {variableValues.map((value, i) => (
                <div key={i}>
                  <label className="block text-sm text-gray-400 mb-1">{`Value for {{${i + 1}}}`}</label>
                  <input
                    value={value}
                    onChange={(e) =>
                      setVariableValues((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                    }
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              ))}
              {selectedTemplate.hasButtonParam && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Button link value</label>
                  <input
                    value={buttonUrlValue}
                    onChange={(e) => setButtonUrlValue(e.target.value)}
                    placeholder="e.g. a lead or order id appended to the button's URL"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedTemplate(null)}
                  className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition"
                >
                  Back
                </button>
                <button
                  onClick={() => doSendTemplate(selectedTemplate, variableValues, buttonUrlValue)}
                  disabled={
                    sending ||
                    resolving ||
                    !conversationId ||
                    variableValues.some((v) => !v.trim()) ||
                    (selectedTemplate.hasButtonParam && !buttonUrlValue.trim())
                  }
                  className="flex-1 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-800 text-white text-sm font-medium rounded-lg transition flex items-center justify-center gap-2"
                >
                  {(sending || resolving) && <Loader2 className="w-4 h-4 animate-spin" />}
                  Send
                </button>
              </div>
            </div>
          ) : templates.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">
              No approved templates found. Create and approve templates in the Templates page.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectTemplate(t)}
                  disabled={sending || resolving || !conversationId}
                  className="w-full text-left p-3 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-green-600 rounded-xl transition group disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-white group-hover:text-green-400 transition">
                      {t.name}
                    </span>
                    <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">
                      {t.category}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2">{t.content}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
