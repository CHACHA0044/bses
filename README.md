# BSES Consumer Registration & Dashboard Management System

A production-quality enterprise web application for BSES electricity consumers — enabling registration, authentication, connection applications, document management, and real-time status tracking.

## Architecture

A **Turborepo monorepo** (back end) with a **standalone frontend** that deploys independently on Vercel.

```
bses/
├── frontend/               # Next.js 14 (App Router) — consumer-facing frontend
├── apps/
│   └── gateway/            # Express API Gateway — single entry point for all clients
├── services/
│   ├── auth-service/        # Registration, login, JWT, password management
│   ├── consumer-service/    # User profiles, connection requests, admin operations
│   ├── document-service/    # File upload/download via MongoDB GridFS
│   └── notification-service/# SMS, WhatsApp, and email notifications
└── shared/                  # @bses/shared — internal package for cross-service modules
```

The `frontend/` folder is fully self-contained (it does not import `@bses/shared`), so it can be built and deployed on its own — e.g. on Vercel with **Root Directory = `frontend`**.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Zustand, Axios |
| Backend | Node.js, Express.js, TypeScript |
| Relational DB | PostgreSQL (via Prisma ORM) |
| Document Store | MongoDB (GridFS for binary file storage) |
| Auth | JWT + HTTP-only cookies, bcrypt |
| Encryption | AES-256 for sensitive PII |
| Logging | Winston with daily rotation |
| Validation | Zod |
| Compliance | DPDP Act 2023 |

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- PostgreSQL instance
- MongoDB instance (for document service)

### 1. Frontend (standalone)

```bash
cd frontend
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3001
```

Production build & run:

```bash
npm run build
npm run start
```

**Deploy to Vercel:** import this repo, set the project **Root Directory** to `frontend`, and add the environment variables from `frontend/.env.example` (notably `NEXT_PUBLIC_API_URL` pointing to your deployed gateway). Vercel auto-detects Next.js and uses the committed `package-lock.json`.

### 2. Backend (monorepo)

Install all workspace dependencies from the repo root:

```bash
npm install
```

Configure environment — copy `.env.example` to `.env` in each service and app and fill in the required values:

```bash
# For each service
cp services/auth-service/.env.example services/auth-service/.env
cp services/consumer-service/.env.example services/consumer-service/.env
cp services/document-service/.env.example services/document-service/.env
cp services/notification-service/.env.example services/notification-service/.env
cp apps/gateway/.env.example apps/gateway/.env
```

#### Database Setup (Auth Service)

```bash
cd services/auth-service
npm run db:generate   # Generate Prisma client
npm run db:migrate    # Run migrations
```

#### Start the backend

```bash
# Start all backend services in parallel (turbo)
npm run dev

# Or start individually
cd apps/gateway && npm run dev
cd services/auth-service && npm run dev
```

### 3. Wire the frontend to the backend

Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` to the gateway URL (defaults to `http://localhost:3000/api` locally):

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

## Default Ports

| Service | Port |
|---|---|
| Frontend (Next.js) | 3001 |
| Gateway | 3000 |
| Auth Service | 3010 |
| Consumer Service | 3011 |
| Document Service | 3012 |
| Notification Service | 3013 |

## Security

- Passwords hashed with bcrypt (cost factor 12)
- Mobile numbers and Aadhaar encrypted with AES-256
- JWT stored in HTTP-only, Secure, SameSite=Strict cookies
- Helmet security headers on all services
- Rate limiting on the API gateway
- Full audit logging for administrative actions
- DPDP Act 2023 compliant consent management

## Repository Notes

- Real secrets (`.env`, `.env.local`) are git-ignored — never commit them.
- `frontend/` carries its own `.gitignore` and `package-lock.json` so it stays deployable as a standalone project.
