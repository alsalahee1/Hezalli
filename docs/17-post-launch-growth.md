# 17 — Phase 17: Post-Launch & Growth (ongoing)

**Goal:** Grow traffic, sellers, and sales. These items are independent — pick by need, not by order. Each follows the same discipline: one step, acceptance criteria, commit/push, Next-Step Card.

| Item | What it is | Model / Level | Session |
|---|---|---|---|
| **17.1 SEO** | Meta titles/descriptions per page, structured data (Product, Review, Breadcrumb JSON-LD), sitemap.xml auto-generated, clean URLs, fix Search Console issues | Sonnet 5 / Medium | New |
| **17.2 Analytics** | GA4 or Plausible funnels (view→cart→checkout→paid), seller analytics dashboard upgrade (traffic, conversion per product) | Sonnet 5 / Medium | New |
| **17.3 Better search** | Migrate search + autocomplete to **Meilisearch** (typo tolerance, instant results, facets) | Opus 4.8 / High | New |
| **17.4 Recommendations** | "Customers also bought", personalized home sections (simple co-purchase + category affinity — no ML needed at first) | Opus 4.8 / High | New |
| **17.5 Multi-language completion** | If launched single-language: full i18n + RTL now; translate catalog fields | Sonnet 5 / Medium | New |
| **17.6 Mobile app** | React Native/Expo app reusing your API; push notifications; app-store publishing | Opus 4.8 / High | New (it's a mini-project: plan → build → ship, several sessions) |
| **17.7 Seller tools** | Bulk product import (CSV), sales analytics, auto-reply chat (auto-replies are signed by **Shadi / شادي**, the platform assistant — see DECISIONS.md §10), vacation mode | Sonnet 5 / Medium | New |
| **17.8 Marketing automations** | Abandoned-cart emails, back-in-stock alerts, price-drop alerts for wishlist items, newsletter | Sonnet 5 / Medium | New |
| **17.9 Loyalty** | Points per purchase, redeem as discount; referral program | Opus 4.8 / High (money math) | New |
| **17.10 Scale-ups** | Redis caching layer, read replicas, queue system (background jobs), image CDN tuning — *only when traffic demands it* | Opus 4.8 / High | New |
| **17.11 Shadi (شادي) assistant bot** | The platform assistant, named **Shadi (شادي)** per DECISIONS.md §10: a chat widget that answers buyer questions (order status, shipping, returns, payment methods) and guides sellers, in Arabic and English; appears as "شادي" / "Shadi" with its own avatar in the chat UI; hands off to human support / admin when it can't help | Opus 4.8 / High | New |

**New-session prompt template for any item:**

```
Hezalli marketplace is live. Read docs/17-post-launch-growth.md.
I want to do item 17.X (<name>). Review the relevant existing code,
propose a short plan first (plan mode), then implement it with
acceptance criteria. Commit, push, and give me a Next-Step Card
suggesting what to do after.
```

**Ongoing habits (monthly):**
- `npm audit` / dependency updates (ask Claude to do a safe-update pass)
- Review Sentry errors and fix the top recurring ones
- Check backup restore actually works (once a quarter)
- Review platform metrics vs. last month; let data pick your next 17.x item

---

## 🎓 You made it

If you followed every phase, you now have: accounts, sellers, KYC, catalog, search, cart, checkout, online payments + COD, commissions, payouts, shipping, tracking, received-confirmation, reviews, returns, disputes, chat, notifications, vouchers, flash sales, a full admin panel, tests, security hardening, and a monitored production deployment.

That is a complete Shopee/Noon/Amazon-style marketplace. Everything from here is iteration. 🚀
