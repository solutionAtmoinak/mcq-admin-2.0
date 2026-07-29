import AdminShell from "@/app/components/AdminShell";

export default function ExamTemplatesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AdminShell>{children}</AdminShell>;
}
