# 12 — Phase 12: Chat & Notifications

**Goal:** Buyers and sellers can message each other; everyone gets notified about everything important, in-app and by email (push optional).
**Prerequisite:** Phase 8+ (orders exist). Can be built in parallel with Phases 11/13 if you want.

---

## Step 12.1 — In-app notification center

- Central `notify()` helper: writes a `Notification` (user, type, title, body, link) — refactor ALL existing email-notification points (orders, shipping, returns, seller approval, payouts…) to also create in-app notifications through this one helper
- Bell icon in header with unread badge; dropdown of recent notifications; `/account/notifications` full list; mark read / mark all read; clicking navigates to the linked page
- Same for seller dashboard and admin panel

✅ **Acceptance criteria**
- [ ] Placing a test order produces correct in-app notifications for buyer and seller with working links

> **🔜 NEXT-STEP CARD**
> - **Next step:** 12.2 — Buyer↔seller chat
> - **Model:** Claude Opus 4.8 (realtime is fiddly) — Sonnet 5 acceptable
> - **Thinking level:** High
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/12-chat-notifications.md.
> Step 12.1 (notification center) is done. Do Step 12.2: realtime
> buyer-seller chat, as described. Commit, push, then show me the
> Next-Step Card for 12.3.
> ```

---

## Step 12.2 — Buyer ↔ seller chat 🧠

- "Chat" buttons (product page, store page, order page) open a conversation between the buyer and that store; product/order context card attached to the conversation when started from one
- Realtime delivery via **Pusher** (free tier) or Supabase Realtime; graceful fallback to polling
- Buyer chat UI at `/account/chat`, seller at `/seller/chat`: conversation list with unread counts + message thread; text + image messages; timestamps; read receipts (simple)
- Unread chat count in headers; email "you have a new message" if recipient is offline (max 1 email per hour per conversation)
- Basic abuse guard: block user option, admin can view a reported conversation

✅ **Acceptance criteria**
- [ ] Two browsers (buyer + seller) chat in realtime with images; unread counts correct

> **🔜 NEXT-STEP CARD**
> - **Next step:** 12.3 — Email polish & (optional) push
> - **Model:** Claude Haiku 4.5 (templating work) — Sonnet 5 fine
> - **Thinking level:** Low
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/12-chat-notifications.md.
> Steps 12.1–12.2 are done. Do Step 12.3: unify all emails into branded
> templates and add web push (optional), as described. Commit, push,
> then show me the Next-Step Card for Phase 13.
> ```

---

## Step 12.3 — Email polish & web push (optional)

- One branded email layout (logo, colors, footer) used by every email; audit all existing emails into it (react-email or similar)
- Notification preferences page: toggles per category (orders, chat, promotions)
- *(Optional)* Web Push via service worker for order updates & chat
- Admin **announcement banner** tool (site-wide dismissible bar)

✅ **Acceptance criteria**
- [ ] All emails share the brand template; preference toggles are respected

> **🔜 NEXT-STEP CARD — PHASE 12 COMPLETE 🎉**
> - **Next step:** Phase 13, Step 13.1 — Coupons & vouchers
> - **Model:** Claude Opus 4.8 (discount math touches money)
> - **Thinking level:** High
> - **Session:** NEW session (new phase)
> - **Paste this prompt:**
> ```
> I am building the Hezalli marketplace. Phases 1–12 are done. Read
> docs/13-promotions.md, review the existing checkout/pricing code, then
> implement Step 13.1 (coupons & vouchers) exactly as described. Use
> plan mode first. Commit, push, then show me the Next-Step Card for 13.2.
> ```
