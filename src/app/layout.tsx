import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "CampusConnect",
  description: "Your campus. Connected.",
};

// Apply the saved theme before first paint to avoid a flash.
// Campus Connect is dark-first: the dark palette is the foundation and the
// default; only an explicit saved 'light' preference opts into light mode.
// Note: the 'cc-theme' key must stay in sync with THEME_KEY in ThemeToggle.tsx.
const themeScript = `(function(){try{var t=localStorage.getItem('cc-theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
