import { AssistantSubnav } from "@/components/admin/assistant-subnav";

// Shared shell for the assistant admin area: a single sidebar entry whose
// Settings / Statistics / Knowledge-base views are tabs across the top,
// instead of three separate menu items.
export default function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <AssistantSubnav />
      {children}
    </div>
  );
}
