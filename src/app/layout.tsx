import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "CampusConnect",
  description: "Your campus. Connected.",
};

// Apply the saved theme before first paint to avoid a light/dark flash.
// Note: the 'cc-theme' key must stay in sync with THEME_KEY in ThemeToggle.tsx.
const themeScript = `(function(){try{var t=localStorage.getItem('cc-theme');if(t==='dark'||(t!=='light'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`;

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
