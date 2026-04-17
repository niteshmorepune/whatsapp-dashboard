# WhatsApp Business Support Dashboard

A full-featured WhatsApp Business support dashboard built with Next.js 14, TypeScript, Prisma (MySQL), Pusher real-time, and the Meta WhatsApp Cloud API.

## Features

- **Inbox**: Real-time conversation list + message thread view with Pusher
- **Contacts**: Full contact management with tags, opt-out, and conversation history
- **Templates**: Manage and approve WhatsApp message templates
- **Agents**: Admin-only team management (invite, deactivate, role assignment)
- **Analytics**: Message volume charts, conversation stats, agent performance
- **24-hour Window**: Enforces Meta's messaging window — auto-switches to templates
- **Authentication**: NextAuth.js with JWT, bcrypt password hashing, role-based access

---

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Fill in your `.env.local` credentials:

```
DATABASE_URL=mysql://USER:PASSWORD@HOST:PORT/DBNAME
NEXTAUTH_SECRET=a-random-32-char-secret
NEXTAUTH_URL=https://yourdomain.com

META_ACCESS_TOKEN=          # From Meta Developer App
META_PHONE_NUMBER_ID=       # WhatsApp Phone Number ID
META_WABA_ID=               # WhatsApp Business Account ID
META_WEBHOOK_VERIFY_TOKEN=  # Any random string you choose

PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
PUSHER_CLUSTER=

NEXT_PUBLIC_PUSHER_KEY=     # Same as PUSHER_KEY
NEXT_PUBLIC_PUSHER_CLUSTER= # Same as PUSHER_CLUSTER

QSTASH_URL=
QSTASH_TOKEN=
```

### 3. Run Database Migration

```bash
npx prisma migrate deploy
```

Or for development (creates migration files):
```bash
npx prisma migrate dev --name init
```

### 4. Seed the Database

Creates the default admin user and sample templates:

```bash
npm run db:seed
```

Default admin credentials:
- **Email**: `admin@youragency.com`
- **Password**: `Admin@1234`

> Change the password immediately after first login.

### 5. Generate Prisma Client (if needed)

```bash
npm run db:generate
```

### 6. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in.

---

## Production Build

```bash
npm run build
npm run start
```

---

## Registering the Webhook with Meta

1. Deploy your app to a public URL (e.g., `https://yourapp.com`)
2. Go to [Meta Developer Console](https://developers.facebook.com) → Your App → WhatsApp → Configuration
3. Under **Webhook**, click **Edit**:
   - **Callback URL**: `https://yourapp.com/api/webhook`
   - **Verify Token**: The value you set for `META_WEBHOOK_VERIFY_TOKEN`
4. Subscribe to: `messages`, `message_status_updates`
5. Click **Verify and Save**

---

## Creating Meta Message Templates

1. Go to [Meta Business Manager](https://business.facebook.com) → WhatsApp Manager → Message Templates
2. Click **Create Template** and fill in category, name, and body (use `{{1}}`, `{{2}}` for variables)
3. Submit for Meta approval (usually minutes to hours)
4. Once approved by Meta, add the template in the Templates page and mark it as **Approved**

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run db:migrate` | Run pending Prisma migrations |
| `npm run db:seed` | Seed database with admin user + templates |
| `npm run db:studio` | Open Prisma Studio (visual DB editor) |
| `npm run db:generate` | Regenerate Prisma client after schema changes |

---

## Environment Variable Reference

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL connection string (`mysql://user:pass@host:3306/dbname`) |
| `NEXTAUTH_SECRET` | Random secret for JWT signing (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Full URL of your deployment |
| `META_ACCESS_TOKEN` | Permanent access token from Meta Developer Console |
| `META_PHONE_NUMBER_ID` | The ID of your WhatsApp phone number |
| `META_WABA_ID` | Your WhatsApp Business Account ID |
| `META_WEBHOOK_VERIFY_TOKEN` | Any secret string to verify Meta webhook |
| `PUSHER_APP_ID` | Pusher App ID (from Pusher dashboard) |
| `PUSHER_KEY` | Pusher Key |
| `PUSHER_SECRET` | Pusher Secret |
| `PUSHER_CLUSTER` | Pusher cluster region (e.g., `ap2`, `us2`) |
| `NEXT_PUBLIC_PUSHER_KEY` | Same as `PUSHER_KEY` (browser-exposed) |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | Same as `PUSHER_CLUSTER` (browser-exposed) |
| `QSTASH_URL` | Upstash QStash endpoint URL |
| `QSTASH_TOKEN` | Upstash QStash API token |

---

## Architecture Notes

- **Real-time**: Pusher channels `inbox` (conversation list) and `conversation-{id}` (per-thread)
- **24-hr window**: `windowExpiresAt` is set to `now + 24h` on each inbound message. API and UI enforce this.
- **Webhook**: Meta sends events to `/api/webhook`. GET = verification, POST = messages & status updates.
- **Send API**: `/api/send` checks the window, calls Meta Cloud API, saves message, fires Pusher events.
- **Auth**: NextAuth credentials provider with bcrypt. JWT in cookies. Middleware protects all dashboard routes.
