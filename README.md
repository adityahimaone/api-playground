# API Playground

A Postman-like API testing playground built with Next.js, Supabase, and Auth.js.

## Stack
- **Frontend:** Next.js 16, React 19, Tailwind CSS 4, Zustand
- **Database:** Supabase (PostgreSQL)
- **Auth:** Auth.js (NextAuth v5) + Google OAuth
- **ORM:** Drizzle ORM

## Setup

1. Clone the repo
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env.local` and fill in the values
4. Run the dev server: `npm run dev`

## Environment Variables

See `.env.local` for required variables:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `AUTH_SECRET` - Auth.js secret (generate with `npx auth secret`)
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
