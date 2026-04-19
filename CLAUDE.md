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
```

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
3. **Tab title badge** — `(N) WhatsApp Business Dashboard` derived from `unreadCounts` state

Notifications only trigger for `message.direction === "INBOUND"` — outbound messages sent by the agent do not fire. `conversation-assigned` events also trigger sound + browser popup (targeted to the assigned agent via `sendToAgent`).

### 24-hour messaging window
`Conversation.windowExpiresAt` is set to `now + 24h` whenever an inbound message arrives (in `api/webhook`). The send API (`api/send`) checks `isWindowExpired(windowExpiresAt)` from `src/lib/utils.ts` before allowing free-form messages. Only template messages bypass the expiry check — all other types (text, image, document, audio, video) are blocked when the window is expired. The `WindowBanner` component shows a live countdown when under 2 hours remain and blocks the input when expired, auto-opening the template picker. The picker is dismissible — closing it does not re-enable the input; it can be reopened via the template icon button.

### Meta API
All Meta Cloud API calls go through `src/lib/meta.ts`. The helper functions use an axios instance pre-configured with the bearer token. Meta API version is pinned to `v18.0`.

- `sendTextMessage(to, text)` — sends a plain text message
- `sendTemplateMessage(to, templateName)` — sends only the template **name** with language `en_US` and empty `components`; no variable substitution. Template must exist and be approved in Meta Business Manager first.
- `sendMediaMessage(to, mediaType, mediaId, caption?, filename?)` — sends image/document/audio/video by Meta media ID. For documents, `filename` is shown to the recipient.
- `markMessageRead(messageId)` — marks a message as read

After any deployment or access token rotation, the WABA must be subscribed to webhook events or no inbound messages will arrive:
```bash
curl -X POST "https://graph.facebook.com/v18.0/${META_WABA_ID}/subscribed_apps?access_token=${META_ACCESS_TOKEN}"
```
Verify with a GET to the same URL — response should be `{"data":[{"whatsapp_business_api_data":...}]}`, not `{"data":[]}`.

### Media attachments
Meta media cannot be fetched directly from the browser — Meta's CDN requires an `Authorization: Bearer` header. Two routes handle this:

- **`GET /api/media/[id]`** — proxies the media file from Meta. Resolves the media ID to a download URL via `GET /v18.0/{id}`, then fetches and streams the file. Add `?download=1&filename=foo.pdf` to force a browser download instead of inline display.
- **`POST /api/media/upload`** — accepts a `multipart/form-data` file upload from the browser, forwards it to `POST /v18.0/{phoneNumberId}/media`, and returns `{ mediaId }`. Size limits: 16 MB for image/audio/video, 100 MB for documents.

Outbound media flow: browser uploads file → `/api/media/upload` returns `mediaId` → `/api/send` called with `{ type, mediaId, content (caption), filename }`.

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

- **Models** — `Broadcast { id, name, templateId, agentId, status: DRAFT|SENDING|COMPLETED|FAILED, sentCount, failedCount }` and `BroadcastRecipient { id, broadcastId, contactId, status: PENDING|SENT|FAILED, metaMessageId }`
- **API**:
  - `GET/POST /api/broadcasts` — list all or create a new draft (pass `templateId` + `contactIds[]`)
  - `GET/DELETE /api/broadcasts/[id]` — detail or delete (DELETE is ADMIN only)
  - `POST /api/broadcasts/[id]/send` — starts the send; returns immediately, processes in background at 1 msg/sec. Contacts with `optedOut: true` are automatically skipped (marked FAILED). Broadcast status transitions: `DRAFT → SENDING → COMPLETED`.
- **UI** — `/broadcasts` page. Two-step creation modal: (1) pick approved template, (2) filter contacts by tag + select recipients. Send button on draft cards triggers the send route.
- Only approved templates (`isApproved: true`) appear in the broadcast template picker — the filtering happens client-side.
- The 1 message/second rate is a conservative limit to stay well within Meta's API constraints. For large lists this means sending is slow but reliable.

### API routes

All routes return `{ error: string }` with an appropriate HTTP status on failure.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/agents` | ADMIN only; includes conversation count per agent |
| POST | `/api/agents` | ADMIN only; creates agent with role AGENT by default |
| PATCH | `/api/agents/[id]` | ADMIN only; updates name/email/password/role/isActive |
| DELETE | `/api/agents/[id]` | ADMIN only; **soft-delete** — sets `isActive: false`, does not remove the row |
| GET | `/api/contacts` | Search + tag filter + pagination (limit 50); tag filtering is done in-memory after query, not in SQL |
| POST | `/api/contacts` | Creates contact; normalizes phone by stripping leading `+`; tags is a JSON array |
| GET | `/api/contacts/[id]` | Returns contact with all conversations and latest message per conversation |
| PATCH | `/api/contacts/[id]` | Updates name/email/tags/optedOut |
| DELETE | `/api/contacts/[id]` | Hard-deletes contact |
| GET | `/api/contacts/[id]/notes` | Returns notes for a contact, newest first, with agent name |
| POST | `/api/contacts/[id]/notes` | Creates a note; agentId set from session |
| DELETE | `/api/contacts/[id]/notes/[noteId]` | Author or ADMIN only |
| GET | `/api/conversations` | Status filter + search; status `"ALL"` skips the filter |
| POST | `/api/conversations` | Creates conversation for an existing contact |
| GET | `/api/conversations/[id]` | Single conversation with contact and assigned agent |
| PATCH | `/api/conversations/[id]` | Updates status and/or agentId; broadcasts `conversation-updated` SSE |
| POST | `/api/conversations/[id]/assign` | Assigns or unassigns agent; broadcasts `conversation-updated` to all + `conversation-assigned` to the assigned agent only |
| GET | `/api/conversations/[id]/messages` | Cursor-based pagination (limit 50); pass `cursor` (messageId) for older pages |
| POST | `/api/send` | Sends text, template, image, document, audio, or video; only templates bypass window expiry |
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
- `Agent` — `passwordHash`, `role: ADMIN | AGENT`, `isActive`
- `Contact` — `phone` (unique), `tags` (JSON array), `optedOut`. **Phone is stored without a `+` prefix** (e.g., `919028099919`), matching how Meta's webhook delivers the `from` field. `POST /api/contacts` normalizes by stripping any leading `+` before saving. `formatPhone()` adds the visual `+` for display only and must never be used as a lookup key. Passing a `+`-prefixed number directly to `prisma.contact.findUnique({ where: { phone } })` will silently miss the record.
- `Conversation` — `status: OPEN | RESOLVED | PENDING`, `windowExpiresAt`, `lastMessageAt`
- `Message` — `direction: INBOUND | OUTBOUND`, `status: SENT | DELIVERED | READ | FAILED`, `mediaUrl` (Meta media ID for both inbound and outbound), `mediaType` (image/document/audio/video/null), `metaMessageId` (unique, used for dedup)
- `Template` — `isApproved`, `metaTemplateId`, `category`
- `QuickReply` — `name`, `content`
- `ContactNote` — `contactId`, `agentId` (author), `content`; cascades on contact delete
- `Broadcast` — `status: DRAFT | SENDING | COMPLETED | FAILED`, `sentCount`, `failedCount`, `templateId`, `agentId`
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
docker compose exec app npx prisma migrate deploy
docker compose up -d --build
```

**First-time setup on a fresh VPS:**
```bash
docker compose up -d
docker compose exec app npx prisma migrate deploy
docker compose exec app npm run db:seed
```

The `.env` file at `/opt/app/whatsapp-dashboard/.env` is the single env file for Docker — it is read both by the compose environment substitution and by Prisma CLI inside the container. `DATABASE_URL` must use `db` (the compose service name) as the hostname, not `localhost`.

### No test suite
There are no unit or integration tests. Type-checking (`npx tsc --noEmit`) and the production build (`npm run build`) are the main correctness checks. **The production build runs ESLint as an error** — always run `npm run lint` locally before pushing.

### `export const dynamic = "force-dynamic"`
Any API route that calls `getServerSession` (or reads headers/cookies) but declares `GET()` with **no `request` parameter** must export `export const dynamic = "force-dynamic"` — otherwise Next.js attempts static pre-rendering and throws "Dynamic server usage" at build time. Routes that already receive a `NextRequest` parameter are implicitly dynamic and do not need this export.

### ESLint conventions
- `@next/next/no-img-element` — Next.js flags raw `<img>` tags. In two places this is intentional and suppressed with `// eslint-disable-next-line @next/next/no-img-element`: (1) the attachment preview thumbnail in `MessageInput` uses a `URL.createObjectURL` blob URL which Next.js `<Image>` cannot optimize, and (2) inbound image messages in `MessageBubble` proxy through `/api/media/[id]` which is also not an optimizable static path. Do not add more `<img>` tags without this suppression or the production build will fail.
- Ternary expressions used as statements (e.g. `condition ? a() : b()`) are flagged by `@typescript-eslint/no-unused-expressions`. Use `if/else` instead.

### Role-based access
`session.user.role` is `"ADMIN"` or `"AGENT"`.
- `/agents` page redirects non-admins client-side. `PATCH /api/agents/[id]` (edit name, email, password, role, isActive) is server-enforced to `ADMIN` only.
- `/profile` is accessible to any authenticated user and edits only their own record (`PATCH /api/profile`). Email or password changes require the current password.
- Template approval (`PATCH /api/templates/[id]` with `isApproved`) is server-enforced to `ADMIN` only.
- Quick reply management (POST/PATCH/DELETE `/api/quick-replies`) is server-enforced to `ADMIN` only. All agents can read and use them.
- Broadcast delete (`DELETE /api/broadcasts/[id]`) is ADMIN only. Any agent can create and send broadcasts.
- Contact note delete is restricted to the note author or ADMIN.
- `GET /api/agents` is ADMIN-only. The `AssignAgent` component in the thread header calls this endpoint; non-admin users will see a permanently empty dropdown because the request fails silently. If agents need to reassign conversations, the GET endpoint's role restriction would need to be relaxed.

### Styling
Tailwind CSS. Dark theme throughout — background `gray-950`, surfaces `gray-900`/`gray-800`. Green (`green-500`/`green-600`) is the brand accent. Use `cn()` from `src/lib/utils.ts` (clsx + tailwind-merge) for conditional classes. Toast notifications use `sonner` (`import { toast } from "sonner"`). The emoji picker (`@emoji-mart/react`) is dynamically imported with `ssr: false` in `MessageInput`.
