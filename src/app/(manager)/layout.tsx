import { AppShell } from "@/components/AppShell";

export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
