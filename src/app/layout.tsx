import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'
import './landing.css'
import './hire-landing.css'
import './auth/auth.css'
import './legal.css'
import { ToastProvider } from '@/components/Toast'
import OfflineIndicator from '@/components/OfflineIndicator'
import LoadingBar from '@/components/LoadingBar'
import NativeShell from '@/components/NativeShell'
import CookieConsent from '@/components/CookieConsent'
import InstallPrompt from '@/components/InstallPrompt'
import Analytics from '@/components/Analytics'
import { CallProvider } from '@/components/voice/CallProvider'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.connecttocampus.com'

/**
 * Inter, self-hosted by next/font (no extra dependency, no render-blocking
 * request to Google). The previous stack named Inter first but never loaded it,
 * so every page silently fell back to Segoe UI / system-ui — which is the
 * single biggest reason the UI did not read as a designed product. */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

/**
 * Space Grotesk — the DISPLAY face for marketing surfaces (the public landing).
 *
 * The landing's headline is set in a geometric grotesque, while the product UI
 * stays on Inter: one display face for the promise, one reading face for the
 * interface. It is exposed as `--font-space-grotesk`, so only the marketing
 * stylesheet (hire-landing.css) opts into it — app pages are untouched.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
})

/**
 * `viewportFit: 'cover'` is what makes the `env(safe-area-inset-*)` rules in
 * globals.css resolve on Android and notched iOS. Without it those insets are
 * 0, so the fixed bottom navigation sits under the gesture bar in the Android
 * shell. Harmless on the web, and required there for notched phones too.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Browser chrome follows the product's default (light) surface, and declares
  // both schemes so the OS can pick correctly where we do not paint.
  // These live on `viewport` (not `metadata`) — Next 15 warns otherwise.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0c12' },
  ],
  colorScheme: 'light dark',
}

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    // Keyword first: what this site IS is interview experiences; the "Top 1%
    // SDE" pitch lives in the hero, not in the one line Google actually shows.
    default: 'ConnectToCampus — Interview Experiences for CSE & SDE Aspirants',
    template: '%s · ConnectToCampus',
  },
  // Describes the product that ships (see docs/ARCHITECTURE-V4.md): interview
  // write-ups, the companies behind them, and the practice that goes with them.
  // The retired social pitch (notes, PYQs, hackathons, campus feed) is gone from
  // this string because none of those routes render any more.
  description:
    'Read real, round-by-round interview experiences from Indian campuses, share your own, join student study groups, and practise the questions those rounds actually asked. Free for CSE & ECE students.',
  keywords: [
    'ConnectToCampus',
    'interview experiences',
    'campus placement India',
    'placement rounds',
    'fresher interview questions',
    'company interview questions',
    'engineering college placements',
    'tier 2 tier 3 colleges',
    'campus hiring',
    'DSA practice',
    'coding challenges',
    'AI interview coach',
    'live study rooms',
    'placement preparation',
    // The pitch this site is actually optimised for: students sharing interview
    // experiences with each other, not a job board.
    'interview experience sharing',
    'CSE students',
    'SDE preparation',
    'student study groups',
    'peer learning India',
    'top 1 percent developer',
    'campus groups',
  ],
  authors: [{ name: 'ConnectToCampus' }],
  creator: 'ConnectToCampus',
  publisher: 'ConnectToCampus',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: 'ConnectToCampus',
    title: 'ConnectToCampus — Interview Experiences for CSE & SDE Aspirants',
    description:
      'Read how a drive actually went, round by round, then practise exactly what it asked — and share your own. Free for CSE & ECE students.',
    url: APP_URL,
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'ConnectToCampus — interview experiences from Indian campuses, round by round',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ConnectToCampus — Interview Experiences for CSE & SDE Aspirants',
    description:
      'Interview experiences from Indian campuses, round by round, plus practice on the problems those rounds asked. Share yours, grow together.',
    images: ['/og.png'],
    creator: '@connecttocampus',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ConnectToCampus',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: APP_URL,
  },
}

// JSON-LD structured data for Google rich results
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'ConnectToCampus',
  alternateName: 'ConnectToCampus India',
  url: APP_URL,
  description:
    "India's platform for CSE and SDE aspirants: interview experiences written round by round by students who cleared them, student study groups, and practice on the problems those rounds actually asked.",
  slogan: 'Become the Top 1% SDE — grow together',
  inLanguage: 'en-IN',
  // No `potentialAction` / SearchAction: it pointed at `/jobs?q=`, a route that
  // no longer exists (the board was retired to /experiences, which has no query
  // parameter). Advertising a search endpoint that 404s is worse for crawlers
  // than advertising none.
  publisher: {
    '@type': 'Organization',
    name: 'ConnectToCampus',
    url: APP_URL,
    logo: {
      '@type': 'ImageObject',
      url: `${APP_URL}/icon-512.png`,
      width: 512,
      height: 512,
    },
    sameAs: [],
  },
}

/**
 * The second block describes what ships TODAY.
 *
 * It used to call ConnectToCampus a `CollegeOrUniversity` — this is a website,
 * not a degree-granting institution — and its `featureList` advertised the
 * retired social layer (campus feed, notes, hackathon board, global community).
 * Structured data that misdescribes the page is what earns a manual action, so
 * the type is now `WebApplication` and every listed feature is a route that
 * renders: /experiences, /compete, /live-voice-chat, /brain.
 */
const appJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'ConnectToCampus',
  url: APP_URL,
  description: 'Interview experiences and company rounds from Indian campuses, plus the practice to go with them.',
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  isAccessibleForFree: true,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'INR',
    description: 'Free for all students',
  },
  featureList: [
    'Interview experiences, round by round',
    'Company and campus data',
    'Timed practice on real interview problems',
    'Live study rooms',
    'AI coach',
  ],
}

// Apply the saved theme before first paint to avoid a flash.
// DEFAULT IS LIGHT: the product now leads with a light, warm-neutral surface
// (dark remains a first-class option via the toggle, stored under 'cc-theme').
const themeScript = `(function(){try{var t=localStorage.getItem('cc-theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){}})();`

// Register the service worker (installable PWA).
// Also: when a NEW service worker takes control (a deploy just activated), we
// reload once so the client runs the fresh bundle instead of the old cached
// one. Without it, a shipped nav change can stay invisible on an
// already-installed PWA until the user manually clears site data. We also ask
// for an update on load and hourly, since browsers otherwise re-check sw.js
// only on a cold navigation.
const swScript = `(function(){
  if(!('serviceWorker' in navigator)) return;
  var refreshing=false;
  navigator.serviceWorker.addEventListener('controllerchange',function(){
    if(refreshing) return; refreshing=true; window.location.reload();
  });
  navigator.serviceWorker.register('/sw.js').then(function(reg){
    if(reg.update) reg.update();
    setInterval(function(){ if(reg.update) reg.update(); }, 3600000);
  }).catch(function(){});
})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <head>
        {/* Preconnect to Supabase — only external API actually called from client.
            The project ref is never hardcoded here: it belongs in NEXT_PUBLIC_SUPABASE_URL. */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />}

        {/* JSON-LD Structured Data */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }} />

        {/* Favicons & App Icons */}
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        {/* theme-color is emitted by the `viewport` export above (light/dark
            aware). A hardcoded duplicate here raced it and could win on
            Android, painting the status bar the wrong shade. */}
        <meta name="msapplication-TileColor" content="#faf9f7" />
        <meta name="msapplication-tap-highlight" content="no" />

        {/* Mobile Web App */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ConnectToCampus" />

        {/* Security & Performance */}
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
        <ToastProvider>
          <LoadingBar />
          <OfflineIndicator />
          {/* Boots the Capacitor shell (status bar, back button, deep links,
              session refresh). Renders nothing and no-ops on the web. */}
          <NativeShell />
          {/* Cookie consent + consent-gated analytics (both no-ops until the
              visitor decides; Analytics additionally needs env vars set). */}
          <CookieConsent />
          <InstallPrompt />
          <Analytics />
          {/* The live voice call lives ABOVE the routes: that is what lets it
              survive navigation, so back/minimise can never hang anybody up.
              Renders children untouched until a call actually starts. */}
          <CallProvider>{children}</CallProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
