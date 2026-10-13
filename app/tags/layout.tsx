import AdminShell from "@/app/components/common/AdminShell";

export default function TagsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AdminShell>{children}</AdminShell>;
}
