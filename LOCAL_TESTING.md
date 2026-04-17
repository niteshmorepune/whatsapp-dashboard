# Local Testing Checklist

## Prerequisites

- [ ] Node.js 18+ installed (`node -v`)
- [ ] MySQL server running locally (port 3306)
- [ ] Database `whatsapp_dashboard` created:
  ```sql
  CREATE DATABASE whatsapp_dashboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ```
- [ ] `.env.local` filled with correct values (see section below)

## Environment Variables

| Variable | Required for | Value |
|---|---|---|
| `DATABASE_URL` | Everything | `mysql://root:@localhost:3306/whatsapp_dashboard` |
| `NEXTAUTH_SECRET` | Auth | Any random string (local: `local-dev-secret-change-in-production`) |
| `NEXTAUTH_URL` | Auth redirects | `http://localhost:3000` |
| `META_ACCESS_TOKEN` | Sending messages | Get from Meta Developer Console |
| `META_PHONE_NUMBER_ID` | Sending messages | Get from Meta Developer Console |
| `META_WABA_ID` | Sending messages | Get from Meta Developer Console |
| `META_WEBHOOK_VERIFY_TOKEN` | Receiving webhooks | Any string (must match Meta dashboard setting) |
| `QSTASH_URL` | Scheduled broadcasts | Upstash QStash URL (can be empty for local) |
| `QSTASH_TOKEN` | Scheduled broadcasts | Upstash QStash token (can be empty for local) |

## Setup (first time)

### Windows
```bat
setup-local.bat
```

### macOS / Linux
```bash
chmod +x setup-local.sh
./setup-local.sh
```

### Manual steps
```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed        # creates admin + sample templates
npm run dev
```

## Functional Test Checklist

### Auth
- [ ] `/login` renders without errors
- [ ] Login with seed admin credentials succeeds
- [ ] Invalid credentials shows error message
- [ ] Unauthenticated access to `/inbox` redirects to `/login`

### Inbox
- [ ] `/inbox` loads conversation list
- [ ] Clicking a conversation opens the message thread
- [ ] Message input is enabled within 24-hour window
- [ ] Message input shows "Window closed" warning outside 24-hour window
- [ ] Sending a message via the input (requires Meta credentials) posts to API
- [ ] Template picker opens and lists templates
- [ ] Emoji picker opens

### Contacts
- [ ] `/contacts` lists contacts
- [ ] Search/filter works
- [ ] Add contact form creates a new contact

### Templates
- [ ] `/templates` lists templates
- [ ] Create template form saves correctly
- [ ] Template status (approved / pending) shows correctly

### Agents (Admin only)
- [ ] `/agents` accessible when logged in as ADMIN
- [ ] Non-admin session receives 403 on `/api/agents`
- [ ] Create agent form saves correctly

### Analytics
- [ ] `/analytics` renders charts without errors
- [ ] KPI cards show numeric values (not NaN / undefined)
- [ ] Messages-per-day chart renders 30 data points

### Real-time (SSE)
- [ ] Open browser DevTools → Network → filter `EventStream`
- [ ] Confirm `/api/sse` connection appears with status 200
- [ ] Simulate inbound webhook (see below) — new conversation/message appears without page refresh

## Simulating an Inbound Webhook

Use curl or a REST client to POST a sample Meta webhook payload:

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "WABA_ID",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": { "phone_number_id": "PHONE_ID" },
          "contacts": [{ "profile": { "name": "Test User" }, "wa_id": "911234567890" }],
          "messages": [{
            "from": "911234567890",
            "id": "wamid.test123",
            "timestamp": "1700000000",
            "text": { "body": "Hello from test webhook" },
            "type": "text"
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

Expected: HTTP 200, new conversation in Inbox, SSE event fires on connected clients.

## Webhook Verification (GET)

```bash
curl "http://localhost:3000/api/webhook?hub.mode=subscribe&hub.verify_token=mywebhook123&hub.challenge=test_challenge"
```

Expected: response body `test_challenge`.

## Build Verification

```bash
npx tsc --noEmit       # zero TypeScript errors
npx next build         # zero build errors, zero ESLint errors
```
