import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function SellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell variant="seller">{children}</DashboardShell>;
}
