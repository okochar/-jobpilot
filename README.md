# JobPilot Web — v1

Simple Next.js job discovery dashboard personalized for George's product design career.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Deploy

1. Push this folder to a private GitHub repository.
2. Import the repository in Vercel as a Next.js project.
3. Deploy. No environment variables are needed.

## Features

- Live public listing retrieval from Remotive, Arbeitnow, and selected Greenhouse/Lever boards.
- Filters design job titles and excludes obvious senior roles.
- Rough keyword-based match score; **not** a verified qualification score.
- Search by title/company/location.
- Track saved, applied, interview and rejected statuses in browser localStorage.
- Responsive desktop and mobile interface.

## Important limitations

- **No automatic job applications**: View job opens the original application page.
- No account login, Gmail access, Supabase, CV uploads, or background scheduling yet.
- Tracking is browser-local; it will not sync between devices.
- Job boards may throttle or change their public APIs. Partial source failures are shown.
- Location eligibility is not verified; always check whether the employer accepts applicants in Nigeria.
- A job marked Applied means *you* manually marked it, not that JobPilot submitted it.
- Never enter sensitive login credentials into this prototype.

## Next iteration

Supabase authentication + database for cross-device sync, CV matching with explicit user consent, review queue and platform-compliant submission integrations.
