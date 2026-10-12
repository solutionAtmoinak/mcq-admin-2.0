"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// next-themes injects the pre-paint script, persists the choice and follows
// the OS setting. attribute="data-theme" matches the selectors in globals.css
// (html[data-theme="dark"]) and rsuite's own dark palette.
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="data-theme" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
