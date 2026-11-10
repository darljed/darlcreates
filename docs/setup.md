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
npm run dev            # http://localhost:3000 (3001 if 3000 is busy)
```

Verification gate (run before calling anything done):

```bash
npm run build && npm run typecheck
npx tsx scripts/test-money.ts
npx tsx scripts/test-pricing.ts
npx tsx scripts/test-order-lifecycle.ts   # needs DB (Tailscale)
npx tsx scripts/test-instant.ts           # every admin page has its instant opt-out
npx tsx scripts/test-uploads.ts           # S3 round trip
npx tsx scripts/test-cors.ts              # browser-style CORS from each dev origin
```

## Environment variables (`.env.local`)

| Key | Purpose | Status |
|---|---|---|
| `DATABASE_URL` | Postgres on the agent-server | ✅ set (role `darlcreates`) |
| `BETTER_AUTH_SECRET` | Session signing. **Dev placeholder** — generate a real one: `openssl rand -base64 32` | ⚠️ replace |
| `BETTER_AUTH_URL` | App origin (`http://localhost:3000` locally) | ✅ |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth | ✅ set (sign-in not yet verified) |
| `AWS_REGION` | `ap-south-1` | ✅ |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Key of IAM user `darlcreates-app` (uploads bucket only) | ✅ set |
| `S3_BUCKET` | `darlcreates-uploads` | ✅ created 2026-11-09 |
| `CDN_BASE_URL` | Optional CloudFront domain. **Leave empty** — reads go through `/api/files` (D-14) | — |
| `SMTP_*`, `EMAIL_FROM` | Order emails; console-logged when unset | ⬜ |
| `NEXT_PUBLIC_GCASH_NAME` / `NEXT_PUBLIC_GCASH_NUMBER` | Shown to customers at payment. **Confirm the number is the business GCash** (T-06) | ⚠️ confirm |

The storage and email modules degrade gracefully when their env is empty, so the
app runs without them.

## Google OAuth

1. Google Cloud Console → APIs & Services → Credentials → OAuth client (Web).
2. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
   (add the production URL later).
3. Put the ID/secret in `.env.local`, restart `npm run dev`.
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

Keep these four in sync when conventions change.

## Brand assets

- Originals: `brand/source/wordmark-black.png` and `wordmark-white.png` (icon + wordmark,
  transparent, 2000x2000). Older black-only set is not used.
- Regenerate web logos + favicon/apple-icon: `python3 scripts/build-brand-assets.py` (needs Pillow).
- Outputs: `public/brand/{logo-horizontal,logo-horizontal-dark,logo-icon}.png`,
  `src/app/{icon.png,apple-icon.png,favicon.ico}`.
- Use `<BrandLogo variant="horizontal|icon" className="h-9" />`. Horizontal swaps
  black/white wordmark by theme (`dark:` class).
- Theme colors live in `src/app/globals.css` (`--primary` etc.).

## Known environment quirks

- `shadcn add` emits `import { cn } from "cn"` — rewrite to `@/lib/utils` and do
  not install the `cn` npm package (this broke the build once).
- shadcn `init` hung once in this environment; components were configured by
  hand (`components.json`) and `shadcn add` works.
- Google Drive logo folder is blocked by macOS privacy (TCC). Grant the terminal
  Full Disk Access, or copy the logos into `brand/` in the repo.
- Opening the dev server via the Tailscale hostname (`macbook-01.tail85990d.ts.net`)
  needs `allowedDevOrigins` in `next.config.ts` (set), otherwise Next blocks
  `/_next/hmr`. Add any other hostname/IP you browse from, then restart `next dev`.
- Starting `npm run dev` from inside an agent command can be blocked/killed;
  run it in your own terminal.
