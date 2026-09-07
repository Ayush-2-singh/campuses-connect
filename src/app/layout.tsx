import type { Metadata } from 'next'
import './globals.css'
import { ToastProvider } from '@/components/Toast'
import OfflineIndicator from '@/components/OfflineIndicator'
import LoadingBar from '@/components/LoadingBar'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.connecttocampus.com'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "ConnectToCampus — India's #1 Campus Community for CS Students",
    template: '%s · ConnectToCampus',
  },
  description:
    'ConnectToCampus is the ultimate platform for Computer Science students across Indian colleges. Access notes, PYQs, hackathons, internships, DSA contests, AI-powered study tools, and connect with your campus community — all for free.',
  keywords: [
    'ConnectToCampus',
    'campus community India',
    'college students platform',
    'CS students India',
    'computer science community',
    'engineering college notes',
    'PYQ papers',
    'hackathons India',
    'internship opportunities',
    'DSA practice',
    'college events',
    'campus feed',
    'student networking',
    'free college platform',
    'IIT NIT college',
    'PW IOI',
    'BBD University',
    'study resources',
    'AI study assistant',
    'coding challenges',
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
    title: "ConnectToCampus — India's #1 Campus Community for CS Students",
    description:
      'Access notes, PYQs, hackathons, internships, DSA contests, and AI-powered study tools — all free for Indian CS students.',
    url: APP_URL,
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: "ConnectToCampus — India's #1 Campus Community for CS Students",
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "ConnectToCampus — India's #1 Campus Community for CS Students",
    description: 'Notes, PYQs, hackathons, internships, DSA contests & AI study tools — free for Indian CS students.',
    images: ['/og.png'],
    creator: '@connecttocampus',
  },
  icons: {
    icon: '/favicon.ico',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    other: [
      { rel: 'icon', url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { rel: 'icon', url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { rel: 'mask-icon', url: '/icon-192.png', color: '#D4A843' },
    ],
  },
  manifest: '/manifest.webmanifest',
  themeColor: '#D4A843',
  colorScheme: 'dark',
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
    "India's largest campus community platform for Computer Science students — notes, hackathons, internships, DSA contests, and AI-powered study tools.",
  inLanguage: 'en-IN',
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${APP_URL}/notes?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
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

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollegeOrUniversity',
  name: 'ConnectToCampus',
  url: APP_URL,
  description:
    'A community platform connecting Computer Science students across Indian colleges with notes, hackathons, internships, and AI-powered study tools.',
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'INR',
    description: 'Free for all students',
  },
  featureList: [
    'Campus Feed & Announcements',
    'Notes & PYQ Library',
    'AI-Powered Study Assistant',
    'DSA Practice & Contests',
    'Hackathon & Internship Board',
    'Student Networking',
    'Global Community',
  ],
}

// Apply the saved theme before first paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('cc-theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){}})();`

// Register the service worker (installable PWA).
const swScript = `(function(){if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){})}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://tnlbqirrrjrkxkxlkpat.supabase.co" />
        <link rel="preconnect" href="https://openrouter.ai" />

        {/* JSON-LD Structured Data */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />

        {/* Favicons & App Icons */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#D4A843" />
        <meta name="msapplication-TileColor" content="#D4A843" />
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
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
