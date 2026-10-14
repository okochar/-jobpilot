# JobPilot Web — v1

Simple Next.js job discovery dashboard personalized for George's product design career.

## Run locally

Requires Node.js 20+.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open http://localhost:3000

## Deploy

1. Push this folder to a private GitHub repository.
2. Import the repository in Vercel as a Next.js project.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel for Production, Preview, and Development.
4. Deploy.

## Features

- Live public listing retrieval from Remotive, Arbeitnow, Himalayas, Jobicy, Remote OK, We Work Remotely, and multiple Greenhouse company boards.
- Filters design job titles, excludes obvious senior roles, and prioritizes remote/Nigeria-friendly signals.
- Rotates results across companies and caps each company at six results so one employer cannot fill the dashboard.
- Rough keyword-based match score; **not** a verified qualification score.
- Search by title/company/location.
- Track saved, applied, interview and rejected statuses in Supabase for signed-in users, with browser localStorage as a fallback.
- Responsive desktop and mobile interface.

## Important limitations

- **No automatic job applications**: View job opens the original application page.
- No Gmail access, CV uploads, or background scheduling yet.
- Job boards may throttle or change their public APIs. Partial source failures are shown.
- Location eligibility is not verified; always check whether the employer accepts applicants in Nigeria.
- A job marked Applied means *you* manually marked it, not that JobPilot submitted it.
- Never enter sensitive login credentials into this prototype.

## Supabase setup

1. Run `supabase/migrations/001_jobpilot_auth_and_tracking.sql` in Supabase Dashboard > SQL Editor.
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Project Settings > API.
3. Add your local and deployed URLs in Authentication > URL Configuration when email confirmation is enabled.
4. Use **Sign in to sync** in JobPilot.

The migration creates `profiles` and `tracked_applications`, enables row-level security, and restricts records to the signed-in user. Only the public browser key is used by the app. Never add a database password or service-role key to `.env.local`, Git, or Vercel frontend variables.

## Next iteration

Supabase authentication + database for cross-device sync, CV matching with explicit user consent, review queue and platform-compliant submission integrations.
