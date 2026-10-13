import AdminShell from "@/app/components/common/AdminShell";

export default function AttemptsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AdminShell>{children}</AdminShell>;
}
