# RIGHTNOW

> Meet someone live, **right now**. A real-time, location-based instant dating app.

RIGHTNOW is a high-octane, map-first dating experience. Users "Go Live" with a
vibe (coffee, drinks, walk, food, late) for a fixed time window, appear as live
pins on a map, and spark instant matches with people nearby.

This repository is a TypeScript monorepo with three workspaces:

| Workspace | Stack                                                                                     |
| --------- | ----------------------------------------------------------------------------------------- |
| `server`  | Node 20, Fastify 5, PostgreSQL + PostGIS, Redis, Socket.io, JWT, Zod                      |
| `client`  | React 18, Vite, TailwindCSS, Mapbox GL JS, Socket.io client, React Router, Zustand, Axios |
| `shared`  | Framework-agnostic TypeScript types shared by client and server                           |

Integrations: **Twilio** (SMS/OTP), **Stripe** (payments), **OpenAI** (AI
features), **Cloudinary** (media), **Google Places** (venues).

---

## Project structure

```
rightnow/
├── server/                 # Fastify API + Socket.io
│   ├── src/
│   │   ├── routes/         # HTTP route registration
│   │   ├── controllers/    # Request handlers
│   │   ├── middleware/     # Auth, error handling
│   │   ├── services/       # Twilio, Stripe, OpenAI, Cloudinary, Places
│   │   ├── db/             # Postgres pool, Redis, init.sql
│   │   ├── socket/         # Socket.io server
│   │   ├── utils/          # env (Zod), logger
│   │   └── server.ts       # Entry point (Fastify on :3000)
│   └── package.json
├── client/                 # React + Vite SPA
│   ├── src/
│   │   ├── screens/        # Route-level screens
│   │   ├── components/     # Reusable UI
│   │   ├── hooks/          # React hooks (useSocket, ...)
│   │   ├── store/          # Zustand stores
│   │   ├── services/       # Axios + Socket.io clients
│   │   ├── utils/          # Helpers
│   │   ├── styles/         # Tailwind entry CSS
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   └── package.json
├── shared/                 # Shared TS types
├── .env.example
├── docker-compose.yml      # Postgres (PostGIS) + Redis
└── package.json            # npm workspaces root
```

> **Note:** task spec referenced `server/server.js`; because the project is
> TypeScript throughout, the entry point is `server/src/server.ts`, compiled to
> `server/dist/server.js`.

---

## Prerequisites

- **Node.js >= 20** and npm 10+
- **Docker** (for PostgreSQL + Redis) — or local installs of both

---

## Getting started

### 1. Install dependencies

From the repo root (installs all workspaces):

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in the values. For a quick local start you only need the defaults plus a
`JWT_SECRET` (>= 16 chars). Third-party keys (Twilio, Stripe, etc.) are optional
— the server boots without them and only errors if you call those features.

The client reads `VITE_*` variables. Create `client/.env` (or rely on Vite's
proxy) with at least:

```bash
VITE_API_URL=http://localhost:3000/api/v1
VITE_SOCKET_URL=http://localhost:3000
VITE_MAPBOX_TOKEN=pk.your-mapbox-public-token
```

### 3. Start infrastructure (Postgres + Redis)

```bash
docker compose up -d
```

PostGIS and the initial schema (`server/src/db/init.sql`) are applied
automatically on first boot.

### 4. Run the app (server + client together)

```bash
npm run dev
```

- API: http://localhost:3000 — health check at **`GET /health`** → `{ "status": "ok", ... }`
- Web: http://localhost:5173 — black screen with **RIGHTNOW** in orange

Run them individually with `npm run dev:server` / `npm run dev:client`.

---

## Scripts (root)

| Command             | Description                      |
| ------------------- | -------------------------------- |
| `npm run dev`       | Run server + client concurrently |
| `npm run build`     | Build shared → server → client   |
| `npm run start`     | Start the compiled server        |
| `npm run lint`      | Lint all workspaces (ESLint)     |
| `npm run format`    | Format with Prettier             |
| `npm run typecheck` | Type-check all workspaces        |

---

## Design system

Tokens live in `client/tailwind.config.js`:

- **Accents:** `primary` `#ffb59a`, `hot` `#ff5c00`, `green` `#00e55b`, `gold` `#FFD700`
- **Surfaces:** `s0` `#080808`, `s1` `#111111`, `s2` `#181818`, `s3` `#202020`, `s4` `#2a2a2a`
- **Fonts:** Archivo Narrow (display), Inter (body)
- **Motion:** `animate-pulse-ring` for live activity, glow shadows instead of drop shadows

The aesthetic is minimalist dark mode + glassmorphism: deep blacks, neon accents,
glows over shadows. See the design reference for full guidance.

---

## Tech notes

- **Geo:** live sessions use a PostGIS `GEOGRAPHY(POINT)` column with a GiST index
  for metre-accurate "who's live near me" queries.
- **Real-time:** Socket.io is attached to Fastify's HTTP server; Redis backs
  presence and (future) horizontal scaling via the Socket.io adapter.
- **Validation:** all environment variables are validated with Zod at boot
  (`server/src/utils/env.ts`).
- **Auth:** phone + OTP (Twilio Verify) issuing JWT access/refresh tokens.

## License

UNLICENSED — proprietary. All rights reserved.
