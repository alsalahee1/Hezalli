# 15 — Phase 15: Testing, Security & Performance

**Goal:** Make the platform safe and solid before real users and real money touch it. **Do not skip this phase.**
**Prerequisite:** Feature-complete (Phases 1–14), or at minimum the MVP path (1–10).

---

## Step 15.1 — Automated tests (critical paths) 🧠

- Set up **Vitest** (unit/integration) + **Playwright** (end-to-end, browser already available in most CI)
- Unit/integration tests for the money-critical logic: order total calculation, voucher math (all types, multi-seller split), commission/ledger entries, stock decrement under concurrency, refund reversal, order/return state machines (invalid transitions rejected)
- Playwright E2E for the golden paths: register→verify→login; seller creates product; buyer searches→cart→COD checkout; card checkout (gateway test mode); ship→track→confirm received; return request→refund; admin approves seller
- Run all tests in the GitHub Actions CI from Phase 2

✅ **Acceptance criteria**
- [ ] All tests pass locally and in CI; CI blocks merging when tests fail

> **🔜 NEXT-STEP CARD**
> - **Next step:** 15.2 — Security audit & hardening
> - **Model:** Claude Opus 4.8 (best available — security)
> - **Thinking level:** High (maximum care)
> - **Session:** NEW session (fresh eyes for auditing)
> - **Paste this prompt:**
> ```
> I am building the Hezalli marketplace. Read docs/15-testing-security.md.
> Step 15.1 (tests) is done. Do Step 15.2: perform the full security
> audit described there, report all findings ranked by severity FIRST,
> then fix them one by one after showing me the list. Commit, push,
> then show me the Next-Step Card for 15.3.
> ```

---

## Step 15.2 — Security audit & hardening 🧠

Have Claude audit the entire codebase for, and fix:

- **Authorization holes** (the #1 marketplace risk): every API/server action must verify the caller owns the resource — can seller A edit seller B's product? Can a buyer read someone else's order/address/chat? Can a non-admin call admin endpoints directly?
- **Payment integrity**: webhook signature verification, idempotency, amounts always computed server-side (never trust client prices), no way to pay less than total
- **Injection & XSS**: raw SQL, rich-text/product descriptions sanitized, chat messages escaped
- **Uploads**: file type/size validation, no SVG/HTML uploads served inline, images served from storage domain
- **Rate limiting**: login, OTP/verification resend, register, chat, review, checkout endpoints
- **Secrets**: nothing sensitive in the repo or sent to the client bundle; security headers (CSP, HSTS…); cookies HttpOnly/secure; CSRF where relevant
- **Business-logic abuse**: voucher stacking exploits, negative quantities, self-purchase to inflate ratings, review without purchase
- Fix everything found; add regression tests for the worst ones

✅ **Acceptance criteria**
- [ ] Written findings list produced; every finding fixed or consciously accepted with a note
- [ ] Manual re-test: buyer B truly cannot access buyer A's order by changing the URL id

> **🔜 NEXT-STEP CARD**
> - **Next step:** 15.3 — Performance & reliability
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/15-testing-security.md.
> Steps 15.1–15.2 are done. Do Step 15.3: the performance and
> reliability pass, as described. Commit, push, then show me the
> Next-Step Card for Phase 16.
> ```

---

## Step 15.3 — Performance & reliability

- Fix N+1 queries (inspect Prisma logs on key pages); add DB indexes for search, listing, and order queries
- Image optimization (next/image everywhere, correct sizes), lazy loading, pagination limits
- Caching: static-generate CMS/category pages; cache home page sections briefly
- Lighthouse pass on home, listing, PDP — aim 85+ performance & accessibility (fix a11y basics: labels, contrast, keyboard)
- Error handling polish: friendly 404/500 pages, loading states everywhere, no unhandled promise rejections
- **Database backup** plan confirmed (Neon/Supabase automatic backups + how to restore — write it into docs/RUNBOOK.md)

✅ **Acceptance criteria**
- [ ] Lighthouse ≥85 on the three key pages; no N+1 on order/listing pages
- [ ] docs/RUNBOOK.md exists (backup/restore, common ops)

> **🔜 NEXT-STEP CARD — PHASE 15 COMPLETE 🎉**
> - **Next step:** Phase 16, Step 16.1 — Production setup & deploy
> - **Model:** Claude Opus 4.8
> - **Thinking level:** High
> - **Session:** NEW session (new phase)
> - **Paste this prompt:**
> ```
> I am building the Hezalli marketplace. Phases 1–15 are done and tested.
> Read docs/16-deployment-launch.md. Guide me through Step 16.1 —
> production deployment — telling me exactly what to click and paste for
> each external service, and make any code/config changes needed.
> Commit, push, then show me the Next-Step Card for 16.2.
> ```
