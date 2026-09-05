import NavBar from "@/app/components/common/NavBar";

export default function AdminShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <NavBar />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </>
  );
}
