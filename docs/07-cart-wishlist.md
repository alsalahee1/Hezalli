# 07 — Phase 7: Cart & Wishlist

**Goal:** Buyers can collect items into a cart (grouped by seller) and save items to a wishlist.
**Prerequisite:** Phase 6 complete.

---

## Step 7.1 — Shopping cart

- **Add to Cart** from product page (with chosen variant + quantity) and quick-add from product cards
- Cart stored in DB for logged-in users; in localStorage for guests, **merged into the account on login**
- `/cart` page: items **grouped by seller/store** (like Shopee — this grouping matters for multi-seller checkout later), per-item: image, title, variant, unit price, quantity stepper, remove; per-seller subtotal; grand total
- Header cart icon with live item count; mini-cart dropdown
- Stock guard: can't add more than available stock; price/stock revalidated when opening the cart (show "price changed" / "out of stock" notices)
- Select/deselect items with checkboxes (checkout only selected — Shopee-style)

✅ **Acceptance criteria**
- [ ] Add items from 2 different sellers → cart shows 2 groups with correct totals
- [ ] Guest cart survives refresh and merges on login
- [ ] Out-of-stock items can't be checked out

> **🔜 NEXT-STEP CARD**
> - **Next step:** 7.2 — Wishlist & save for later
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Low
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/07-cart-wishlist.md.
> Step 7.1 (cart) is done. Do Step 7.2: wishlist and save-for-later,
> as described. Commit, push, then show me the Next-Step Card for
> Phase 8.
> ```

---

## Step 7.2 — Wishlist & save for later

- Heart icon on product cards + product page toggles wishlist (login required; redirect back after login)
- `/account/wishlist`: grid of saved items with price + stock status, "Add to cart", remove
- "Save for later" action in the cart moves an item out of the cart into a saved list shown below the cart, with "move back to cart"

✅ **Acceptance criteria**
- [ ] Wishlist persists across sessions; save-for-later round-trips correctly

> **🔜 NEXT-STEP CARD — PHASE 7 COMPLETE 🎉**
> - **Next step:** Phase 8, Step 8.1 — Checkout flow
> - **Model:** Claude Opus 4.8 (order creation is the heart of the platform)
> - **Thinking level:** High (use plan mode)
> - **Session:** NEW session (new phase)
> - **Paste this prompt:**
> ```
> I am building the Hezalli marketplace. Phases 1–7 are done (cart works,
> grouped by seller). Read docs/08-checkout-orders.md and docs/DATABASE.md
> (order models), review the existing code briefly, then implement
> Step 8.1 (checkout flow) exactly as described. Use plan mode first.
> Commit, push, then show me the Next-Step Card for 8.2.
> ```
