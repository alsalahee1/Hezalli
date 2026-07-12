# Hezalli — Multi-Vendor E-Commerce Marketplace

Hezalli is a marketplace platform like **Shopee, Lazada, Noon, Amazon, and eBay** — a website/app where:

- **Buyers** register, search for products, add to cart, pay, track delivery, and confirm they received their order.
- **Sellers** register, open a store, list products, manage inventory, ship orders, and get paid.
- **Admins** manage the whole platform: approve sellers, moderate products, handle disputes, and see reports.

This kind of project is called a **multi-vendor e-commerce marketplace**.

## 📚 How this repository is organized (right now)

This repo currently contains the **complete build plan** — step-by-step documentation for building the entire platform with Claude Code. The actual code will be added phase by phase as you follow the plan.

```
docs/
  00-MASTER-PLAN.md            ← START HERE. Overview, rules, model guide, phase list
  01-planning-architecture.md  ← Phase 1: decisions, database design, architecture
  02-project-setup.md          ← Phase 2: create the code skeleton, dev environment
  03-accounts-auth.md          ← Phase 3: registration, login, profiles, addresses
  04-seller-onboarding.md      ← Phase 4: become a seller, create a store
  05-product-catalog.md        ← Phase 5: categories, products, variants, inventory
  06-search-discovery.md       ← Phase 6: home page, search, filters, product page
  07-cart-wishlist.md          ← Phase 7: shopping cart and wishlist
  08-checkout-orders.md        ← Phase 8: checkout flow and order management
  09-payments.md               ← Phase 9: online payment, COD, refunds, seller payouts
  10-shipping-delivery.md      ← Phase 10: shipping, tracking, delivery, "received" confirmation
  11-reviews-returns-disputes.md ← Phase 11: ratings, returns, disputes
  12-chat-notifications.md     ← Phase 12: buyer↔seller chat, email/push notifications
  13-promotions.md             ← Phase 13: coupons, vouchers, flash sales
  14-admin-panel.md            ← Phase 14: platform administration
  15-testing-security.md       ← Phase 15: testing, security hardening, performance
  16-deployment-launch.md      ← Phase 16: put it on the internet
  17-post-launch-growth.md     ← Phase 17: analytics, SEO, mobile apps, scaling
  18-business-model.md         ← How Hezalli makes money & manages vendors and buyers
```

## 🚀 How to start

1. Read `docs/00-MASTER-PLAN.md` completely (15 minutes).
2. Open a **new Claude Code session** and paste the starting prompt written at the bottom of the master plan.
3. Follow the phases in order. **Every step ends with a "Next-Step Card"** that tells you:
   - ✅ Which Claude **model** to use next
   - ✅ Which **thinking level** to use
   - ✅ Whether to use the **same session or a new session**
   - ✅ The exact **prompt to paste** if you start a new session

You never need to guess what to do next — just follow the cards.
