import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import OfflineIndicator from "@/components/OfflineIndicator";
import LoadingBar from "@/components/LoadingBar";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://campus-connect-zeta-two.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "ConnectMyCampus — Your campus, connected",
    template: "%s · ConnectMyCampus",
  },
  description:
    "The community platform for Computer Science students in Indian colleges — campus feed, notes, events, DSA contests, hackathons and opportunities.",
  keywords: [
    "campus community",
    "college students India",
    "CS students",
    "notes and resources",
    "hackathons",
    "internships",
    "college events",
    "ConnectMyCampus",
  ],
  openGraph: {
    type: "website",
    siteName: "ConnectMyCampus",
    title: "ConnectMyCampus — Your campus, connected",
    description:
      "The community platform for Computer Science students in Indian colleges — campus feed, notes, events, DSA contests, hackathons and opportunities.",
    url: APP_URL,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "ConnectMyCampus — Your campus, connected",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ConnectMyCampus — Your campus, connected",
    description:
      "The community platform for Computer Science students in Indian colleges.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    other: [
      { rel: "icon", url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { rel: "icon", url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  manifest: "/manifest.webmanifest",
  themeColor: "#0F1115",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ConnectMyCampus",
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Apply the saved theme before first paint to avoid a flash.
// Connect My Campus is dark-first: the dark palette is the foundation and the
// default; only an explicit saved 'light' preference opts into light mode.
// Note: the 'cc-theme' key must stay in sync with THEME_KEY in ThemeToggle.tsx.
const themeScript = `(function(){try{var t=localStorage.getItem('cc-theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){}})();`;

// Register the service worker (installable PWA). Guarded for safety.
const swScript = `(function(){if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){})}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
        <ToastProvider>
          <LoadingBar />
          <OfflineIndicator />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
