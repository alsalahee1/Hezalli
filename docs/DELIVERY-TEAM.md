# Hezalli Delivery Ops Team — desk scopes

`/delivery-manager` used to be a single all-powerful role: one `DELIVERY_MANAGER`
account could touch every shipment, every driver, every point center, and all
the money moving between them. This turns that one seat into a **team**, where
each member works only the desks an admin grants them — so drivers, point
centers, and the cash flowing in from both can be run by different people.

## The model

`DELIVERY_MANAGER` stays the **entry credential** to `/delivery-manager`. A
member's `User.deliveryScopes` (enum `DeliveryScope[]`) then narrows *which
desks* they may work:

| Desk (`DeliveryScope`) | Owns | Pages |
| --- | --- | --- |
| `DISPATCH` | live routing & tracking of parcels | dispatch board, scan, shipments, CSV export |
| `FLEET` | drivers & who moves parcels | couriers, fleets, carriers, vehicles, courier applications |
| `POINTS` | partner point centers | points, point staff, point applications |
| `SETTLEMENT` | money **in** from drivers & centers | cash exposure, remittances, courier/point ledgers, payouts, deposits |
| `NETWORK` | delivery config | shipping zones, category delivery defaults |

**Empty `deliveryScopes` = "Head of Delivery": every desk.** This keeps every
pre-existing `DELIVERY_MANAGER` account (which has no scopes) at full access,
with no data backfill. `ADMIN` is a superset of all desks.

## Where it is enforced

The same rule is applied in three places, so a member limited to one desk can't
reach another by calling its action or typing its URL:

- **Actions** — every delivery server action gates on its desk via
  `requireDeliveryScope(scope)` (`lib/authz.ts`), replacing the old blanket
  `requireDeliveryManagerId()`.
- **Pages** — each `/delivery-manager` page guards its desk (thin pages wrap in
  `<DeliveryGate scope=…>`; larger pages call `requireDeliveryScope` up top and
  render `<Forbidden/>` on miss).
- **Navigation** — the layout reads the member's access
  (`getDeliveryAccess()`) and trims the sidebar to their desks
  (`visibleNavKeys()` in `lib/delivery-access.ts`).

`requireDeliveryManagerId()` remains only as the umbrella entry gate (layout +
dashboard landing): any team member passes, regardless of desk.

## Granting desks

Admins manage the team at **`/admin/delivery-team`**: add a member by email
(grants `DELIVERY_MANAGER` + the checked desks), edit an existing member's
desks, or remove them (drops the role and clears scopes). Leaving every desk
unchecked = Head of Delivery. Every change is audit-logged
(`deliveryTeam.setScopes` / `deliveryTeam.remove`).

## Demo logins

`prisma/ensure-demo-logins.ts` seeds one Head of Delivery plus three scoped
desks (password `hezalli123`):

- `delivery@hezalli.com` — Head of Delivery (all desks)
- `fleet@hezalli.com` — `FLEET`
- `points@hezalli.com` — `POINTS`
- `settlement@hezalli.com` — `SETTLEMENT`
