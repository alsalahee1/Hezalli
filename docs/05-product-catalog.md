# 05 — Phase 5: Product Catalog

**Goal:** Sellers can create and manage full product listings (photos, variants, stock, prices); admin manages categories and moderates products.
**Prerequisite:** Phase 4 complete.

---

## Step 5.1 — Categories & brands (admin)

- `/admin/categories`: create/edit/delete categories with **parent-child tree** (e.g. Electronics → Phones → Accessories), name (per language if bilingual), slug, icon/image, sort order, active toggle
- `/admin/brands`: simple CRUD (name, logo, slug)
- Buyer header category nav now reads real categories from the DB
- Guard: cannot delete a category that has products

✅ **Acceptance criteria**
- [ ] Admin can build the launch category tree from DECISIONS.md
- [ ] Buyer site nav shows the real tree with dropdowns

> **🔜 NEXT-STEP CARD**
> - **Next step:** 5.2 — Create/edit product (the big one)
> - **Model:** Claude Opus 4.8 (complex form + data model usage) — Sonnet 5 acceptable
> - **Thinking level:** High (use plan mode)
> - **Session:** NEW session recommended (5.2 is large)
> - **Paste this prompt:**
> ```
> I am building the Hezalli marketplace. Read docs/05-product-catalog.md.
> Step 5.1 (categories/brands) is done. Review the Prisma schema and
> existing seller dashboard, then implement Step 5.2 (product create/edit
> with variants, images, stock) exactly as described. Use plan mode first.
> Commit, push, then show me the Next-Step Card for 5.3.
> ```

---

## Step 5.2 — Create / edit product 🧠

`/seller/products/new` and `/seller/products/[id]/edit` — a multi-section form:

- **Basics**: title, description (rich text), category picker (tree), brand, condition (new/used — eBay-style)
- **Images**: upload up to 8 images, drag to reorder, first = cover; client-side compression before upload
- **Variants**: optional option groups (e.g. Color: Red/Blue; Size: S/M/L) → auto-generate variant combinations, each with its own price, stock quantity, and SKU. Products without variants have a single default variant
- **Pricing & stock**: price, compare-at price (for showing discounts), stock quantity, low-stock threshold
- **Shipping fields**: weight, package size (used in Phase 10)
- **Status**: Draft / Published (and "Under review" if DECISIONS.md chose product moderation)
- Save as draft anytime; full validation on publish

✅ **Acceptance criteria**
- [ ] Seller can create a product with 2 option groups → variants generate correctly, each editable
- [ ] Images upload, reorder, and persist
- [ ] Draft saves with incomplete data; publish enforces validation

> **🔜 NEXT-STEP CARD**
> - **Next step:** 5.3 — Seller product list & inventory management
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/05-product-catalog.md.
> Steps 5.1–5.2 are done. Do Step 5.3: the seller product list with
> search/filter, quick stock & price edit, duplicate, delete/archive.
> Commit, push, then show me the Next-Step Card for 5.4.
> ```

---

## Step 5.3 — Seller product list & inventory

- `/seller/products`: table with cover image, title, price, stock, status, sales count; search + filter by status/category; pagination
- **Inline quick edit** of price and stock; bulk select → publish/unpublish/delete
- Duplicate product; archive (soft delete)
- **Low stock** badge + "out of stock" auto-status when stock hits 0

✅ **Acceptance criteria**
- [ ] Managing 20+ seeded products feels fast and correct

> **🔜 NEXT-STEP CARD**
> - **Next step:** 5.4 — Product moderation (admin) + real seed data
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Low–Medium
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/05-product-catalog.md.
> Steps 5.1–5.3 are done. Do Step 5.4: admin product moderation screens
> and upgrade the seed script to create realistic products with variants
> across the real category tree. Commit, push, then show me the
> Next-Step Card for Phase 6.
> ```

---

## Step 5.4 — Product moderation (admin) + realistic seed data

- `/admin/products`: all products, filter by status/seller/category; view; **Approve / Reject with reason** (if moderation enabled); force-unpublish any product violating rules (with notification to seller)
- Upgrade the seed script: ~60 realistic products with variants, real category assignments, and working placeholder images — you need rich data to build search in Phase 6

✅ **Acceptance criteria**
- [ ] Moderation flow works end-to-end with notifications
- [ ] Fresh seed produces a believable catalog

> **🔜 NEXT-STEP CARD — PHASE 5 COMPLETE 🎉**
> - **Next step:** Phase 6, Step 6.1 — Product detail page
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** NEW session (new phase)
> - **Paste this prompt:**
> ```
> I am building the Hezalli marketplace. Phases 1–5 are done (catalog
> management works, DB is seeded with realistic products). Read
> docs/06-search-discovery.md, review the existing code briefly, then
> implement Step 6.1 (product detail page) exactly as described.
> Commit, push, then show me the Next-Step Card for 6.2.
> ```
