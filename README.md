# API Playground

A Postman-like API testing tool — local-first, no account required.

## Features

- **Workspaces**: Organize collections by project/team
- **Request Builder**: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- **Headers, Params, Body**: JSON, form-data, x-www-form-urlencoded, raw
- **Auth**: Bearer token, Basic auth (per-request)
- **Variables**: Global > Environment > Collection scoping (last wins)
- **Collections**: Group, save, rename, import/export as JSON
- **History**: Last 100 requests stored locally
- **Theme**: Light/dark mode

## Architecture Phases

### Phase 1 — Auth + Account Management (DISABLED)
- Google OAuth via Auth.js + Supabase
- User profile, session management
- Toggle: enable/disable via Settings ⚙ → Feature switch
- Currently **off** — all data stays in localStorage

### Phase 2 — Workspaces (LOCAL-FIRST) ✅
- Multiple workspaces (create, rename, delete, switch)
- Collections scoped to workspace
- Import/Export per-workspace or all at once
- All data in localStorage (no auth needed)
- **Future**: sync to Supabase, invite members, roles

### Phase 3 — Variable Scoping + Import/Export ✅
- **Variable resolution order**: Global < Environment < Collection
- Per-collection variables (scoped to a collection)
- Import/Export collections/workspaces as JSON files
- All data persisted in localStorage (local-first)

## Stack

| Layer     | Tech                     |
|-----------|--------------------------|
| Frontend  | Next.js 16, React 19     |
| Styling   | Tailwind CSS 4           |
| State     | Zustand (persisted)      |
| Database  | Supabase (PostgreSQL)    |
| Auth      | Auth.js v5 + Google OAuth|
| ORM       | Drizzle ORM              |

## Setup

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev
```

## Environment Variables

```env
# Supabase (required for Phase 1+)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Auth.js (required when auth enabled)
AUTH_SECRET=generate_with_openssl_rand
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Feature flags
NEXT_PUBLIC_FEATURE_AUTH=false    # set true to enable auth

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Variable Scoping

Variables use `{{variable_name}}` syntax. Resolution order:

1. **Global** — always active
2. **Environment** — active when selected in sidebar
3. **Collection** — active when collection is selected (highest priority)

If the same variable name exists at multiple levels, the **last wins** (collection > env > global).

## Workspaces

Workspaces organize your collections. Each workspace has its own set of collections.

- **Create**: Click + in workspace selector
- **Switch**: Click workspace name → select from dropdown
- **Rename**: Click ✎ in dropdown
- **Delete**: Click ✕ in dropdown (must have >1 workspace)
- **Export**: Click ↑ in workspace header
- **Import**: Click ↓ Import in workspace dropdown

## Import / Export

- Export workspace: click ↑ in workspace header
- Export all: click ↑ Export All in workspace dropdown
- Import: click ↓ Import in workspace dropdown → select `.json` file

Export format:
```json
{
  "_exportType": "api-playground-workspace",
  "_version": 1,
  "workspace": {
    "name": "My Workspace",
    "collections": [
      {
        "name": "My API",
        "variables": [...],
        "requests": [...]
      }
    ]
  }
}
```

## Deploy (VPS)

```bash
# PM2
pm2 start ecosystem.config.js
# Port: 3004
# Subdomain: api-playground.adityahimaone.space
```

## Project Structure

```
api-playground/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/   # Auth.js handler
│   │   └── proxy/route.ts        # CORS proxy for API requests
│   ├── globals.css               # Theme tokens (light/dark)
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Main playground UI
├── components/
│   ├── request-builder.tsx       # URL bar, method, params, headers, body
│   ├── response-viewer.tsx       # Response body, headers, status
│   ├── save-modal.tsx            # Save request to collection
│   ├── sidebar.tsx               # Workspace selector, collections, history, variables
│   └── variables-modal.tsx       # Quick variable editor
├── lib/
│   ├── auth.ts                   # Auth.js config
│   ├── auth-types.ts             # Auth type augmentation
│   ├── features.ts               # Feature flags
│   ├── store.ts                  # Zustand store (workspaces, collections, history, variables)
│   ├── supabase/                 # Supabase client helpers
│   └── types.ts                  # TypeScript types
├── supabase/
│   ├── config.toml               # Supabase CLI config
│   └── migrations/               # SQL migrations
└── .env.example                  # Environment template
```
