# Irispectra Research Platform

Scientific public interface for three deliberately separate modalities:

1. Bilateral still-image iris structure submission.
2. Local, experimental pupil-response feasibility protocol.
3. Optional $170 one-to-one researcher review request.

The platform must not infer disease, organ state, personality or personal history from iris maps.

## Run locally

Copy `.env.example` to `.env.local`, fill the server-only variables, then:

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

## Production gates

- Confirm the Supabase migration and private bucket in the dashboard.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client code.
- Configure SMTP and verify both participant and operator delivery.
- Add platform-level rate limiting/WAF; the in-process limiter is only a secondary safeguard.
- Test submission, interrupted upload, retry, withdrawal, and permanent object deletion.
- Complete a data-processing register and legal review before recruiting participants.
- Treat pupil output as an uncalibrated pixel proxy until hardware and segmentation validation are complete.

## Data architecture

The reproducible database definition is in
`supabase/migrations/202609050001_initial.sql`. Participant records and iris
images remain private in Supabase; they are never stored in this public source
repository. Row-level security is enabled without anonymous policies, and the
image bucket is private.

Do not commit `.env.local`, service-role credentials, participant exports, or
image files.
