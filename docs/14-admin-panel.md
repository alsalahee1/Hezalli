# 14 — Phase 14: Admin Panel (completion)

**Goal:** Finish the admin panel. Many admin screens already exist from earlier phases (sellers 4.1, products 5.4, payouts 9.4, disputes 11.3, vouchers 13.1…). This phase fills the gaps and adds oversight & reporting.
**Prerequisite:** Phases 1–13 (or at least 1–10 for an MVP-first path).

---

## Step 14.1 — Admin dashboard & reports

- `/admin` home: KPIs (GMV today/this month, orders, new users, new sellers, active disputes, pending payouts), charts (sales over time, orders by status, top categories, top sellers)
- `/admin/reports`: date-range reports — sales, commission earned, payouts, refunds; CSV export
- Keep queries efficient (aggregate in SQL, not in JS loops)

✅ **Acceptance criteria**
- [ ] Numbers match reality (hand-verify against seeded/test orders)
- [ ] CSV export opens correctly in Excel/Sheets

> **🔜 NEXT-STEP CARD**
> - **Next step:** 14.2 — User & order oversight
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/14-admin-panel.md.
> Step 14.1 is done. Do Step 14.2: admin user management and global
> order oversight, as described. Commit, push, then show me the
> Next-Step Card for 14.3.
> ```

---

## Step 14.2 — User & order oversight

- `/admin/users`: search/filter all users; view profile with order history; actions: suspend/unsuspend (blocks login, with reason), reset password email, change role, delete (soft)
- `/admin/sellers`: extend the Phase 4 screen — seller detail page (store, products, orders, balance, payout history), suspend store (hides all its products), commission override per seller
- `/admin/orders`: ALL orders across the platform, powerful filters, order detail with full timeline; admin powers: cancel, force status change (audit-logged), trigger refund (reuses Phase 9)
- **Audit log**: every admin action recorded (who, what, when) and viewable at `/admin/audit`

✅ **Acceptance criteria**
- [ ] Suspending a user blocks login; suspending a store hides products from buyers
- [ ] Every admin action from this step appears in the audit log

> **🔜 NEXT-STEP CARD**
> - **Next step:** 14.3 — Settings & CMS
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Low–Medium
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/14-admin-panel.md.
> Steps 14.1–14.2 are done. Do Step 14.3: platform settings, CMS pages,
> banners manager, and admin-staff roles. Commit, push, then show me
> the Next-Step Card for Phase 15.
> ```

---

## Step 14.3 — Settings & CMS

- `/admin/settings`: platform name/logo, commission %, return-window days, auto-complete days, payout minimum, COD on/off, maintenance mode toggle
- **CMS pages**: create/edit rich-text pages (About Us, Terms of Service, Privacy Policy, Return Policy, FAQ, Contact) rendered at `/p/[slug]`; footer links to them — *have Claude also draft the actual Terms/Privacy/Return-policy text for you to review*
- **Banners manager** (extend Phase 6 banners: schedule, ordering, preview)
- Optional: sub-admin accounts with limited permissions (e.g. "support" can handle disputes only)

✅ **Acceptance criteria**
- [ ] Changing a setting (e.g. commission %) actually changes behavior
- [ ] All legal pages exist with real draft content

> **🔜 NEXT-STEP CARD — PHASE 14 COMPLETE 🎉**
> - **Next step:** Phase 15, Step 15.1 — Automated tests
> - **Model:** Claude Opus 4.8
> - **Thinking level:** High
> - **Session:** NEW session (new phase)
> - **Paste this prompt:**
> ```
> I am building the Hezalli marketplace. Phases 1–14 are done — the
> platform is feature-complete. Read docs/15-testing-security.md, then
> implement Step 15.1: set up the test stack and write the critical-path
> tests listed there. Commit, push, then show me the Next-Step Card
> for 15.2.
> ```
