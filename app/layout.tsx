import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MathJaxContext } from "better-react-mathjax";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import 'rsuite/dist/rsuite-no-reset.css';
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
        {/* startup.typeset: false — without it, MathJax's combined CDN bundle
            auto-typesets the whole page on load, mutating any raw `\( \)`
            text anywhere in the DOM (not just inside <MathJax>), which races
            React hydration. MathText's own <MathJax> instances typeset
            themselves; nothing else should. */}
        <MathJaxContext config={{ startup: { typeset: false } }}>{children}</MathJaxContext>
        <ToastContainer position="top-right" autoClose={4000} newestOnTop />
      </body>
    </html>
  );
}
