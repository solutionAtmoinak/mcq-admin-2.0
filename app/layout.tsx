import type { Metadata } from "next";
import { Geist_Mono, Nunito } from "next/font/google";
import { MathJaxContext } from "better-react-mathjax";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import 'rsuite/dist/rsuite-no-reset.css';
import "./globals.css";
import ThemeProvider from "@/app/components/common/ThemeProvider";

const nunito = Nunito({
  variable: '--font-nunito',
  subsets: ['latin']
})

// Monospace stays a real monospace face (question codes, lot numbers, JSON).
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})


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
      className={`${nunito.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full bg-zinc-50">
        {/* startup.typeset: false — without it, MathJax's combined CDN bundle
            auto-typesets the whole page on load, mutating any raw `\( \)`
            text anywhere in the DOM (not just inside <MathJax>), which races
            React hydration. MathText's own <MathJax> instances typeset
            themselves; nothing else should. */}
        <ThemeProvider>
          <MathJaxContext config={{ startup: { typeset: false } }}>{children}</MathJaxContext>
        </ThemeProvider>
        <ToastContainer position="top-right" autoClose={4000} newestOnTop />
      </body>
    </html>
  );
}
