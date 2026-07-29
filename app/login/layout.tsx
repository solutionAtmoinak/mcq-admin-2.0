import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login | MCQ Admin",
  description: "Sign in to MCQ Admin.",
};

export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <main className="flex min-w-0 flex-1 flex-col">{children}</main>;
}
