# Setup & Operations

How to run, configure and operate Darl Creates locally. Secrets are **never**
committed: `.env.local` is gitignored, `.env.example` documents every key.

## Prerequisites

- Node 22+, npm 10+
- Tailscale **up** (the database lives on the agent-server, Tailscale-only)
- `aws` CLI with the **`darljed`** profile (see AWS below)
- `psql` (optional, for inspecting the DB)

## Run it

```bash
cd /Users/darljedmatundan/Projects/darlcreates
npm install
npx next dev -p 3001   # http://localhost:3001
```

Port 3000 belongs to another project on this machine, so this project uses **3001**. The public address
(`https://macbook-01.tail85990d.ts.net`, Tailscale Funnel) forwards to 3001. Day-to-day running, building and deploying:
[operations.md](./operations.md).

Verification gate (run before calling anything done; details in [testing.md](./testing.md)):

```bash
npm run typecheck
npx eslint src scripts                       # 0 warnings
NEXT_DIST_DIR=.next-build npx next build     # then: rm -rf .next-build  (never build over a running dev server's .next)
npx tsx scripts/test-docs.ts                 # docs cover the code
# plus the scripts/test-*.ts for the area you changed; the full list is in testing.md
```

## Environment variables (`.env.local`)

Copy `.env.example` to `.env.local`. **The full reference (every variable, where it is read, what happens if it is missing,
build-time vs runtime) is [configuration.md](./configuration.md).** The ones you must set to run:

| Key | Purpose |
|---|---|
| `DATABASE_URL` | Postgres on the agent-server (role `darlcreates`) |
| `BETTER_AUTH_SECRET` | Session signing. `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Public origin of the site (`http://localhost:3001` locally) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` | Uploads (IAM user `darlcreates-app`, bucket `darlcreates-uploads`) |
| `NEXT_PUBLIC_GCASH_NAME` / `NEXT_PUBLIC_GCASH_NUMBER` | Shown to customers at payment. **Confirm the number is the business GCash** (T-06) |

Optional: `SMTP_*` and `EMAIL_FROM` (emails are printed to the console when unset), `CDN_BASE_URL` (leave empty),
`REVALIDATE_SECRET` / `REVALIDATE_URL` (see below), `NEXT_PUBLIC_BUSINESS_NAME` / `NEXT_PUBLIC_BUSINESS_EMAIL`,
`NEXT_PUBLIC_APP_URL` (leave unset).

The storage and email modules degrade gracefully when their env is empty, so the app runs without them.

## Google OAuth

1. Google Cloud Console → APIs & Services → Credentials → OAuth client (Web).
2. Authorized redirect URI: `{BETTER_AUTH_URL}/api/auth/callback/google` (add one for localhost:3001 and one for the Funnel URL).
3. Put the ID/secret in `.env.local`, restart the dev server.
4. Sign in once, then promote yourself:
   ```bash
   npx tsx scripts/make-admin.ts you@example.com
   ```
   Admin appears in the header; `/admin` is server-side gated.

## Database

- Host: agent-server `100.90.200.13:5432` (container `db-stack-postgres`,
  pgvector image). Database `darlcreates`, role `darlcreates`.
- Created 2026-11-09 with the `vector` extension (unused so far).
- Superuser on that container is `dbadmin` (not `postgres`) — only needed for
  creating databases/roles.
- Schema workflow: edit `src/db/schema/*` → `npm run db:generate` → **read the
  SQL** → `npm run db:migrate`.
- Seed sample products: `npx tsx scripts/seed.ts` (dev only; see T-03).
- ⚠️ The role password was printed in a terminal during setup — rotate it and
  keep it in Bitwarden (G-13).
- This DB is shared infra: never touch other containers/databases on that box.

## AWS — which profile? (important)

There are **two AWS accounts** on this machine:

| Profile(s) | Account | Owner | Use for |
|---|---|---|---|
| **`darljed`** | `551892774595` | **djam.devteam@gmail.com** | **Darl Creates** ✅ |
| `default`, `pmpc-preprod`, `pmpc-prod` | `535066803233` | PMPC | PMPC only — **never for this project** |

Rules:
- Always pass `--profile darljed` explicitly on AWS CLI commands for this project.
- Run `aws sts get-caller-identity --profile darljed` and confirm account
  `551892774595` before any write.
- The app reads `AWS_ACCESS_KEY_ID/SECRET` from `.env.local` (not a named
  profile). Use a **dedicated IAM user/key** scoped to this one bucket so nothing
  can fall through to another account.
- Primary region `ap-south-1`; SES (if used for email) is `ap-southeast-1`.

### S3 bucket (created 2026-11-09)

`darlcreates-uploads`, `ap-south-1`, account `551892774595`:

- Block **all** public access; reads via signed URLs or CloudFront (G-03).
- Default encryption SSE-S3.
- CORS: allow `PUT`/`GET`/`HEAD` from `http://localhost:3000` and the production
  origin, headers `*`, expose `ETag`.
- Key prefixes used by the app: `models/` (STL/3MF; `stl/` = older uploads), `photos/`, `customer/`, `proof/`, `reviews/`.
- IAM policy for the app key: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`
  on `arn:aws:s3:::darlcreates-uploads/*` and `s3:ListBucket` on the bucket —
  nothing else.
- Lifecycle: abort incomplete multipart uploads after 3 days. (Sweep for orphaned objects is G-27.)
- CORS origins (dev): `localhost`, `127.0.0.1` and `macbook-01.tail85990d.ts.net` on ports 3000/3001.
  A browser upload from any other address fails with "Failed to fetch" even though the
  presign call returns 200. Check with `npx tsx scripts/test-cors.ts`. To add an origin:
  `aws s3api put-bucket-cors --bucket darlcreates-uploads --cors-configuration file://cors.json --profile darljed --region ap-south-1`
  (verify the account is 551892774595 first) and add the origin to `scripts/test-cors.ts`.
- Production origin still missing (G-26).
- IAM user: `darlcreates-app`, inline policy `darlcreates-uploads-only`.
- To rotate the key: `aws iam create-access-key --user-name darlcreates-app --profile darljed`, update `.env.local`, then delete the old key.

## Branching & git

- Integration branch: `develop`. `main` holds only the scaffold commit. Work on
  feature branches off `develop`; conventional commits; PR to `develop`.
- Nothing is pushed anywhere yet (no remote configured). Do not push or open PRs
  without being asked. Never merge without permission.

## Agent files

| File | Read by |
|---|---|
| `AGENTS.md` | opencode, Codex, others — **shared source of truth** (contains a `next dev`-managed Next.js block; leave it) |
| `CLAUDE.md` | Claude — points to `AGENTS.md` |
| `.kiro/steering/{product,tech,structure}.md` | Kiro |
| `.kiro/specs/darl-creates-ecommerce/` | Requirements / design / tasks |

Keep these four in sync when conventions change. More: [operations.md](./operations.md), [security.md](./security.md), [configuration.md](./configuration.md).

## Refreshing the running app's cache from scripts
`seed-demo.ts` and `e2e-session.ts` change products directly in the database. To make the running site drop its cached copies
at once, set `REVALIDATE_SECRET` in `.env.local` (any long random string) and restart the app; the scripts then call
`POST /api/revalidate`. Without it the site can keep showing a deleted product for up to an hour. Never expose the value.

## Business details on documents

`src/lib/business.ts` holds the name / contact shown on the Order Acknowledgment. Override with
`NEXT_PUBLIC_BUSINESS_NAME` and `NEXT_PUBLIC_BUSINESS_EMAIL`. The privacy policy and terms are edited in
Admin → Legal pages; tick "Ask every customer to accept this policy again" when a change affects customers.

## Brand assets

- Originals: `brand/source/wordmark-black.png` and `wordmark-white.png` (icon + wordmark,
  transparent, 2000x2000). Older black-only set is not used.
- Regenerate web logos + favicon/apple-icon: `python3 scripts/build-brand-assets.py` (needs Pillow).
- Built-in files live in `public/brand/` (`logo-horizontal`, `logo-horizontal-dark`, `logo-icon`, `icon`, `apple-icon`)
  and `public/favicon.ico`. They are the fallback; the owner overrides them in **Admin → Logos & branding** (D-30).
  `build-brand-assets.py` writes there too (not `src/app/`: file-convention icons would override uploaded ones).
- Use `<BrandLogo variant="horizontal|icon" className="h-9" />` (an async server component: it reads the
  uploaded logos, so don't use it inside a client component; pass it in as a prop like `SignInCard` does).
- Theme colors live in `src/app/globals.css` (`--primary` etc.).

## Known environment quirks

- **Products inserted by a script don't show up until the cache is invalidated.** The product
  page caches (1h, tag `product:<slug>`) the result of the first request for a slug, including
  "not found". Products created through the admin UI invalidate that cache automatically; a
  script that inserts a row must not request the page before the insert finishes (and, if it
  did, use a never-requested slug). Don't run create-then-browse in parallel.


- `shadcn add` emits `import { cn } from "cn"` — rewrite to `@/lib/utils` and do
  not install the `cn` npm package (this broke the build once).
- shadcn `init` hung once in this environment; components were configured by
  hand (`components.json`) and `shadcn add` works.
- Google Drive logo folder is blocked by macOS privacy (TCC). Grant the terminal
  Full Disk Access, or copy the logos into `brand/` in the repo.
- Opening the dev server via the Tailscale hostname (`macbook-01.tail85990d.ts.net`)
  needs `allowedDevOrigins` in `next.config.ts` (set), otherwise Next blocks
  `/_next/hmr`. Add any other hostname/IP you browse from, then restart `next dev`.
- Two dev servers on the same project fight over port 3001 and `.next` (`EADDRINUSE`). Check with `lsof -i :3001` before starting one.
- Stale generated route types after deleting or renaming a page (typecheck errors about missing files under `.next/types`):
  `rm -rf .next/types`, then load a route once in dev.
- After editing `.env.local`, restart the server; `REVALIDATE_SECRET` and the other server values are read at start-up.
- A route that works in dev can still fail the build under Cache Components (runtime values during prerender). Always run the build before declaring done.
