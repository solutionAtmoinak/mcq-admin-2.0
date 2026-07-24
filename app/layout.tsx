import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import NavBar from "@/app/components/NavBar";
import { ToastContainer } from "react-toastify";
import 'rsuite/dist/rsuite-no-reset.css';
import "react-toastify/dist/ReactToastify.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MCQ Admin · Question Bank",
  description: "Create and manage the theory/MCQ question bank.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full bg-zinc-50">
        <NavBar />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
        <ToastContainer position="top-right" autoClose={4000} newestOnTop />
      </body>
    </html>
  );
}
