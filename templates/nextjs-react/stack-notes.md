# Next.js / React notes

- Prefer App Router patterns when `app/` exists; otherwise Pages Router.
- Keep server/client component boundaries explicit (`"use client"` only when needed).
- Colocate route handlers under `app/api/**`.
- Tailwind: use existing utility patterns; avoid one-off CSS modules unless the repo already does.
