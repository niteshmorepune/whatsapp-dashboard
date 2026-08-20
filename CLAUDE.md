# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server (localhost:3000)
npm run build        # Production build — prefixed with chmod -R 755 . for Linux deployment compatibility
npm run lint         # ESLint check

npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:migrate   # Run pending migrations against the DB (deploy mode)
npm run db:seed      # Seed admin user + sample templates
npm run db:studio    # Open Prisma Studio at localhost:5555
```

For schema changes, the development workflow is:
```bash
npx prisma migrate dev --name <description>   # Creates + applies a new migration
npm run db:generate                            # Regenerate client
```

TypeScript + lint check (run both before committing — the production build enforces both):
```bash
npx tsc --noEmit
npm run lint
```

`postinstall` runs `prisma generate` automatically on `npm install`.

## Local environment files

Two env files coexist:
- **`.env`** — read by Prisma CLI (`migrate`, `generate`, `studio`, `seed`). Contains only `DATABASE_URL`. Gitignored.
- **`.env.local`** — read by Next.js at runtime. Contains all secrets. Gitignored.

Required variables in `.env.local`:
```
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
META_ACCESS_TOKEN=
META_PHONE_NUMBER_ID=
META_WABA_ID=
META_WEBHOOK_VERIFY_TOKEN=
WADESK_SERVICE_KEY=
ANTHROPIC_API_KEY=
CRM_WEBHOOK_URL=
CRM_WEBHOOK_TOKEN=
CRM_LEAD_CONTEXT_URL=
```

`ANTHROPIC_API_KEY` powers the AI after-hours assistant (see below) — if unset, `generateAiReply()` logs and returns `null`, so inbound messages are still recorded normally, just with no auto-reply.

The seed script uses `-r dotenv/config` so `ts-node` loads `.env` before `PrismaClient` initialises — without this flag the seed will fail with "Environment variable not found: DATABASE_URL". The seed also requires `tsconfig.seed.json` (CommonJS module mode for ts-node compatibility).

Default seed credentials: `admin@youragency.com` / `Admin@1234`.

## Architecture

### Path alias
`@/*` maps to `./src/*` (configured in `tsconfig.json`). All internal imports use this alias.

### Route groups
- `src/app/(auth)/` — Unauthenticated pages (login). No shared layout.
- `src/app/(dashboard)/` — All protected pages. Shares `layout.tsx` which renders the Sidebar + Header shell and wraps everything in `SessionProvider`.
- `src/app/api/` — All API routes. Server-only. Use `getServerSession(authOptions)` at the top of every handler.

### Authentication flow
`src/middleware.ts` uses `next-auth/middleware` to block all routes except `/login`, `/api/auth/**`, `/api/webhook`, and Next.js static assets. `/api/sse` is **not** excluded and is therefore also protected. The dashboard layout additionally calls `useSession()` client-side and redirects if unauthenticated.

JWT (session strategy) carries `id` and `role` fields — the type augmentation lives in `src/types/index.ts`. Login rejects agents with `isActive: false`. After a profile update (`PATCH /api/profile`), call `updateSession()` from `useSession()` to sync the client-side session; the JWT cookie is not re-issued until the next sign-in, so `session.user.name`/`email` will reflect the old value server-side until then.

**`POST /api/send` has a second, non-session auth path**: an `X-Service-Key` header matching `WADESK_SERVICE_KEY` is accepted in place of a browser session — this is the CRM's Tier 3 integration (staff replies to a WhatsApp ticket in the CRM → forwarded here server-to-server, no NEDS CRM agent has a wadesk.in login). `middleware.ts`'s matcher excludes `api/send` for exactly this reason — without that exclusion, NextAuth's middleware would redirect/401 the request before the route handler's own `X-Service-Key` check ever runs. A CRM-originated send skips the per-agent line-access check (no agent identity to check — the CRM is trusted via the shared secret, same trust model the rest of this check-in the route otherwise wouldn't skip) and records `sentByAgentId: null` on the resulting `Message`. **This existed only as an uncommitted hotfix directly on the VPS for over a month before being merged back into git** (discovered 2026-08-02 when a `git pull` for the multi-number rollout conflicted with it) — if a future `git pull` on the VPS ever conflicts again, treat it as a signal a live hotfix was made and never committed, not as something safe to discard.

**`POST /api/send-template` (added 2026-08-03, for the CRM's Deal-Won handoff) is service-key ONLY** — no session fallback at all, unlike `/api/send`. It's meant purely for server-to-server calls, never a browser. Same `middleware.ts` matcher-exclusion requirement applies.

### Real-time (Server-Sent Events)
Real-time uses the browser's native `EventSource` API. There is no third-party broker.

- **`src/lib/sse.ts`** — server-side connection store (`Map<agentId, Set<controller>>`). Two broadcast functions:
  - `broadcastToAll(event, data)` — sends to every connected agent
  - `sendToAgent(agentId, event, data)` — sends to one specific agent's connections only (used for assignment notifications)
- **`src/app/api/sse/route.ts`** — authenticated `GET` endpoint (protected by middleware). Exports `dynamic = "force-dynamic"`. Sends a comment-line heartbeat every 25 s to prevent proxy idle-timeouts.
- **`src/hooks/useSSE.ts`** — `useSSE(handlers)` hook. Opens one `EventSource` per component mount; handlers are stabilised through a ref so callers can pass inline objects. `ConversationList` and `ThreadView` each call `useSSE` independently; `ThreadView` filters `new-message` and `message-status` by `conversationId` in the payload.

Named events and their payloads:
- `new-message` → `{ conversationId, message, conversation }`
- `message-status` → `{ conversationId, messageId, status }`
- `conversation-updated` → `{ conversation }`
- `conversation-assigned` → `{ conversation, assignedBy }` — sent via `sendToAgent` to the assigned agent only; triggers browser notification + sound ping in `ConversationList`

The TypeScript interfaces for these events in `src/types/index.ts` are named `PusherNewMessageEvent`, `PusherMessageStatusEvent`, `PusherConversationUpdatedEvent` — a legacy name from an earlier Pusher integration. They describe SSE payloads, not Pusher channels. Note: these interfaces are incomplete — the actual broadcast payloads include `conversationId` for `new-message` and `message-status` events, which the interfaces omit. Do not rely on them to infer the full payload shape.

### Agent notifications (ConversationList)
`ConversationList` fires three notification types when an inbound message arrives on a non-selected conversation:
1. **Sound** — `playNotificationSound()` using Web Audio API (880→440 Hz sine wave, 0.3 s)
2. **Browser popup** — `window.Notification` with `tag: conversation.id` for dedup; permission requested on mount
3. **Tab title badge** — `(N) WaDesk` derived from `unreadCounts` state

Notifications only trigger for `message.direction === "INBOUND"` — outbound messages sent by the agent do not fire. `conversation-assigned` events also trigger sound + browser popup (targeted to the assigned agent via `sendToAgent`).

### 24-hour messaging window
`Conversation.windowExpiresAt` is set to `now + 24h` whenever an inbound message arrives (in `api/webhook`). The send API (`api/send`) checks `isWindowExpired(windowExpiresAt)` from `src/lib/utils.ts` before allowing free-form messages. Only template messages bypass the expiry check — all other types (text, image, document, audio, video) are blocked when the window is expired. The `WindowBanner` component shows a live countdown when under 2 hours remain and blocks the input when expired, auto-opening the template picker. The picker is dismissible — closing it does not re-enable the input; it can be reopened via the template icon button.

### Multi-number (WhatsApp lines)
This app can run more than one WhatsApp number side by side — e.g. one number for post-sale support, one for pre-sale marketing/telecalling — all on the same Meta WABA. Added because NEDS wanted Sales/Telecaller staff on a marketing number and Support staff on the existing support number, with neither seeing the other's conversations.

- **`WhatsappNumber`** — one row per Meta phone number (`label`, `businessNumber`, `phoneNumberId`, `wabaId`, `accessToken`, `isDefault`). `accessToken`/`wabaId`/`phoneNumberId` are server-only — never returned to non-ADMIN sessions or included in any client-facing select beyond `id`/`label`/`businessNumber`/`isDefault`.
- **`AgentWhatsappNumber`** — pivot granting an AGENT access to a line. **ADMIN implicitly has access to every line** (checked in code, not via rows) — there's no need to grant ADMINs individually. Managed from the Agents page (checkboxes) or `/numbers` (the numbers themselves).
- **`Conversation.whatsappNumberId`** (required) and **`Broadcast.whatsappNumberId`** (required) — every conversation and broadcast belongs to exactly one line. A contact who has messaged two different NEDS numbers gets **one conversation per number**, never a merged thread — WhatsApp itself has no concept of moving a chat between business numbers, so this app doesn't pretend to either.
- **`src/lib/whatsapp-numbers.ts`** — the only place access logic lives: `getAgentAccessibleNumberIds`, `agentHasAccessToNumber`, `getAgentIdsWithNumberAccess` (used to scope SSE/push fan-out — see below), `getNumberByPhoneNumberId` (resolves an inbound webhook's `metadata.phone_number_id`), `toMetaConfig`.
- Every route that touches a conversation (`GET/PATCH /api/conversations/[id]`, `/messages`, `/assign`, `POST /api/send`, `POST /api/media/upload`) checks `agentHasAccessToNumber` for the **requesting** agent, even though the UI already filters what a non-admin agent sees — don't assume the list-scoping alone is enough; a conversation ID typed directly into a URL must 403, not 200, for an agent without that line's grant.
- **SSE/push fan-out is line-scoped too, not just the REST reads.** `broadcastToAgents(agentIds, ...)` (not `broadcastToAll`) is used for every conversation/message event — the agent ID list comes from `getAgentIdsWithNumberAccess(whatsappNumberId)`. This was a real gap caught while building this: `broadcastToAll` would have pushed a Marketing-line message preview into a Support-only agent's inbox in real time even though `GET /api/conversations` correctly filtered it out on load.
- **Rollout order matters**: `scripts/backfill-whatsapp-numbers.ts` (`npm run db:backfill-numbers`) must run *after* the `add_whatsapp_numbers` migration and *before* the `require_whatsapp_number_on_conversation_broadcast` migration — it upserts a "Support" `WhatsappNumber` from the (legacy, single-number) `META_*` env vars, backfills every existing Conversation/Broadcast onto it, and grants every active agent access to it. Skipping this before the NOT-NULL migration will fail the migration on any existing data. Safe to re-run (idempotent).
- Adding a second (or third) number going forward does **not** need a migration or a deploy — it's a row in `/numbers` (ADMIN only), then per-agent grants on the Agents page. `phoneNumberId`/`wabaId`/`accessToken` come from Meta's WhatsApp Manager → API Setup for that specific number.

### AI after-hours assistant (added 2026-08-05)
NEDS runs Meta ads whose Click-to-WhatsApp leads land on this app's Marketing
line. Outside business hours (or on a holiday), no human agent is watching
that line — this feature lets Claude hold the conversation instead of the
lead going unanswered until the next business day.

- **`WhatsappNumber.aiMode`** (`AiMode` enum: `AUTO` | `FORCE_ON` | `FORCE_OFF`)
  is the per-line control, set on `/numbers` (ADMIN only). `AUTO` (the
  default) defers entirely to `WhatsappNumber.businessHours` + the company-
  wide `Holiday` calendar; `FORCE_ON`/`FORCE_OFF` are absolute overrides for a
  short-staffed day or a "keep this human-only regardless of hours" period.
  There is no separate on/off flag — `aiMode` alone is the single source of
  truth for "is this line currently AI-live," computed by
  `src/lib/business-hours.ts`'s `resolveAiLiveState()`.
- **`WhatsappNumber.businessHours`** is a nullable `Json` column: a 7-entry
  array (`{ day: 0-6, isOpen, openTime: "HH:mm", closeTime: "HH:mm" }`, `day`
  matching JS `Date#getDay()`). `null` falls back to
  `DEFAULT_BUSINESS_HOURS` (Mon–Sat 10:00–19:00, Sunday closed). Interpreted
  in **Asia/Kolkata** via a hardcoded fixed +05:30 offset in
  `business-hours.ts` (no timezone library — IST has no DST, and this is a
  single-timezone India-only business) — do not reuse `new Date(...)`'s
  local-timezone getters for this, they'd use the server's OS timezone, not
  IST. **The exact same default array is duplicated in
  `src/app/(dashboard)/numbers/page.tsx`** (a client component, so it can't
  import `business-hours.ts` — that module pulls in the Prisma client). Keep
  both in sync if the default ever changes.
- **`Holiday`** — a plain, company-wide (not per-line) table (date + label),
  managed on `/holidays` (ADMIN only). Every `AUTO`-mode line treats a
  holiday date as closed, on top of its own weekly schedule.
- **`FaqEntry`** — the AI's only allowed source of truth (question/answer/
  isActive), managed on `/faq` (ADMIN only). `src/lib/ai-reply.ts`'s system
  prompt explicitly forbids answering anything not covered here — same
  "never fabricate specifics" rule used by every other AI feature across
  this NEDS ecosystem (CRM, Drishti, SMDost). Separate from `QuickReply`
  (agent-facing canned text a human inserts manually, not AI context).
  **Per-line scoping (added 2026-08-11)**: `whatsappNumberId` is nullable
  — `null` means the entry applies to every line (shared facts like company
  location), a set value scopes it to that one `WhatsappNumber` only
  (e.g. pricing questions on Marketing, ticket process on Support).
  `generateAiReply()` now requires `whatsappNumberId`/`whatsappNumberLabel`
  and queries `where: { isActive: true, OR: [{ whatsappNumberId: null },
  { whatsappNumberId }] }` — a line only ever sees its own scoped entries
  plus the both-lines ones, never another line's scoped content. The `/faq`
  page's line picker is sourced from `GET /api/whatsapp-numbers`, not
  hardcoded to "Support"/"Marketing", so adding a third line still needs no
  code change here either.
- **Trigger point**: `api/webhook`'s `handleInboundMessage()` calls
  `maybeReplyWithAi()` (`src/lib/ai-assistant.ts`) fire-and-forget, after the
  inbound message is saved and broadcast — never blocks or fails the Meta
  webhook response. That function: skips if `Conversation.aiMuted`; skips if
  `resolveAiLiveState()` says the line isn't AI-live right now; otherwise
  loads the last 10 messages for context, calls `generateAiReply()`
  (`src/lib/ai-reply.ts`, plain `fetch` to the Anthropic Messages API, model
  `claude-haiku-4-5-20251001`, max 300 tokens — no SDK dependency added), and
  if it returns non-null text, sends it via `sendTextMessage()` and persists
  it as a normal outbound `Message` (`sentByAi: true`, `sentByAgentId: null`,
  same "no agent identity, trusted actor" shape as a CRM-forwarded send) with
  the usual SSE broadcast. Every step is wrapped so a Meta/Anthropic failure
  here can never break inbound message handling — same "AI failure never
  breaks the core workflow" convention used everywhere else in this NEDS
  ecosystem.
- **Concurrent-message race (fixed 2026-08-20)**: `maybeReplyWithAi()` now
  guards its entire body with an in-process `Set<conversationId>` lock
  (`conversationsCurrentlyReplying`). Real incident: two inbound messages
  arriving close together each independently read the cooldown check
  below as "no recent AI reply yet" — the draft+send flow (FAQ + lead
  context + the Anthropic call + the Meta send) takes real seconds, wider
  than the DB read-then-write gap it looks like — so both proceeded and
  the same lead got the AI's reply sent twice, about a second apart. A
  second concurrent call for the same conversation now returns
  immediately instead of racing the first through the cooldown check.
  Correct only because this app is a single Node process/container (see
  Deployment below, no replicas) — a horizontally-scaled deployment would
  need a DB-level lock instead, since each replica would hold its own
  independent copy of the Set.
- **CRM lead context (added 2026-08-20)**: `src/lib/crm-lead-context.ts`'s
  `getCrmLeadContext(phone)` is called from `generateAiReply()` (in
  parallel with the FAQ query) — a `GET` to the CRM's `/api/leads/context`
  (Bearer `CRM_WEBHOOK_TOKEN`, the reverse direction of `crm-notify.ts`'s
  push, same trust boundary, no new secret) returning the matched Lead's
  campaign, service, declared budget, extra form answers, and — if the lead
  qualifies — a Visibility Audit self-serve offer link. Built after a real
  incident: the assistant's reply to a Meta Ads lead ("newSURYA CABLE")
  could only say "thanks for filling in the form," because it had never
  been given which form/campaign, or that the lead's own "budget" answer
  was garbled (literally the company name — a Meta-side form data issue,
  confirmed not a CRM bug). `buildLeadContextBlock()` turns the lookup into
  a system-prompt block and 3 new rules tell the model to (1) name the
  actual campaign/goal instead of a vague "the form", (2) never restate an
  unparseable budget answer as if it were real — ask to confirm it instead,
  and (3) offer the Visibility Audit link as a concrete next step when
  present, not just a promise that the team will follow up. Same
  never-throw/5s-timeout/null-on-failure contract as the rest of this
  file's external calls — a CRM outage just means the reply falls back to
  the previous generic behavior, never a broken or blocked send.
- **`Conversation.aiMuted`** — set to `true` unconditionally by `POST
  /api/send` on every send (a session agent's own send, or a CRM-forwarded
  staff reply via the service key — both are "a human is handling this,"
  since the AI never calls `/api/send` itself, it sends directly through
  `ai-assistant.ts`). Resumed via `PATCH /api/conversations/[id]` with
  `{ aiMuted: false }` — a "Resume AI" button in `ThreadView`'s header,
  shown whenever `aiMuted` is true. This is deliberately a **per-conversation**
  mute, separate from the line-level `aiMode` — muting one lead's thread
  because a human jumped in does not touch the line's overall AI schedule.
- **`GET /api/conversations/[id]`** additionally computes and returns
  `aiCurrentlyLive` (not a stored column — computed fresh from `aiMode` +
  `businessHours` + the holiday calendar on every read) so `ThreadView` can
  show "AI handling" without duplicating the schedule logic client-side.
  `GET /api/whatsapp-numbers` does the same per-number for the `/numbers`
  list. The conversations **list** endpoint (`GET /api/conversations`) does
  NOT compute this — it's only needed on the single-conversation/number
  detail views.

### AI usage reporting (added 2026-08-05)
`AiUsage` (id, feature, model, inputTokens, outputTokens, costUsd, createdAt)
gets one row per completed (2xx) Anthropic API call — currently only the
after-hours assistant (`feature: "after_hours_reply"`), logged inside
`generateAiReply()` right after the response comes back, regardless of
whether usable reply text was extracted from it (tokens are billed by
Anthropic either way). Pricing is hardcoded in `src/lib/ai-reply.ts`
(`PRICE_PER_MILLION_INPUT_TOKENS_USD` / `..._OUTPUT_...`, currently $1/$5 for
`claude-haiku-4-5-20251001`) — **this must be kept in sync with the NEDS
CRM's own `config('services.anthropic.pricing')`** (a separate repo/app), or
the two apps' cost estimates will silently disagree.

**`GET /api/ai/usage`** (`src/app/api/ai/usage/route.ts`) exposes this,
service-key only (`X-Service-Key` matching `WADESK_SERVICE_KEY` — the same
secret already used for `/api/send`'s CRM auth path, no new secret needed),
accepting `?from=&to=` ISO8601 query params. This exists purely so the CRM's
own AI Usage Report can pull this app's spend in — mirrors the identical
`GET /api/ai/usage` contract Drishti and SMDost already expose for the same
report (`app/Services/AiUsageMetrics.php`'s `fetchAppUsage()` on the CRM
side polls all three the same way). Response shape:
```json
{ "data": { "totals": { "_count": 12, "_sum": { "inputTokens": 4500, "outputTokens": 1800, "costUsd": 0.0135 } } } }
```
**Gotcha already hit once while building this**: Prisma's `aggregate()`
`_count: true` returns a breakdown object (`{_all, id, feature, ...}`), not
a plain number — the route explicitly flattens it to `_count: totals._count._all`
before responding. Forwarding Prisma's raw aggregate result here would have
made the CRM's PHP-side `(int) $totals['_count']` cast that whole object down
to `1` regardless of real call volume.

**A second gotcha, caught live in production, not before shipping**: this
route is service-key-only (no session), same as `/api/send`/
`/api/send-template` — but `src/middleware.ts`'s matcher must **also**
exclude it, or NextAuth's middleware redirects/401s the request before the
route handler's own `X-Service-Key` check ever runs (this app's own docs
already warned about exactly this for `/api/send`/`/api/send-template` —
missed applying the same rule to a new service-key route). Symptom: the
CRM's poll (and a direct curl test) got back the `/login` page's HTML,
not JSON, and failed to `JSON.parse`. Fixed by adding `api/ai/usage` to
the matcher's negative-lookahead exclusion list alongside the other
service-key routes.

### CRM notification (`src/lib/crm-notify.ts`, added 2026-08-14)
Notifies the NEDS CRM (`CRM_WEBHOOK_URL`/`CRM_WEBHOOK_TOKEN`, `POST` with
`Authorization: Bearer`) of **every** WhatsApp message, both directions, so
the CRM can build a full communication timeline on the matching Lead/Ticket.
Previously this only fired on a conversation's opening inbound message —
every later message (either direction) went unreported, which meant a
CRM Ticket's thread silently missed everything after its first message, and
a Lead never learned about a reply a staffer sent directly from this app
(only a reply forwarded *from* the CRM ever reached here).

Three call sites, all fire-and-forget (`.catch(() => {})`, never awaited,
never blocks message delivery/persistence on this side):
- `api/webhook/route.ts` — after every inbound customer message is saved
  (moved from before the dedup/save step to after it, so it uses the
  message's own `id` — not the Meta `metaMessageId` — as the CRM's
  idempotency key). `direction: "inbound"`, `sender_type: "customer"`.
- `api/send/route.ts` — after a session agent's own send.
  `direction: "outbound"`, `sender_type: "agent"`, `sender_name` from
  `message.sentByAgent.name`. **Skipped entirely** when the request was
  itself CRM-originated (`isCrmRequest`, the `X-Service-Key` path) — the
  CRM already recorded that message the moment it sent it, so notifying it
  back would just be a redundant echo of its own data.
- `ai-assistant.ts` — after the AI after-hours assistant sends its reply.
  `direction: "outbound"`, `sender_type: "ai"`.

The CRM's own receiving endpoint (`WhatsappWebhookController`) treats
`message_id`/`direction`/`sender_type`/`sender_name` as optional, defaulting
to exactly the shape this app sent before this change — so the two apps can
be deployed in either order without a real-traffic gap; the CRM should still
be deployed first regardless, since that's the intended rollout order (see
the CRM's own PR for this feature).

### Meta API
All Meta Cloud API calls go through `src/lib/meta.ts`. Every function takes a `MetaNumberConfig` (`{ phoneNumberId, accessToken }`) as its **first** argument — there is no global/env-level Meta client anymore; the caller resolves which number's config to use (typically via `toMetaConfig(conversation.whatsappNumber)`). Meta API version is pinned to `v18.0`.

- `sendTextMessage(config, to, text)` — sends a plain text message
- `sendTemplateMessage(config, to, templateName, languageCode = "en_US", components = [])` — `languageCode` defaults to `en_US`, but every real call site now passes the template's own `Template.language` column explicitly (2026-08-17 fix: every call site used to either rely on that default or hardcode `"en"`, and Meta matches templates by exact name+language pair, so any template actually approved under a different language silently failed to send — this is why "Failed to send message" could happen for every template in the inbox/broadcast UI even though `/api/send-template`, the CRM-triggered path, kept working since it hardcoded the one language that happened to be right). Template must exist and be approved in Meta Business Manager first. Templates are approved per-WABA, so if all numbers share one WABA, a template approved once is usable from any of them.
- `sendMediaMessage(config, to, mediaType, mediaId, caption?, filename?)` — sends image/document/audio/video by Meta media ID. For documents, `filename` is shown to the recipient.
- `markMessageRead(config, messageId)` — marks a message as read

The `META_ACCESS_TOKEN`/`META_PHONE_NUMBER_ID`/`META_WABA_ID` env vars are now only read by `scripts/backfill-whatsapp-numbers.ts` (one-time, to seed the first `WhatsappNumber` row) — not by any request-handling code.

After adding a number or rotating its token, that WABA must be (re-)subscribed to webhook events or no inbound messages will arrive on it:
```bash
curl -X POST "https://graph.facebook.com/v18.0/${WABA_ID}/subscribed_apps?access_token=${ACCESS_TOKEN}"
```
Verify with a GET to the same URL — response should be `{"data":[{"whatsapp_business_api_data":...}]}`, not `{"data":[]}`. One webhook URL (`/api/webhook`) serves every number on the WABA — the handler reads `value.metadata.phone_number_id` from each inbound payload to know which `WhatsappNumber` row it belongs to, and drops (logs, doesn't crash) any message from a `phone_number_id` that has no matching row — add the number in `/numbers` first.

### Media attachments
Meta media cannot be fetched directly from the browser — Meta's CDN requires an `Authorization: Bearer` header. Two routes handle this:

- **`GET /api/media/[id]`** — proxies the media file from Meta. Requires `?conversationId=` so it knows which number's token to fetch with (a bare media ID doesn't say which line it belongs to); falls back to the default number if omitted. Resolves the media ID to a download URL via `GET /v18.0/{id}`, then fetches and streams the file. Add `?download=1&filename=foo.pdf` to force a browser download instead of inline display.
- **`POST /api/media/upload`** — accepts a `multipart/form-data` file upload with `file` + `conversationId`, resolves the conversation's `WhatsappNumber` for its `phoneNumberId`/token, 403s if the requesting agent isn't granted that line, forwards to `POST /v18.0/{phoneNumberId}/media`, and returns `{ mediaId }`. Size limits: 16 MB for image/audio/video, 100 MB for documents.

Outbound media flow: browser uploads file (with `conversationId`) → `/api/media/upload` returns `mediaId` → `/api/send` called with `{ conversationId, type, mediaId, content (caption), filename }`.

`Message.mediaUrl` stores the Meta media ID for both inbound (set by webhook) and outbound (set by send route) messages. `MessageBubble` renders images inline, audio/video as native players, and documents as a download link using `/api/media/{mediaUrl}`.

### Quick Replies
Pre-saved canned responses insertable into the message box with one click.

- **Model** — `QuickReply { id, name, content, createdAt, updatedAt }`
- **API** — `GET/POST /api/quick-replies` (POST is ADMIN only), `PATCH/DELETE /api/quick-replies/[id]` (ADMIN only)
- **UI** — `/quick-replies` management page (Admins create/edit/delete). In `MessageInput`, the ⚡ (Zap) button opens a dropdown listing all quick replies; clicking one appends its content to the textarea without sending.
- All agents can read and use quick replies; only Admins can manage them.

### Contact Notes
Internal notes on a contact, visible to all agents.

- **Model** — `ContactNote { id, contactId, agentId, content, createdAt }` — `agentId` references the author
- **API** — `GET/POST /api/contacts/[id]/notes`, `DELETE /api/contacts/[id]/notes/[noteId]`
- **UI** — "Internal Notes" section in the `ContactDetail` panel. Any agent can add notes; only the author or an ADMIN can delete.
- Notes are loaded alongside conversation history when a contact is opened.

### Broadcasts
Bulk template message sends to multiple contacts.

- **Models** — `Broadcast { id, name, templateId, agentId, whatsappNumberId, status: DRAFT|SENDING|COMPLETED|FAILED, sentCount, failedCount }` and `BroadcastRecipient { id, broadcastId, contactId, status: PENDING|SENT|FAILED, metaMessageId }`
- **API**:
  - `GET/POST /api/broadcasts` — list all or create a new draft (pass `templateId` + `whatsappNumberId` + `contactIds[]`; 403s if the requesting agent isn't granted that line)
  - `GET/DELETE /api/broadcasts/[id]` — detail or delete (DELETE is ADMIN only)
  - `POST /api/broadcasts/[id]/send` — starts the send; returns immediately, processes in background at 1 msg/sec. Contacts with `optedOut: true` are automatically skipped (marked FAILED). Broadcast status transitions: `DRAFT → SENDING → COMPLETED`.
- **UI** — `/broadcasts` page. Two-step creation modal: (1) pick approved template, (2) pick which line to send from (defaults to the agent's default/only line) + filter contacts by tag + select recipients. Send button on draft cards triggers the send route.
- Only approved templates (`isApproved: true`) appear in the broadcast template picker — the filtering happens client-side.
- The 1 message/second rate is a conservative limit to stay well within Meta's API constraints. For large lists this means sending is slow but reliable.

### API routes

All routes return `{ error: string }` with an appropriate HTTP status on failure.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/agents` | ADMIN only; includes conversation count per agent + granted `whatsappNumberGrants` |
| POST | `/api/agents` | ADMIN only; creates agent with role AGENT by default; accepts `whatsappNumberIds[]` to grant line access at creation |
| PATCH | `/api/agents/[id]` | ADMIN only; updates name/email/password/role/isActive; `whatsappNumberIds[]` (if present) fully replaces that agent's line grants |
| DELETE | `/api/agents/[id]` | ADMIN only; **soft-delete** — sets `isActive: false`, does not remove the row |
| GET | `/api/whatsapp-numbers` | ADMIN sees every number (full config minus `accessToken`); AGENT sees only lines they're granted (id/label/businessNumber/isDefault only) |
| POST | `/api/whatsapp-numbers` | ADMIN only; creates a number; setting `isDefault: true` unsets any previous default |
| PATCH | `/api/whatsapp-numbers/[id]` | ADMIN only; blank `accessToken` leaves it unchanged (same idiom as the agent password field) |
| GET | `/api/contacts` | Search + tag filter + pagination (limit 50); tag filtering is done in-memory after query, not in SQL |
| POST | `/api/contacts` | Creates contact; normalizes phone by stripping leading `+`; tags is a JSON array |
| GET | `/api/contacts/[id]` | Returns contact with all conversations and latest message per conversation |
| PATCH | `/api/contacts/[id]` | Updates name/email/tags/optedOut |
| DELETE | `/api/contacts/[id]` | Hard-deletes contact |
| GET | `/api/contacts/[id]/notes` | Returns notes for a contact, newest first, with agent name |
| POST | `/api/contacts/[id]/notes` | Creates a note; agentId set from session |
| DELETE | `/api/contacts/[id]/notes/[noteId]` | Author or ADMIN only |
| GET | `/api/conversations` | Status filter + search; status `"ALL"` skips the filter. Non-ADMIN is always scoped to granted lines; `?whatsappNumberId=` narrows further (403 if not granted) |
| POST | `/api/conversations` | Creates conversation for an existing contact; requires `whatsappNumberId` (403 if not granted) — currently unused by any UI, conversations are normally created by the inbound webhook |
| GET | `/api/conversations/[id]` | Single conversation with contact, assigned agent, and `whatsappNumber`; 403 if the requesting agent isn't granted that line |
| PATCH | `/api/conversations/[id]` | Updates status and/or agentId; 403 if requester isn't granted the line, 400 if the target `agentId` isn't; broadcasts `conversation-updated` only to agents granted that line |
| POST | `/api/conversations/[id]/assign` | Assigns or unassigns agent; same line-access checks as PATCH above; broadcasts `conversation-updated` to agents granted that line + `conversation-assigned` to the assigned agent only |
| GET | `/api/conversations/[id]/messages` | Cursor-based pagination (limit 50); pass `cursor` (messageId) for older pages; 403 if requester isn't granted the conversation's line |
| POST | `/api/send` | Sends text, template, image, document, audio, or video; only templates bypass window expiry; 403 if requester isn't granted the conversation's line |
| POST | `/api/send-template` | Service-key only, no session fallback. `{phone, businessNumber, templateName}` — resolves the line/template by their natural names (not wadesk's internal row IDs), upserts the Contact/Conversation if they don't exist yet, sends. For an external system triggering a business-initiated message to a phone that's never messaged us before (so there's no existing conversation for `/api/send` to attach to) — currently only the CRM's Deal-Won handoff message. Does not touch `windowExpiresAt`. |
| GET | `/api/media/[id]` | Proxies Meta media file to browser; supports `?download=1&filename=` |
| POST | `/api/media/upload` | Uploads browser file to Meta, returns `{ mediaId }` |
| GET | `/api/templates` | Returns all templates; **isApproved filtering happens on the client**, not here |
| POST | `/api/templates` | Creates template with `isApproved: false` |
| PATCH | `/api/templates/[id]` | Updates template; `isApproved` field restricted to ADMIN |
| DELETE | `/api/templates/[id]` | ADMIN only |
| GET | `/api/quick-replies` | Returns all quick replies ordered by name |
| POST | `/api/quick-replies` | ADMIN only; creates quick reply |
| PATCH | `/api/quick-replies/[id]` | ADMIN only |
| DELETE | `/api/quick-replies/[id]` | ADMIN only |
| GET | `/api/broadcasts` | Returns all broadcasts with template name, agent name, recipient count |
| POST | `/api/broadcasts` | Creates broadcast draft with recipients |
| GET | `/api/broadcasts/[id]` | Detail with full recipient list |
| DELETE | `/api/broadcasts/[id]` | ADMIN only |
| POST | `/api/broadcasts/[id]/send` | Starts background send; returns immediately |
| GET | `/api/profile` | Returns own id/name/email/role |
| PATCH | `/api/profile` | Updates own profile; email or password change requires `currentPassword` |
| GET | `/api/analytics` | Computes: conversations today, open count, avg response time (minutes), messages today, 30-day trend, status breakdown, per-agent performance |
| POST | `/api/webhook` | Public (unauthenticated); receives Meta webhook events; sets `windowExpiresAt` on inbound messages |

### Prisma
Using **Prisma v5** (not v7). The `prisma` singleton is in `src/lib/prisma.ts` with a `globalThis` cache to avoid multiple instances during hot reload. After any `prisma/schema.prisma` change, always run `npm run db:generate`.

Database is **MySQL**. Key models and their non-obvious fields:
- `Agent` — `passwordHash`, `role: ADMIN | AGENT`, `isActive`, `whatsappNumberGrants` (AgentWhatsappNumber[] — which lines an AGENT can see; irrelevant for ADMIN, who always has every line)
- `Contact` — `phone` (unique), `tags` (JSON array), `optedOut`. **Phone is stored without a `+` prefix** (e.g., `919028099919`), matching how Meta's webhook delivers the `from` field. `POST /api/contacts` normalizes by stripping any leading `+` before saving. `formatPhone()` adds the visual `+` for display only and must never be used as a lookup key. Passing a `+`-prefixed number directly to `prisma.contact.findUnique({ where: { phone } })` will silently miss the record. Phone is globally unique regardless of which of our numbers they've messaged — the line lives on `Conversation`, not `Contact`.
- `WhatsappNumber` — `label`, `businessNumber` (unique, digits-only), `phoneNumberId` (unique, Meta's ID), `wabaId`, `accessToken` (`@db.Text`, server-only), `isDefault` (exactly one row should be default; enforced in application code via a `$transaction` on create/update, not a DB constraint)
- `AgentWhatsappNumber` — pivot, `@@unique([agentId, whatsappNumberId])`
- `Conversation` — `status: OPEN | RESOLVED | PENDING`, `windowExpiresAt`, `lastMessageAt`, `whatsappNumberId` (required — which line this thread is on)
- `Message` — `direction: INBOUND | OUTBOUND`, `status: SENT | DELIVERED | READ | FAILED`, `mediaUrl` (Meta media ID for both inbound and outbound), `mediaType` (image/document/audio/video/null), `metaMessageId` (unique, used for dedup)
- `Template` — `isApproved`, `metaTemplateId`, `category`, `language` (default `"en"`, added 2026-08-17 — must match the exact language Meta approved this specific template under, e.g. `"en_US"` for some), `hasButtonParam` (default `false`, added 2026-08-17 — true when the template has a URL button whose `url` contains `{{1}}`, i.e. a *Dynamic* URL button rather than a *Static* one; `content` only ever holds the BODY component's text, so this is the only signal that a button also needs a value at send time). Both are populated by Templates → Sync from Meta (`templateHasButtonParam()` in `src/lib/meta.ts`); a manually created/edited template sets them via its own form fields instead. Approved per-WABA in Meta, not per-number, so one approval covers every `WhatsappNumber` on that WABA.
- `QuickReply` — `name`, `content`
- `ContactNote` — `contactId`, `agentId` (author), `content`; cascades on contact delete
- `Broadcast` — `status: DRAFT | SENDING | COMPLETED | FAILED`, `sentCount`, `failedCount`, `templateId`, `agentId`, `whatsappNumberId` (required — which line the recipients are messaged from), `variables`/`buttonUrlParam` (both added 2026-08-17, nullable — the same body/button parameter values applied to every recipient in the broadcast, collected up front at creation time since Meta rejects a parameterized template sent with the wrong component shape)
- `BroadcastRecipient` — `status: PENDING | SENT | FAILED`, `metaMessageId`; cascades on broadcast delete

### Utilities (`src/lib/utils.ts`)
Beyond `cn()` and `isWindowExpired()`:
- `formatMessageTime()` — today → `HH:mm`, yesterday → "Yesterday", else `dd/MM/yyyy`
- `formatFullTime()` — `dd MMM yyyy, HH:mm`
- `formatRelativeTime()` — date-fns distance-to-now with suffix
- `formatPhone()` — formats as `+XX XXXX XXXX XXXX` with smart spacing
- `getInitials()` — two-letter initials for avatars
- `getWindowTimeLeft()` — returns ms remaining until window expiry
- `truncate()` — ellipsis truncation

### Dashboard layout scroll behaviour
The dashboard `layout.tsx` sets `overflow-hidden` on `<main>` — required so the Inbox page can manage its own split-pane scroll internally. Pages that need full-page scrolling (Help, Broadcasts, Quick Replies, Contacts, Analytics) must wrap their content in `<div className="h-full overflow-y-auto">` themselves.

### Public (unauthenticated) pages
`/privacy`, `/terms`, and `/data-deletion` are excluded from the NextAuth middleware matcher so Meta's crawlers and users can access them without logging in. Any new public page must be added to the exclusion pattern in `src/middleware.ts`.

### Deployment
Hosted on a Hostinger VPS (Ubuntu 24.04, IP `72.60.98.246`, domain `wadesk.in`) via Docker Compose. The app runs alongside an existing Traefik reverse proxy and n8n instance — do **not** stop or modify those services.

**Stack on VPS:**
- `/root/docker-compose.yml` — Traefik + n8n (managed separately, do not touch)
- `/opt/app/whatsapp-dashboard/` — this app (app + MySQL containers)

Traefik uses `myhttpchallenge` (HTTP-01 ACME) for TLS on `wadesk.in`. TLS-ALPN-01 (`mytlschallenge`) does not work because Hostinger's CDN intercepts port 443. The app container joins `root_default` (Traefik's external network) so Traefik can route to it.

The `chmod -R 755 .` prefix in the build script is required because Linux assigns restrictive permissions to directories with parentheses in their names (`(auth)`, `(dashboard)`), causing EACCES errors without it. `server.js` at the root is a custom Next.js server that reads `process.env.PORT` (default 3000) and runs in production mode — used so Docker can inject the port via env var.

**Deploy a new version:**
```bash
# On VPS
cd /opt/app/whatsapp-dashboard
git pull
docker compose up -d --build
```

**After schema changes (new migrations):**
```bash
cd /opt/app/whatsapp-dashboard
git pull
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
```
Rebuild **before** migrating, not after — this app has no bind mount (code
is baked into the image at build time), so running `migrate deploy` first
applies against the *old* container's stale migration set and can silently
report "no pending migrations" instead of actually applying anything. Hit
for real during the AI after-hours assistant build (2026-08-05) — recovered
via `prisma migrate resolve --rolled-back <name>`, then rebuild, then
migrate, in that order.

**First-time setup on a fresh VPS:**
```bash
docker compose up -d
docker compose exec app npx prisma migrate deploy
docker compose exec app npm run db:seed
```

The `.env` file at `/opt/app/whatsapp-dashboard/.env` is the single env file for Docker — it is read both by the compose environment substitution and by Prisma CLI inside the container. `DATABASE_URL` must use `db` (the compose service name) as the hostname, not `localhost`.

**Periodic disk cleanup:** Each `docker compose up -d --build` leaves the previous image layers in Docker's build cache, which grows unbounded across deploys and can fill the VPS disk (seen at 81% usage with 21GB+ reclaimable build cache before being cleaned up). Run this periodically (e.g. monthly, or after a deploy) — it only removes unused build cache and dangling images, not running containers, volumes, or the n8n/Traefik stack:
```bash
docker builder prune -f
docker image prune -f
df -h /
```

### No test suite
There are no unit or integration tests. Type-checking (`npx tsc --noEmit`) and the production build (`npm run build`) are the main correctness checks. **The production build runs ESLint as an error** — always run `npm run lint` locally before pushing.

### `export const dynamic = "force-dynamic"`
Any API route that calls `getServerSession` (or reads headers/cookies) but declares `GET()` with **no `request` parameter** must export `export const dynamic = "force-dynamic"` — otherwise Next.js attempts static pre-rendering and throws "Dynamic server usage" at build time. Routes that already receive a `NextRequest` parameter are implicitly dynamic and do not need this export.

### ESLint conventions
- `@next/next/no-img-element` — Next.js flags raw `<img>` tags. In two places this is intentional and suppressed with `// eslint-disable-next-line @next/next/no-img-element`: (1) the attachment preview thumbnail in `MessageInput` uses a `URL.createObjectURL` blob URL which Next.js `<Image>` cannot optimize, and (2) inbound image messages in `MessageBubble` proxy through `/api/media/[id]` which is also not an optimizable static path. Do not add more `<img>` tags without this suppression or the production build will fail.
- Ternary expressions used as statements (e.g. `condition ? a() : b()`) are flagged by `@typescript-eslint/no-unused-expressions`. Use `if/else` instead.

### Role-based access
`session.user.role` is `"ADMIN"` or `"AGENT"`.
- **WhatsApp line access is a separate, orthogonal axis from Role** — see "Multi-number (WhatsApp lines)" above. ADMIN always sees every line; AGENT sees only lines explicitly granted via `AgentWhatsappNumber`. This is deliberately per-agent, not a third role value — wadesk has no concept of "Sales"/"Support"/"Telecaller" and isn't meant to; the CRM's role taxonomy has changed twice already and this app shouldn't be coupled to it.
- `/agents` and `/numbers` pages redirect non-admins client-side. `PATCH /api/agents/[id]` (edit name, email, password, role, isActive, whatsappNumberIds) and all of `/api/whatsapp-numbers/*` are server-enforced to `ADMIN` only.
- `/profile` is accessible to any authenticated user and edits only their own record (`PATCH /api/profile`). Email or password changes require the current password.
- Template approval (`PATCH /api/templates/[id]` with `isApproved`) is server-enforced to `ADMIN` only.
- Quick reply management (POST/PATCH/DELETE `/api/quick-replies`) is server-enforced to `ADMIN` only. All agents can read and use them.
- Broadcast delete (`DELETE /api/broadcasts/[id]`) is ADMIN only. Any agent can create and send broadcasts.
- Contact note delete is restricted to the note author or ADMIN.
- `GET /api/agents` is ADMIN-only. The `AssignAgent` component in the thread header calls this endpoint; non-admin users will see a permanently empty dropdown because the request fails silently. If agents need to reassign conversations, the GET endpoint's role restriction would need to be relaxed. Separately, `AssignAgent` also filters the fetched list down to agents who actually have access to the conversation's line (ADMIN always qualifies; AGENT needs a grant) before rendering options — the assign API would 400 on a mismatched pick anyway, this just keeps the dropdown from offering one.

### Styling
Tailwind CSS. Dark theme throughout — background `gray-950`, surfaces `gray-900`/`gray-800`. Green (`green-500`/`green-600`) is the brand accent. Use `cn()` from `src/lib/utils.ts` (clsx + tailwind-merge) for conditional classes. Toast notifications use `sonner` (`import { toast } from "sonner"`). The emoji picker (`@emoji-mart/react`) is dynamically imported with `ssr: false` in `MessageInput`.
