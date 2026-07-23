import { requireDeliveryScope } from "@/lib/authz";
import type { DeliveryScope } from "@/lib/delivery-access";
import { Forbidden } from "@/components/auth/forbidden";

// Per-desk guard for /delivery-manager pages. The layout admits any team
// member; this narrows a single page to one desk so a member limited to (say)
// FLEET can't open the Settlement pages by typing the URL. ADMIN and a Head of
// Delivery (no stored scopes) pass every desk. Server actions gate themselves
// independently — this is the page-render half of the same rule.
export async function DeliveryGate({
  scope,
  children,
}: {
  scope: DeliveryScope;
  children: React.ReactNode;
}) {
  const ok = await requireDeliveryScope(scope);
  if (!ok) return <Forbidden />;
  return <>{children}</>;
}
