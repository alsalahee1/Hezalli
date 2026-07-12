# 02 — Phase 2: Project Setup

**Goal:** A running, empty application skeleton with database, styling, and basic layout — the foundation every later phase builds on.
**Prerequisite:** Phase 1 complete (`DECISIONS.md`, `ARCHITECTURE.md`, `DATABASE.md` exist).

---

## Step 2.1 — Scaffold the Next.js project

- Create a Next.js 15 app (TypeScript, App Router, Tailwind CSS, ESLint) in this repo
- Install and configure **shadcn/ui**
- Set up **Prisma** with PostgreSQL (create a free database on Neon or Supabase — Claude will tell you exactly where to click and what URL to paste into `.env`)
- Create `.env.example` (names only) and ensure `.env` is git-ignored
- Add scripts: `dev`, `build`, `lint`, `db:migrate`, `db:studio`, `db:seed`
- Verify `npm run dev` shows a page at `localhost:3000`

✅ **Acceptance criteria**
- [ ] App runs locally with no errors
- [ ] Prisma connects to the database (`npx prisma db push` works)
- [ ] `.env` is NOT committed; `.env.example` is

> **🔜 NEXT-STEP CARD**
> - **Next step:** 2.2 — Create the database schema
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/02-project-setup.md
> and docs/DATABASE.md. Step 2.1 is done (app scaffolded). Do Step 2.2:
> implement the full Prisma schema from docs/DATABASE.md, run the first
> migration, and build the seed script. Commit, push, then show me the
> Next-Step Card for 2.3.
> ```

---

## Step 2.2 — Database schema + seed data 🧠

- Translate `docs/DATABASE.md` into the real `prisma/schema.prisma` (all models, even ones used in later phases — having them now avoids painful migrations later)
- Run the first migration
- Write a **seed script** that creates: 1 admin user, 2 test sellers with stores, 3 test buyers, the launch category tree from DECISIONS.md, ~20 fake products with images (placeholder image URLs), and a few fake orders
- Verify data in `npx prisma studio`

✅ **Acceptance criteria**
- [ ] Migration applies cleanly on a fresh database
- [ ] `npm run db:seed` populates all test data
- [ ] You can see the data in Prisma Studio

> **🔜 NEXT-STEP CARD**
> - **Next step:** 2.3 — App shell & layouts
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/02-project-setup.md.
> Steps 2.1–2.2 are done. Do Step 2.3: build the three app shells
> (buyer site, /seller, /admin) as described. Commit, push, then show
> me the Next-Step Card for 2.4.
> ```

---

## Step 2.3 — App shell & layouts

Build the visual skeleton (no real functionality yet):

- **Buyer site layout**: header (logo, search bar placeholder, cart icon, account menu), category nav bar, footer (links to About/Terms/Privacy placeholders), mobile-responsive
- **Seller dashboard layout** at `/seller`: sidebar (Dashboard, Products, Orders, Returns, Chat, Promotions, Settings), top bar
- **Admin panel layout** at `/admin`: sidebar (Dashboard, Users, Sellers, Products, Orders, Disputes, Categories, Promotions, Pages, Settings)
- Placeholder pages for each nav item ("Coming soon")
- If DECISIONS.md says Arabic+English: set up i18n and RTL switching NOW (e.g. `next-intl`), with a language switcher in the header

✅ **Acceptance criteria**
- [ ] All three layouts render and look clean on mobile + desktop
- [ ] (If bilingual) switching language flips text and direction (RTL)

> **🔜 NEXT-STEP CARD**
> - **Next step:** 2.4 — Code quality & CI
> - **Model:** Claude Haiku 4.5 (simple config work) — Sonnet 5 also fine
> - **Thinking level:** Low
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/02-project-setup.md.
> Steps 2.1–2.3 are done. Do Step 2.4: set up Prettier, a GitHub Actions
> CI workflow (lint + typecheck + build), and a PR-friendly .gitignore.
> Commit, push, then show me the Next-Step Card for Phase 3.
> ```

---

## Step 2.4 — Code quality & CI

- Prettier + consistent config; `npm run format`
- GitHub Actions workflow: on every push → install, lint, typecheck, build
- Confirm CI passes on GitHub

✅ **Acceptance criteria**
- [ ] CI is green on the pushed branch

> **🔜 NEXT-STEP CARD — PHASE 2 COMPLETE 🎉**
> - **Next step:** Phase 3, Step 3.1 — Registration & login
> - **Model:** Claude Opus 4.8 (auth is security-critical)
> - **Thinking level:** High
> - **Session:** NEW session (new phase)
> - **Paste this prompt:**
> ```
> I am building the Hezalli marketplace. Phases 1–2 are done (planning,
> scaffold, database, layouts). Read docs/00-MASTER-PLAN.md,
> docs/DECISIONS.md, and docs/03-accounts-auth.md. Review the existing
> code briefly to understand the current state. Then implement Step 3.1
> exactly as described. Use plan mode first. Commit, push, then show me
> the Next-Step Card for 3.2.
> ```
