"use client";

import { useState } from "react";
import {
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Radio,
  Zap,
  Clock,
  Paperclip,
  FileText,
  MessageSquare,
  Users,
  Bell,
  CheckCircle2,
  Phone,
  Bot,
} from "lucide-react";

interface Section {
  id: string;
  icon: React.ReactNode;
  title: string;
  color: string;
  content: React.ReactNode;
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {n}
      </div>
      <p className="text-sm text-gray-300 leading-relaxed">{text}</p>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-3 py-2.5 mt-3">
      <span className="text-yellow-400 text-xs font-bold mt-0.5 flex-shrink-0">NOTE</span>
      <p className="text-xs text-yellow-200/80 leading-relaxed">{children}</p>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 bg-green-900/20 border border-green-700/40 rounded-lg px-3 py-2.5 mt-3">
      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-green-200/80 leading-relaxed">{children}</p>
    </div>
  );
}

const SECTIONS: Section[] = [
  {
    id: "broadcasts",
    icon: <Radio className="w-4 h-4" />,
    title: "Broadcasts — Sending messages to multiple contacts",
    color: "text-blue-400",
    content: (
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          Broadcasts let you send a WhatsApp template message to many contacts at once — useful for
          wishes, reminders, announcements, or follow-ups.
        </p>
        <div className="space-y-3">
          <Step n={1} text="Go to Templates in the sidebar and create a template (e.g. 'Diwali Wishes', 'Payment Reminder'). Write the message content and save it." />
          <Step n={2} text="Submit the same message in Meta Business Manager (WhatsApp Manager → Message Templates) and wait for real approval there first — usually minutes to a few hours. This is the only place actual approval happens." />
          <Step n={3} text="Once Meta approves it, an Admin opens the template in wadesk and toggles it to Approved. See the Templates section below for exactly what must match." />
          <Step n={4} text="Make sure the contacts you want to message are saved under Contacts with their correct phone numbers." />
          <Step n={5} text="Go to Broadcasts → click New Broadcast → select the approved template." />
          <Step n={6} text="Pick which line to send from (e.g. Support or Marketing) — only lines you have access to are offered. This decides which WhatsApp number the broadcast goes out on." />
          <Step n={7} text="Filter recipients by tag (e.g. 'vip', 'customer') or manually select individual contacts. Click Create Broadcast — this saves it as a Draft, nothing is sent yet." />
          <Step n={8} text="From the Broadcasts list, click Send on the draft. Messages go out one per second in the background. The status will show Sending → Completed with sent and failed counts." />
        </div>
        <Note>
          Only template messages can be sent as broadcasts. Free-form text is blocked by WhatsApp for contacts you haven&apos;t spoken to in the last 24 hours.
          Contacts marked as Opted Out are automatically skipped.
        </Note>
        <Tip>
          Use tags on your contacts (e.g. &quot;vip&quot;, &quot;lead&quot;, &quot;customer&quot;) to quickly filter the right audience when creating a broadcast.
        </Tip>
      </div>
    ),
  },
  {
    id: "window",
    icon: <Clock className="w-4 h-4" />,
    title: "24-Hour Messaging Window — What it means",
    color: "text-orange-400",
    content: (
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          WhatsApp has a rule: you can only send free-form messages (text, images, documents, etc.)
          within 24 hours of the last message the <strong className="text-white">customer</strong> sent you.
          This is called the messaging window.
        </p>
        <div className="bg-gray-800 rounded-xl p-4 space-y-2 border border-gray-700">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">How it works</p>
          <p className="text-sm text-gray-300">
            Every time a customer sends you a message, the 24-hour window resets. You can freely reply
            with text, images, documents, audio, or video during this time.
          </p>
          <p className="text-sm text-gray-300">
            If 24 hours pass without the customer messaging, the window expires. You will see a red
            &quot;Window expired&quot; banner in the chat and the message input will be disabled.
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium text-white">What to do when the window is expired:</p>
          <Step n={1} text="Click the template icon (the document icon) in the message input." />
          <Step n={2} text="Select an approved template to send — templates bypass the 24-hour restriction." />
          <Step n={3} text="Once the customer replies, the window reopens and you can send any type of message again." />
        </div>
        <Note>
          You cannot send free-form messages, images, or files to a contact after the window expires.
          Only approved template messages are allowed until they reply.
        </Note>
      </div>
    ),
  },
  {
    id: "templates",
    icon: <FileText className="w-4 h-4" />,
    title: "Templates — Creating and using them",
    color: "text-purple-400",
    content: (
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          Templates are pre-written messages that WhatsApp has approved for you to send outside the
          24-hour window. They are also used for Broadcasts.
        </p>
        <div className="space-y-3">
          <Step n={1} text="Go to Templates in the sidebar → click New Template." />
          <Step n={2} text="Give it a name (no spaces — use underscores e.g. 'payment_reminder'), write the content, and choose a category (Marketing, Utility, Authentication)." />
          <Step n={3} text="Save the template. It will appear as Pending Approval in wadesk — this does NOT submit anything to Meta. Creating it here is purely local record-keeping." />
          <Step n={4} text="Separately, submit the same message in Meta Business Manager (WhatsApp Manager → Message Templates) and wait for real approval there — usually minutes to a few hours. This is the only place actual approval happens." />
          <Step n={5} text="Once Meta approves it, click Sync from Meta (top of the Templates page, Admin only). This pulls every template's real body text, category, and approval status straight from Meta for every connected line — no manual toggling or re-typing needed, and it corrects itself if a template is later edited or revoked in Meta too." />
          <Step n={6} text="Once it shows Approved, you can use it in chat (via the template button) or in Broadcasts." />
        </div>
        <Tip>
          Keep template content simple and professional — Meta rejects templates that look like spam,
          contain promotional language that is too aggressive, or ask for sensitive information. A
          fully generic message with no personalization (e.g. a static &quot;welcome&quot; text) can also get
          flagged as Marketing instead of Utility — adding a name/detail variable like {"{{1}}"} usually
          fixes this.
        </Tip>
        <Note>
          Agents can use templates in chat but only Admins can sync, approve, or delete them. You can
          still manually create a template and flip its Approved toggle by hand without ever syncing —
          but if you do, that&apos;s on your own word, not Meta&apos;s: sending it before Meta has actually
          approved it will fail, since Meta is the real gate either way.
        </Note>
        <Tip>
          A template sent automatically by another system (like the CRM&apos;s payment confirmations or
          WhatsApp recovery nudges) shows its real message text in the Inbox conversation, the same as
          any other message — not a bare &quot;[Template: name]&quot; placeholder. This only works once the
          template has been synced or created here with its real body text; an approved-but-never-synced
          template still sends correctly, it just shows the placeholder in the history instead.
        </Tip>
      </div>
    ),
  },
  {
    id: "quickreplies",
    icon: <Zap className="w-4 h-4" />,
    title: "Quick Replies — Instant canned responses",
    color: "text-yellow-400",
    content: (
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          Quick Replies are short pre-saved responses that agents can insert into the message box with
          one click — great for greetings, common answers, or sign-off messages.
        </p>
        <div className="space-y-3">
          <p className="text-sm font-medium text-white">For Admins — creating quick replies:</p>
          <Step n={1} text="Go to Quick Replies in the sidebar → click New." />
          <Step n={2} text="Give it a short name (e.g. 'Greeting', 'Closing', 'Busy') and write the full reply text." />
          <Step n={3} text="Save it. It is now available to all agents." />
        </div>
        <div className="space-y-3 mt-2">
          <p className="text-sm font-medium text-white">For Agents — using quick replies in chat:</p>
          <Step n={1} text="Open a conversation." />
          <Step n={2} text="Click the ⚡ (lightning bolt) icon in the message input bar." />
          <Step n={3} text="A list of quick replies will appear. Click one to insert it into the message box." />
          <Step n={4} text="Edit the text if needed, then press Enter or click Send." />
        </div>
        <Tip>
          Quick replies insert text into the box — they do not send automatically. You can still edit
          the message before sending.
        </Tip>
      </div>
    ),
  },
  {
    id: "attachments",
    icon: <Paperclip className="w-4 h-4" />,
    title: "Attachments — Sending and receiving files",
    color: "text-pink-400",
    content: (
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          You can send and receive images, audio, video, and documents (PDF, Word, Excel, etc.)
          directly in the chat.
        </p>
        <div className="space-y-3">
          <p className="text-sm font-medium text-white">Sending an attachment:</p>
          <Step n={1} text="Open a conversation (window must not be expired)." />
          <Step n={2} text="Click the 📎 (paperclip) icon in the message input." />
          <Step n={3} text="Select a file from your computer. A preview will appear above the input." />
          <Step n={4} text="Optionally type a caption in the message box." />
          <Step n={5} text="Click Send. The file is uploaded to WhatsApp and delivered to the customer." />
        </div>
        <div className="space-y-3 mt-2">
          <p className="text-sm font-medium text-white">Viewing inbound attachments from customers:</p>
          <Step n={1} text="Images appear inline in the chat — click them to open full size." />
          <Step n={2} text="Audio messages show a player — click play to listen." />
          <Step n={3} text="Videos show an inline player." />
          <Step n={4} text="Documents show a download link — click it to save the file." />
        </div>
        <Note>
          File size limits: images, audio, video up to 16 MB. Documents up to 100 MB.
          Attachments cannot be sent when the 24-hour window is expired — use a template first.
        </Note>
      </div>
    ),
  },
  {
    id: "contacts",
    icon: <Users className="w-4 h-4" />,
    title: "Contacts — Managing your contact list",
    color: "text-cyan-400",
    content: (
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          The Contacts section is your customer directory. Every WhatsApp conversation is linked to a contact.
        </p>
        <div className="space-y-3">
          <Step n={1} text="Go to Contacts to view all saved contacts. Search by name or phone number." />
          <Step n={2} text="Click a contact to open their details — you can see their conversation history and add internal notes." />
          <Step n={3} text="Use Tags to group contacts (e.g. 'vip', 'lead', 'support'). Tags help filter recipients for Broadcasts." />
          <Step n={4} text="Opt Out marks a contact as someone who no longer wants to receive messages. They will be skipped in Broadcasts automatically." />
          <Step n={5} text="Internal Notes let any agent leave a private note about the contact — useful for context that other agents should know." />
          <Step n={6} text="Click the green send icon on any row in the Contacts list — or the Send button at the top of a contact's detail panel — to send a message or template right away, without opening the Inbox first." />
          <Step n={7} text="If you have access to more than one line (e.g. Support and Marketing), pick which one to send from. Choose Message for a plain text reply, or Template to pick an approved template and fill in its variables — same as sending from the Inbox." />
        </div>
        <Note>
          Phone numbers must be saved without the + sign (e.g. 919028099919 not +919028099919).
          The system normalises this automatically when you add a contact via the app.
        </Note>
        <Note>
          The Message tab is disabled if the 24-hour window has already expired on the chosen line for
          that contact — it automatically switches you to Template instead, same rule as the Inbox.
        </Note>
        <Tip>
          When a new customer messages you on WhatsApp, a contact is created automatically.
          You can then edit their name, email, and tags from the Contacts page.
        </Tip>
        <Tip>
          Quick-sending from Contacts uses (or creates) that contact&apos;s conversation on the line you
          pick, so the message shows up in the Inbox immediately — nothing about it is separate from a
          normal chat.
        </Tip>
      </div>
    ),
  },
  {
    id: "inbox",
    icon: <MessageSquare className="w-4 h-4" />,
    title: "Inbox — Managing conversations",
    color: "text-green-400",
    content: (
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          The Inbox is where all customer conversations appear in real time. New messages arrive
          automatically without needing to refresh.
        </p>
        <div className="space-y-3">
          <Step n={1} text="Conversations are sorted by most recent message. Use the tabs at the top to filter by All, Open, Pending, or Resolved." />
          <Step n={2} text="Click a conversation to open the chat thread on the right." />
          <Step n={3} text="Use the Assign button in the chat header to assign the conversation to a specific agent." />
          <Step n={4} text="Click Resolve when the issue is sorted. Resolved conversations move out of the Open list. You can reopen them anytime." />
          <Step n={5} text="Use the search bar to find a conversation by contact name or phone number." />
        </div>
        <Tip>
          Set your conversation to Pending if you are waiting for something (e.g. waiting for the
          customer to reply) — this keeps it separate from actively open chats.
        </Tip>
      </div>
    ),
  },
  {
    id: "lines",
    icon: <Phone className="w-4 h-4" />,
    title: "Lines — Multiple WhatsApp numbers",
    color: "text-teal-400",
    content: (
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          This dashboard can run more than one WhatsApp number side by side — e.g. one for
          post-sale support, one for pre-sale marketing. Every conversation, contact message, and
          broadcast belongs to exactly one line.
        </p>
        <div className="space-y-3">
          <p className="text-sm font-medium text-white">Which lines can you see?</p>
          <Step n={1} text="Admins always see every line. Agents only see lines an Admin has explicitly granted them, on the Agents page." />
          <Step n={2} text="If you can see more than one line, the Inbox shows a row of line tabs (All lines / Support / Marketing / ...) above the status tabs. If you only have one line, you won't see this row at all — there's nothing to switch between." />
          <Step n={3} text="A contact who has messaged two different NEDS numbers gets one conversation per line, never a single merged thread — each line is a fully separate chat with its own history." />
        </div>
        <div className="space-y-3 mt-2">
          <p className="text-sm font-medium text-white">For Admins — managing lines:</p>
          <Step n={1} text="Numbers page: add a new WhatsApp number (label, the number itself, its Meta Phone Number ID, WABA ID, and access token — all from Meta Business Manager's API Setup screen for that number) or edit an existing one." />
          <Step n={2} text="Agents page: check which lines each agent can see, per agent, when creating or editing them." />
        </div>
        <Note>
          Adding a number here is only half the setup — that number&apos;s WABA also needs to be
          subscribed to this app in Meta (a one-time API call your developer runs), or messages on
          it will never arrive here even though the number is configured correctly.
        </Note>
      </div>
    ),
  },
  {
    id: "ai-assistant",
    icon: <Bot className="w-4 h-4" />,
    title: "AI Assistant — Automatic after-hours replies",
    color: "text-emerald-400",
    content: (
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          A line can have Claude (an AI) automatically reply to incoming WhatsApp messages when nobody
          on the team is available — outside business hours, or on a marked holiday. It only answers
          from a fixed FAQ list, never invents prices or promises, and steps aside the moment a human
          replies.
        </p>

        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">What it will and won&apos;t do</p>
          <p className="text-sm text-gray-300">
            It answers questions covered in the AI FAQ page (services, pricing ranges, hours, etc.) and
            asks for the person&apos;s name and requirement if they haven&apos;t come up yet. It never quotes an
            exact price, timeline, or commitment that isn&apos;t written in the FAQ — anything it can&apos;t
            answer from the FAQ, it tells the person the team will follow up during business hours.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-white">For Admins — setting it up on a line:</p>
          <Step n={1} text="Numbers page: open a line and find the AI Assistant section. Choose Auto (replies only outside the hours below), Force On (replies to everything, all the time), or Force Off (never replies)." />
          <Step n={2} text="In Auto mode, set the weekly business hours for that line — tick which days are open and set the open/close time for each. Anything outside these hours is treated as after-hours." />
          <Step n={3} text="AI FAQ page: add the questions and answers the AI is allowed to use. This is the only source of truth it draws from — keep it accurate and up to date." />
          <Step n={4} text="Holidays page: add company holidays (e.g. Diwali) — every Auto-mode line treats these dates as closed too, on top of its normal weekly hours." />
        </div>

        <div className="space-y-3 mt-2">
          <p className="text-sm font-medium text-white">What everyone sees in the Inbox:</p>
          <Step n={1} text="A conversation the AI is currently allowed to answer on shows an 'AI handling' badge in the chat header." />
          <Step n={2} text="Messages the AI sent are marked with a small 🤖 AI assistant tag above the bubble, so it's always clear a reply wasn't typed by a teammate." />
          <Step n={3} text="The moment anyone on the team sends a reply on that conversation, the AI automatically stops replying there — you'll see a 'Resume AI' button in the header if you want to hand it back to the AI later." />
        </div>

        <Note>
          The Numbers page also shows a live &quot;AI live now / off now&quot; badge next to each line, so you
          can check at a glance whether the assistant would currently answer on it.
        </Note>
        <Tip>
          If the AI FAQ list is empty, the assistant still replies but can only ask for the person&apos;s
          name/requirement and say the team will follow up — fill in the FAQ so it can actually be useful.
        </Tip>
      </div>
    ),
  },
  {
    id: "notifications",
    icon: <Bell className="w-4 h-4" />,
    title: "Notifications — Staying on top of new messages",
    color: "text-indigo-400",
    content: (
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          The dashboard notifies you in three ways when a new message arrives or a conversation is
          assigned to you.
        </p>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 space-y-3">
          <div>
            <p className="text-sm font-medium text-white mb-0.5">🔔 Browser notification popup</p>
            <p className="text-xs text-gray-400">A system notification appears even if the browser tab is in the background. Shows the contact name and message preview.</p>
          </div>
          <div>
            <p className="text-sm font-medium text-white mb-0.5">🔊 Sound ping</p>
            <p className="text-xs text-gray-400">A short audio ping plays when a new inbound message arrives on a conversation you are not currently viewing.</p>
          </div>
          <div>
            <p className="text-sm font-medium text-white mb-0.5">🔴 Tab title badge</p>
            <p className="text-xs text-gray-400">The browser tab title shows (N) — the count of unread messages — so you can see it even when looking at another tab.</p>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium text-white">Enabling browser notifications:</p>
          <Step n={1} text="When you first open the app, your browser will ask for notification permission. Click Allow." />
          <Step n={2} text="If you accidentally clicked Block, go to your browser settings → Site permissions → Notifications → find this site and change it to Allow." />
        </div>
        <Note>
          Notifications only work while the app is open in the browser. If you close the browser
          entirely, no notifications will arrive. Agents should keep the tab open during working hours.
        </Note>
      </div>
    ),
  },
];

export default function HelpPage() {
  const [openId, setOpenId] = useState<string | null>("broadcasts");

  function toggle(id: string) {
    setOpenId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="h-full overflow-y-auto">
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-green-500/10 rounded-xl flex items-center justify-center">
          <HelpCircle className="w-5 h-5 text-green-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Help & Guide</h1>
          <p className="text-xs text-gray-500">How to use every feature of the dashboard</p>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-2">
        {SECTIONS.map((section) => {
          const isOpen = openId === section.id;
          return (
            <div
              key={section.id}
              className={`bg-gray-800 border rounded-xl overflow-hidden transition-colors ${
                isOpen ? "border-gray-600" : "border-gray-700"
              }`}
            >
              <button
                onClick={() => toggle(section.id)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className={section.color}>{section.icon}</span>
                  <span className="text-sm font-medium text-white">{section.title}</span>
                </div>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                )}
              </button>

              {isOpen && (
                <div className="px-4 pb-5 border-t border-gray-700 pt-4">
                  {section.content}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-gray-600 mt-8">
        Have a question not covered here? Contact your admin.
      </p>
    </div>
    </div>
  );
}
