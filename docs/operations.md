# Operations runbook

How to run, change, check and repair the system. First-time setup (accounts, OAuth, bucket) is in [setup.md](./setup.md);
every setting is in [configuration.md](./configuration.md); what the protections are is in [security.md](./security.md).

## 1. Running it

| What | Command | Notes |
|---|---|---|
| Develop | `npm run dev -- -p 3001` | **Use port 3001.** Port 3000 on this machine belongs to a different project (3dEstimator). Start it in your own terminal. |
| Production | `npm run build && npm run start` | Required for real use. `next dev` is slow, shows dev indicators and re-compiles on demand. |
| Build without disturbing dev | `NEXT_DIST_DIR=.next-build npx next build` then `rm -rf .next-build` | Never build over a running dev server's `.next` folder. |
| Typecheck / lint | `npm run typecheck`, `npx eslint src scripts` | The lint must report zero warnings (the commit gate uses that). |

**Public access.** The owner serves the app on the internet through Tailscale Funnel to `https://macbook-01.tail85990d.ts.net`, which forwards to whatever is listening on port 3001. Consequences:
- `BETTER_AUTH_URL` must be that https address, and Google's authorized redirect URI must match it.
- Whatever process is on 3001 is what the public sees. Use the production build for real traffic.
- While `next dev` is running, browsing through `localhost:3001` also works (dev only trusts those origins).
- The database is on the agent-server and is reachable only over Tailscale, so Tailscale must be up on this Mac.

## 2. Verification gate (before saying a change is done)

```bash
npm run typecheck
npx eslint src scripts                  # 0 warnings
npx tsx scripts/test-instant.ts         # static: every admin/per-user page opts out of prerender
npx tsx scripts/test-a11y-labels.ts     # static: every form label is linked
npx tsx scripts/test-docs.ts            # static: nothing in the code is undocumented
NEXT_DIST_DIR=.next-build npx next build; rm -rf .next-build
```
Then the tests for the area you changed (the table is in [testing.md](./testing.md)). The DB and S3 tests are slow because the database is remote: start them in the background and check the output after a minute. An interrupted run can leave `TEST-` rows; cleanup SQL is in testing.md.

## 3. Database changes

1. Edit `src/db/schema/*`.
2. `npx drizzle-kit generate --name short_description` creates `drizzle/000N_….sql`.
3. **Read the SQL.** Additive changes (new table, new column with a default) are safe; anything that drops or retypes needs a plan and a backup first.
4. `npm run db:migrate` applies it.

Notes:
- Messages like `schema "drizzle" already exists, skipping` are harmless notices. The success line is `migrations applied successfully!`.
- Never `db:push` against the real database; it can drop data.
- Migration history: `0000_init` (18 tables), `0001_guards_consent` (payment guard indexes, consent columns), `0002_site_content` (editable site content), `0003_users_admin` (block fields, private note, audit table).
- The DB is shared infrastructure on the agent-server; never touch other databases or containers there.
- **Backups: none are scheduled (G-67).** A manual dump: `pg_dump "$DATABASE_URL" -Fc -f darlcreates-$(date +%F).dump` (needs Tailscale and a Postgres 16 client). Take one before any risky migration.

## 4. Everyday tasks

| Task | How |
|---|---|
| Make someone an admin | They sign in with Google once, then `npx tsx scripts/make-admin.ts their@email.com` |
| Create a test customer and admin session (to drive the UI in a browser) | `npx tsx scripts/e2e-session.ts setup` prints signed cookies for `TEST-E2E-customer` and `TEST-E2E-admin` and creates the product `test-e2e-keychain`. Add the cookie to the browser (`secure: true`, domain `localhost`). **Always finish with** `npx tsx scripts/e2e-session.ts cleanup` |
| Browse as a demo customer | Mint a session cookie the same way as `cookieFor` in `scripts/e2e-session.ts`, for a user such as `seed-user-maria-santos` |
| Load demo data (products, customers, ~70 orders, reviews) | `npx tsx scripts/seed-demo.ts seed` |
| Remove all demo data | `npx tsx scripts/seed-demo.ts clear` (exact: only rows and files it created). `status` counts them. **Do this before launch**; the demo products are public |
| Make the running site drop cached data after a script changed the database | Set `REVALIDATE_SECRET` (configuration.md); `seed-demo` and `e2e-session` then do it themselves |
| Reset one editable page to its built-in text | The "Restore defaults" buttons in Admin → Landing page / Store & footer / Legal pages / Logos |
| See which customers accepted the current privacy policy | Admin → Legal pages (privacy tab) |
| Regenerate the built-in logos from the designer's files | `python3 scripts/build-brand-assets.py` (needs Pillow). Writes `public/brand/*` and `public/favicon.ico` |

## 5. Rotating secrets

| Secret | How | Effect |
|---|---|---|
| Database password | Change the role's password on the agent-server, update `DATABASE_URL`, restart | Brief downtime (G-13) |
| App S3 key | `aws iam create-access-key --user-name darlcreates-app --profile darljed`, update `.env.local`, restart, then delete the old key | None if done in this order (G-28). Confirm `aws sts get-caller-identity --profile darljed` shows account `551892774595` first |
| `BETTER_AUTH_SECRET` | New value (`openssl rand -base64 32`), restart | **Signs everyone out.** Use after a suspected leak |
| Google client secret | Create a new one in Google Cloud, update, restart, delete the old one | Sign-in unaffected |
| `REVALIDATE_SECRET` | Any new random string, restart | Only affects scripts |
| SMTP password | Update, restart | Emails resume |

Secrets live in `.env.local` (and ideally Bitwarden). Never paste them into chat, commits or tickets.

## 6. Before launch checklist

- [ ] `npx tsx scripts/seed-demo.ts clear`, then `npx tsx scripts/e2e-session.ts cleanup`
- [ ] Production build running (not `next dev`); `BETTER_AUTH_URL` is the public https address and matches Google's redirect URI
- [ ] S3 CORS includes the production origin (G-26) and `npx tsx scripts/test-cors.ts` passes
- [ ] The GCash number is the business one (T-06)
- [ ] Privacy Policy and Terms reviewed by a lawyer or accountant, then saved in Admin → Legal pages (T-09)
- [ ] Store details, footer, logos, landing page filled in
- [ ] SMTP configured, or accept console-only emails (G-23)
- [ ] Rotate the DB password and the S3 key (G-13, G-28); review `npm audit` (T-07)
- [ ] Security headers added (G-65); a database backup scheduled (G-67)
- [ ] You can sign in, place an order, submit a reference, verify it and walk the order to delivered

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| A product shows in the shop but its page is a 404 | The product was deleted straight from the database; the shop listing was cached | Restart the app, or save any product in Admin (expires the cache). Scripts now do it for you when `REVALIDATE_SECRET` is set. Deleting in Admin is immediate |
| Edited content does not appear | A script, not Admin, changed it | Same as above |
| Admin page shows an "Instant" / "blocking route" overlay in dev | A page awaits uncached data outside `<Suspense>` without `export const instant = false` | Add the opt-out to that page (a layout's does not cover its children). `test-instant.ts` finds these |
| Sign-out does nothing or says invalid origin | You are on an origin that is not `BETTER_AUTH_URL` (and not localhost in dev) | Use the configured URL |
| Blocked customer says they cannot sign in | Working as intended; check the user's page in Admin → Users | Unblock if wrong |
| Typecheck complains about a route that no longer exists, or "does not satisfy AppRoutes" for a new route | Stale generated types in `.next` | `rm -rf .next/types`; load the new route once in the running dev server so it regenerates |
| Upload fails with "Failed to fetch" although the presign call returned 200 | The page's origin is not in the S3 CORS rules | Add it (setup.md → S3) and run `test-cors.ts` |
| Browser shows `ERR_CONNECTION_REFUSED` on 3001 | The dev server is not running | Start it (section 1) |
| `EADDRINUSE` on 3001 | Another dev server is already running | Stop it or use that one |
| Dev server is very slow on the first visit to a page or action | On-demand compilation | Wait; this does not happen in the production build |
| Product page fails to load a model, or the 3D box shows "preview unavailable" | The file is missing or unreadable in S3 | Re-upload in Admin → Products → Files |
| Emails are not arriving | SMTP not configured | They are printed in the server console (`[email:dev]`) |
| Dashboard numbers look wrong | Remember: revenue counts verified payments on non-cancelled, non-refunded orders only | order-lifecycle.md, "Where each number comes from"; run `test-data-integrity.ts` |
| A customer paid but the order is still awaiting payment | They have not submitted the reference, or it is waiting in Admin → Payments | Verify it there |
| An `aws s3 ls` returned nothing, then later showed files | Occasional empty CLI output | Run it again without `2>/dev/null` and trust a second result |

## 8. If an account is compromised

1. Admin → Users → the person → **Block account** (ends all sessions at once), or **Sign out everywhere** if you only need a fresh Google sign-in.
2. If the *admin* Google account may be compromised: change the Google password and turn on 2-step verification, then rotate `BETTER_AUTH_SECRET` (signs everyone out).
3. Check Admin → Users → the person → Activity log, and the order history of recent orders.
4. If a secret leaked, rotate it (section 5).

## 9. Monitoring

None is set up (F-15). For now: the server console (email previews, errors), Admin → Dashboard (needs-attention strip, counts), and `npx tsx scripts/test-data-integrity.ts` as a periodic data check.
