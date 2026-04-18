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

TypeScript-only check (no emit):
```bash
npx tsc --noEmit
```

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

- **`src/lib/sse.ts`** — server-side connection store (`Map<agentId, Set<controller>>`) and `broadcastToAll(event, data)`. Every API route that mutates state calls `broadcastToAll` directly after writing to the DB; there is no queue or background job involved.
- **`src/app/api/sse/route.ts`** — authenticated `GET` endpoint (protected by middleware). Exports `dynamic = "force-dynamic"`. Sends a comment-line heartbeat every 25 s to prevent proxy idle-timeouts.
- **`src/hooks/useSSE.ts`** — `useSSE(handlers)` hook. Opens one `EventSource` per component mount; handlers are stabilised through a ref so callers can pass inline objects. `ConversationList` and `ThreadView` each call `useSSE` independently; `ThreadView` filters `new-message` and `message-status` by `conversationId` in the payload.

Named events and their payloads:
- `new-message` → `{ conversationId, message, conversation }`
- `message-status` → `{ conversationId, messageId, status }`
- `conversation-updated` → `{ conversation }`

The TypeScript interfaces for these events in `src/types/index.ts` are named `PusherNewMessageEvent`, `PusherMessageStatusEvent`, `PusherConversationUpdatedEvent` — a legacy name from an earlier Pusher integration. They describe SSE payloads, not Pusher channels.

### 24-hour messaging window
`Conversation.windowExpiresAt` is set to `now + 24h` whenever an inbound message arrives (in `api/webhook`). The send API (`api/send`) checks `isWindowExpired(windowExpiresAt)` from `src/lib/utils.ts` before allowing free-form text. The `WindowBanner` component shows a live countdown when under 2 hours remain and blocks the input when expired, auto-opening the template picker.

### Meta API
All Meta Cloud API calls go through `src/lib/meta.ts`. The helper functions (`sendTextMessage`, `sendTemplateMessage`, `markMessageRead`) use an axios instance pre-configured with the bearer token. Meta API version is pinned to `v18.0`.

After any deployment or access token rotation, the WABA must be subscribed to webhook events or no inbound messages will arrive:
```bash
curl -X POST "https://graph.facebook.com/v18.0/${META_WABA_ID}/subscribed_apps?access_token=${META_ACCESS_TOKEN}"
```
Verify with a GET to the same URL — response should be `{"data":[{"whatsapp_business_api_data":...}]}`, not `{"data":[]}`.

### API response convention
All API routes return `{ error: string }` with an appropriate HTTP status on failure. No other error shape is used.

### Prisma
Using **Prisma v5** (not v7). The `prisma` singleton is in `src/lib/prisma.ts` with a `globalThis` cache to avoid multiple instances during hot reload. After any `prisma/schema.prisma` change, always run `npm run db:generate`.

Database is **MySQL**. Key models and their non-obvious fields:
- `Agent` — `passwordHash`, `role: ADMIN | AGENT`, `isActive`
- `Contact` — `phone` (unique), `tags` (JSON array), `optedOut`
- `Conversation` — `status: OPEN | RESOLVED | PENDING`, `windowExpiresAt`, `lastMessageAt`
- `Message` — `direction: INBOUND | OUTBOUND`, `status: SENT | DELIVERED | READ | FAILED`, `mediaUrl`, `mediaType`, `metaMessageId` (unique, used for dedup)
- `Template` — `isApproved`, `metaTemplateId`, `category`

### Public (unauthenticated) pages
`/privacy`, `/terms`, and `/data-deletion` are excluded from the NextAuth middleware matcher so Meta's crawlers and users can access them without logging in. Any new public page must be added to the exclusion pattern in `src/middleware.ts`.

### Deployment
Hosted on a Hostinger VPS (Ubuntu 24.04, IP `72.60.98.246`, domain `digitalcampions.com`) via Docker Compose. The app runs alongside an existing Traefik reverse proxy and n8n instance — do **not** stop or modify those services.

**Stack on VPS:**
- `/root/docker-compose.yml` — Traefik + n8n (managed separately, do not touch)
- `/opt/app/whatsapp-dashboard/` — this app (app + MySQL containers)

Traefik uses `myhttpchallenge` (HTTP-01 ACME) for TLS on `digitalcampions.com`. TLS-ALPN-01 (`mytlschallenge`) does not work because Hostinger's CDN intercepts port 443. The app container joins `root_default` (Traefik's external network) so Traefik can route to it.

The `chmod -R 755 .` prefix in the build script is required because Linux assigns restrictive permissions to directories with parentheses in their names (`(auth)`, `(dashboard)`), causing EACCES errors without it. `server.js` at the root is a custom Next.js server reading `process.env.PORT`.

**Deploy a new version:**
```bash
# On VPS
cd /opt/app/whatsapp-dashboard
git pull
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
There are no unit or integration tests. Type-checking (`npx tsc --noEmit`) and the production build (`npm run build`) are the main correctness checks.

### `export const dynamic = "force-dynamic"`
Any API route that calls `getServerSession` (or reads headers/cookies) but declares `GET()` with **no `request` parameter** must export `export const dynamic = "force-dynamic"` — otherwise Next.js attempts static pre-rendering and throws "Dynamic server usage" at build time. Routes that already receive a `NextRequest` parameter are implicitly dynamic and do not need this export.

### Role-based access
`session.user.role` is `"ADMIN"` or `"AGENT"`.
- `/agents` page redirects non-admins client-side. `PATCH /api/agents/[id]` (edit name, email, password, role, isActive) is server-enforced to `ADMIN` only.
- `/profile` is accessible to any authenticated user and edits only their own record (`PATCH /api/profile`). Email or password changes require the current password.
- Template approval (`PATCH /api/templates/[id]` with `isApproved`) is server-enforced to `ADMIN` only.

### Styling
Tailwind CSS. Dark theme throughout — background `gray-950`, surfaces `gray-900`/`gray-800`. Green (`green-500`/`green-600`) is the brand accent. Use `cn()` from `src/lib/utils.ts` (clsx + tailwind-merge) for conditional classes. Toast notifications use `sonner` (`import { toast } from "sonner"`).
