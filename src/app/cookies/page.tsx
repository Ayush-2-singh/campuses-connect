import Link from 'next/link'
import LegalPage from '@/components/legal/LegalPage'

/**
 * Cookie Policy — describes the cookies and local storage the app actually
 * uses: strictly-necessary session cookies (Supabase auth), preference keys
 * (theme, cookie choice), and optional consent-gated analytics.
 *
 * Metadata (title / description / canonical) lives in ./layout.tsx.
 */

export default function CookiePolicyPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      updated="October 13, 2026"
      lede={
        <>
          We keep cookies to a minimum: what we need to sign you in, a couple of preference keys, and optional analytics
          that only run if you accept them.
        </>
      }
    >
      <p>
        This Cookie Policy explains how ConnectToCampus uses cookies, local storage and similar technologies on the
        Service, and how you can control them. It should be read together with our{' '}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>1. What these technologies are</h2>
      <p>
        Cookies are small files a site stores in your browser so it can recognise your session on later requests. Local
        storage and session storage are similar browser features that hold small amounts of data on your device. We use
        all three, and for simplicity this policy calls them &ldquo;cookies&rdquo;.
      </p>

      <h2>2. The categories we use</h2>

      <h3>2.1 Strictly necessary</h3>
      <p>
        These are required for the Service to work. Without them you cannot sign in or stay signed in. They are set when
        you use the Service and are not used for advertising.
      </p>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Authentication session cookies</td>
            <td>Keep you signed in and keep your session secure. Set and read by our authentication provider.</td>
          </tr>
          <tr>
            <td>Security and load-balancing cookies</td>
            <td>Protect against abuse and route requests correctly.</td>
          </tr>
        </tbody>
      </table>

      <h3>2.2 Preferences</h3>
      <p>
        These remember choices you make, so the Service does not reset them. They are stored in your browser&rsquo;s
        local storage on your device.
      </p>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>cc-theme</td>
            <td>Remembers whether you chose the dark or light theme.</td>
          </tr>
          <tr>
            <td>cc-cookie-consent</td>
            <td>Remembers whether you accepted or declined optional analytics, so we do not ask again.</td>
          </tr>
        </tbody>
      </table>

      <h3>2.3 Analytics (optional — only with your consent)</h3>
      <p>
        If you accept analytics, we may load a measurement tool to understand how the Service is used — for example
        which pages are visited and how features perform. Nothing is loaded and nothing is measured before you accept,
        and nothing is measured if you decline.
      </p>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Analytics cookies / identifiers</td>
            <td>
              Aggregate usage measurement. The specific provider depends on our configuration — for example a
              privacy-focused analytics service or Google Analytics.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>3. What we do not use</h2>
      <p>
        We do not use cookies to serve third-party advertising, and we do not sell data collected through cookies. We do
        not run optional analytics for visitors who have declined or who have not yet made a choice.
      </p>

      <h2>4. How to control cookies</h2>
      <p>You can control cookies in a few ways:</p>
      <ul>
        <li>
          <strong>Our banner</strong> — accept or decline optional analytics when you first visit. You can change your
          choice at any time by clearing your browser&rsquo;s local storage for this site and reloading.
        </li>
        <li>
          <strong>Your browser</strong> — most browsers let you view, block and delete cookies and local storage. See
          your browser&rsquo;s help pages.
        </li>
        <li>
          <strong>Private or incognito mode</strong> — limits what is stored after you close the window, but you may be
          signed out.
        </li>
      </ul>
      <p>
        Blocking strictly necessary cookies will stop you signing in and will break parts of the Service. Blocking
        analytics has no effect on how the Service works.
      </p>

      <h2>5. Third-party technologies</h2>
      <p>
        Some cookies are set by providers we rely on — for example our authentication and database provider, and, if you
        consent, an analytics provider. Those providers process information under their own policies. See Section 8 of
        our <Link href="/privacy">Privacy Policy</Link> for the providers we use.
      </p>

      <h2>6. Changes to this policy</h2>
      <p>
        We may update this Cookie Policy from time to time. When we do, we will update the &ldquo;Last updated&rdquo;
        date at the top of this page. Material changes will be communicated where the law requires it.
      </p>

      <h2>7. Contact us</h2>
      <p>If you have questions about this Cookie Policy, contact us through the support channel on the website.</p>
      <p>
        <strong>ConnectToCampus</strong>
        <br />
        Website: <Link href="/">connecttocampus.com</Link>
      </p>
    </LegalPage>
  )
}
