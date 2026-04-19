"use client";

import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { Send, Smile, FileText, Loader2 } from "lucide-react";
import { Template } from "@/types";
import { Modal } from "@/components/ui/Modal";
import { isWindowExpired } from "@/lib/utils";
import { toast } from "sonner";
import dynamic from "next/dynamic";

const EmojiPicker = dynamic(
  () => import("@emoji-mart/react").then((mod) => mod.default),
  { ssr: false }
);

interface MessageInputProps {
  conversationId: string;
  windowExpiresAt: string | null;
  onMessageSent: () => void;
}

export function MessageInput({
  conversationId,
  windowExpiresAt,
  onMessageSent,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const windowExpired = isWindowExpired(windowExpiresAt);

  useEffect(() => {
    if (showTemplates && templates.length === 0) {
      axios
        .get("/api/templates")
        .then((r) =>
          setTemplates(r.data.filter((t: Template) => t.isApproved))
        )
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTemplates]);

  // Auto-open template picker when window is expired
  useEffect(() => {
    if (windowExpired) {
      setShowTemplates(true);
    }
  }, [windowExpired]);

  async function sendText() {
    if (!text.trim() || sending) return;
    if (windowExpired) {
      toast.error("Window expired. Please use a template.");
      setShowTemplates(true);
      return;
    }

    setSending(true);
    try {
      await axios.post("/api/send", {
        conversationId,
        content: text.trim(),
        type: "text",
      });
      setText("");
      onMessageSent();
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err)
          ? err.response?.data?.error ?? "Failed to send"
          : "Failed to send";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  async function sendTemplate(template: Template) {
    setSending(true);
    setShowTemplates(false);
    try {
      await axios.post("/api/send", {
        conversationId,
        content: template.content,
        type: "template",
        templateId: template.id,
      });
      onMessageSent();
      toast.success(`Template "${template.name}" sent`);
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err)
          ? err.response?.data?.error ?? "Failed to send template"
          : "Failed to send template";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  }

  function addEmoji(emoji: { native: string }) {
    setText((prev) => prev + emoji.native);
    setShowEmoji(false);
    textareaRef.current?.focus();
  }

  return (
    <>
      <div className="border-t border-gray-800 bg-gray-900 p-3">
        {windowExpired && (
          <p className="text-xs text-red-400 mb-2 px-1">
            Window expired — use a template to re-engage this contact
          </p>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={windowExpired || sending}
              placeholder={
                windowExpired
                  ? "Window expired — use template"
                  : "Type a message… (Enter to send, Shift+Enter for newline)"
              }
              rows={1}
              className="w-full resize-none bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50 max-h-32 overflow-y-auto"
              style={{
                minHeight: "44px",
                height: "auto",
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
              }}
            />
          </div>

          <button
            onClick={() => setShowEmoji(!showEmoji)}
            disabled={windowExpired || sending}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition disabled:opacity-40"
          >
            <Smile className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowTemplates(true)}
            disabled={sending}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition"
            title="Send template"
          >
            <FileText className="w-5 h-5" />
          </button>

          <button
            onClick={sendText}
            disabled={!text.trim() || windowExpired || sending}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-green-500 hover:bg-green-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white transition"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>

        {showEmoji && (
          <div className="absolute bottom-20 right-4 z-50">
            <EmojiPicker
              data={async () => {
                const response = await import("@emoji-mart/data");
                return response.default;
              }}
              onEmojiSelect={addEmoji}
              theme="dark"
            />
          </div>
        )}
      </div>

      {/* Template Modal */}
      <Modal
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        title="Select Template"
        className="max-w-xl"
      >
        {templates.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">
            No approved templates found. Create and approve templates in the
            Templates page.
          </p>
        ) : (
          <div className="space-y-3">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => sendTemplate(t)}
                disabled={sending}
                className="w-full text-left p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-green-600 rounded-xl transition group"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-sm font-medium text-white group-hover:text-green-400 transition">
                    {t.name}
                  </span>
                  <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">
                    {t.category}
                  </span>
                </div>
                <p className="text-xs text-gray-400 line-clamp-3">{t.content}</p>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
