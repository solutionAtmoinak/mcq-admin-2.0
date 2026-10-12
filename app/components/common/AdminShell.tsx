import NavBar from "@/app/components/common/NavBar";
import Header from "@/app/components/common/Header";
import { getUser } from "@/app/lib/auth/auth";

export default async function AdminShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getUser().catch(() => null);
  const name =
    [user?.FirstName, user?.LastName].filter(Boolean).join(" ").trim() ||
    user?.email ||
    "User";
  // JWT role claims can be a single string or an array of roles.
  const rawRole: unknown = user?.role;
  const role = Array.isArray(rawRole) ? rawRole.join(", ") : (rawRole as string | undefined) ?? "";

  return (
    <>
      <NavBar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header name={name} role={role} />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </>
  );
}
