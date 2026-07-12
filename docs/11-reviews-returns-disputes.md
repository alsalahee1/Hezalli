# 11 — Phase 11: Reviews, Returns & Disputes

**Goal:** Trust features — buyers review products, request returns/refunds, and escalate disputes that admin resolves.
**Prerequisite:** Phase 10 complete.

---

## Step 11.1 — Reviews & ratings

- After a sub-order is COMPLETED, buyer can review each item: 1–5 stars, text, up to 5 photos; one review per purchased item (editable for 30 days); **"Verified purchase"** badge
- Product page Reviews tab becomes real: average stars, star-distribution bars, photo strip, sort (newest / highest / lowest / with photos), pagination
- Product cards and search results show real average rating + count (store as denormalized fields updated on review write)
- **Store rating** = average of its products' reviews, shown on the store page and seller card
- Seller can post one public **reply** per review
- Report-review button (feeds admin moderation); admin can hide a review

✅ **Acceptance criteria**
- [ ] Buy → complete → review with photo → appears on PDP, updates averages everywhere
- [ ] Cannot review without purchase; seller reply displays

> **🔜 NEXT-STEP CARD**
> - **Next step:** 11.2 — Returns & refund requests
> - **Model:** Claude Opus 4.8 (state machine + money interaction)
> - **Thinking level:** High (use plan mode)
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/11-reviews-returns-disputes.md.
> Step 11.1 (reviews) is done. Do Step 11.2: the full return/refund
> request flow between buyer and seller, as described. Use plan mode
> first. Commit, push, then show me the Next-Step Card for 11.3.
> ```

---

## Step 11.2 — Returns & refund requests 🧠

**Return status flow:** `REQUESTED → APPROVED → (buyer ships back) RETURN_SHIPPED → RECEIVED_BACK → REFUNDED`, plus `REJECTED` and `ESCALATED`.

- Buyer "Return/Refund" on a DELIVERED/COMPLETED item (within the return window, e.g. 7–15 days, configurable): choose reason (damaged, wrong item, not as described, changed mind…), description, photo evidence, choose refund-only or return-and-refund
- Seller `/seller/returns` queue: review request + evidence → **Approve** (with return address shown to buyer) or **Reject** (with reason)
- Buyer ships back and enters tracking; seller confirms **Received back** → triggers refund via Phase 9 (gateway refund or COD manual record); stock optionally restored
- Either side can **Escalate to Hezalli** → creates a Dispute (Step 11.3)
- Timelines/deadlines: seller must respond in X days or auto-approve; all transitions notify both sides

✅ **Acceptance criteria**
- [ ] Full happy path: request → approve → ship back → received → refunded (test-mode gateway refund fires)
- [ ] Reject path and escalation path both work
- [ ] Seller silence for X days auto-approves (test with X=0)

> **🔜 NEXT-STEP CARD**
> - **Next step:** 11.3 — Disputes (admin arbitration)
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session (or new if long)
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/11-reviews-returns-disputes.md.
> Steps 11.1–11.2 are done. Do Step 11.3: the admin dispute-resolution
> center, as described. Commit, push, then show me the Next-Step Card
> for Phase 12.
> ```

---

## Step 11.3 — Disputes (admin arbitration)

- Dispute sources: escalated returns, "order not received" (Phase 10), payment complaints
- `/admin/disputes`: queue with order context, both parties' statements and evidence, message thread where admin can ask either side for more info
- Admin verdict actions: full refund buyer / partial refund / release to seller / other, with written decision; verdict executes automatically (refund API, ledger adjustments) and notifies both sides
- Dispute history stored on the order

✅ **Acceptance criteria**
- [ ] Escalated return appears in admin queue; a refund verdict executes correctly end-to-end

> **🔜 NEXT-STEP CARD — PHASE 11 COMPLETE 🎉**
> - **Next step:** Phase 12, Step 12.1 — In-app notifications
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** NEW session (new phase)
> - **Paste this prompt:**
> ```
> I am building the Hezalli marketplace. Phases 1–11 are done. Read
> docs/12-chat-notifications.md, review the existing code briefly, then
> implement Step 12.1 (in-app notification center) exactly as described.
> Commit, push, then show me the Next-Step Card for 12.2.
> ```
