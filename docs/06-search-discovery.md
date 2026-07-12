# 06 — Phase 6: Search & Discovery (the buyer shopping experience)

**Goal:** Buyers can find anything: browse the home page, open categories, search with filters, and view a rich product page.
**Prerequisite:** Phase 5 complete (seeded catalog).

---

## Step 6.1 — Product detail page (PDP)

`/product/[slug]`:

- Image gallery with zoom + thumbnails
- Title, price (+ compare-at strike-through and % off), rating stars (real once Phase 11 lands), sold count
- **Variant pickers** (color swatches, size buttons) → price/stock/images update per selection; disabled combos when out of stock
- Quantity selector, **Add to Cart** + **Buy Now** buttons (cart works in Phase 7 — for now they can toast "coming soon")
- Seller card: store name, logo, rating, "Visit store", "Chat" (placeholder until Phase 12)
- Tabs: Description, Specifications, Reviews (placeholder), Shipping & Returns (from store policies)
- Related products strip (same category)
- Share button; wishlist heart (placeholder until Phase 7)

✅ **Acceptance criteria**
- [ ] Variant selection correctly switches price, stock, and image
- [ ] Page is fully responsive and loads fast

> **🔜 NEXT-STEP CARD**
> - **Next step:** 6.2 — Search + category listing with filters
> - **Model:** Claude Opus 4.8 (query logic gets subtle) — Sonnet 5 acceptable
> - **Thinking level:** High
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/06-search-discovery.md.
> Step 6.1 (product page) is done. Do Step 6.2: search results and
> category pages with full filtering/sorting/pagination via URL params,
> using Postgres full-text search. Commit, push, then show me the
> Next-Step Card for 6.3.
> ```

---

## Step 6.2 — Search & category listing with filters 🧠

One shared listing experience for `/search?q=...` and `/category/[slug]`:

- **Postgres full-text search** on title/description/brand (Meilisearch can replace it later — Phase 17)
- Header **search bar** with autocomplete suggestions (product titles + categories)
- **Filters sidebar**: category (with counts), price range, brand, rating ≥, condition, in-stock only, seller
- **Sorting**: relevance, newest, price ↑/↓, best selling, top rated
- Pagination (or infinite scroll), result count, active-filter chips with clear buttons
- All state in the **URL** (shareable links, back button works)
- Empty state with suggestions

✅ **Acceptance criteria**
- [ ] Searching a seeded product word finds it; filters combine correctly (verify manually with 3+ combinations)
- [ ] URL reflects every filter; refreshing keeps results

> **🔜 NEXT-STEP CARD**
> - **Next step:** 6.3 — Home page
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session (or new if long)
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/06-search-discovery.md.
> Steps 6.1–6.2 are done. Do Step 6.3: the real home page (hero banners,
> category tiles, product sections, recently viewed). Commit, push, then
> show me the Next-Step Card for Phase 7.
> ```

---

## Step 6.3 — Home page

- Hero **banner carousel** (admin-manageable `Banner` records: image, link, sort, active dates)
- Category tiles/icons row
- Product sections: "New arrivals", "Best sellers", "Deals" (compare-at price products), per-category strips
- **Recently viewed** (localStorage for guests, DB for logged-in)
- Skeleton loading states; mobile-first design

✅ **Acceptance criteria**
- [ ] Home page looks like a real marketplace (compare with Shopee/Noon visually)
- [ ] Banners are editable from `/admin`

> **🔜 NEXT-STEP CARD — PHASE 6 COMPLETE 🎉**
> - **Next step:** Phase 7, Step 7.1 — Shopping cart
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** NEW session (new phase)
> - **Paste this prompt:**
> ```
> I am building the Hezalli marketplace. Phases 1–6 are done (buyers can
> browse and search everything). Read docs/07-cart-wishlist.md, review
> the existing code briefly, then implement Step 7.1 (cart) exactly as
> described. Commit, push, then show me the Next-Step Card for 7.2.
> ```
