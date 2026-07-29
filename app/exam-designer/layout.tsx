import AdminShell from "@/app/components/AdminShell";

export default function ExamDesignerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AdminShell>{children}</AdminShell>;
}
