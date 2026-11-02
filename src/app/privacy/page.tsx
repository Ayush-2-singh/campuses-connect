import Link from 'next/link'
import LegalPage from '@/components/legal/LegalPage'

/**
 * Privacy Policy — describes the product that ships today.
 *
 * The previous version was written for a campus-hiring product: company and
 * recruiter accounts, job applications, and candidate shortlists. None of those
 * surfaces are live (jobs/applications are gated off, no recruiter UI exists),
 * so a policy that promised them described processing that never happens.
 *
 * This version covers only: accounts and profiles, interview experiences, live
 * study rooms, messaging, Compete/Live Battle results, campus verification, and
 * the infrastructure that makes them work.
 *
 * Metadata (title / description / canonical) lives in ./layout.tsx.
 */

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="November 2, 2026"
      lede={
        <>
          ConnectToCampus is a student platform for interview experiences, live study rooms and timed practice. This
          policy explains what we collect, what other students can see, and the choices you have.
        </>
      }
    >
      <p>
        This Privacy Policy applies to <strong>ConnectToCampus</strong> (&ldquo;ConnectToCampus&rdquo;,
        &ldquo;we&rdquo;, &ldquo;our&rdquo; or &ldquo;us&rdquo;) and to the website, applications and services we
        operate (together, the &ldquo;Service&rdquo;). It applies to every student who creates an account.
      </p>
      <p>
        By using the Service, you acknowledge that you have read and understood this Privacy Policy. If you do not agree
        with it, please do not use the Service.
      </p>

      <h2>1. Information we collect</h2>

      <h3>1.1 Account and profile information</h3>
      <p>When you create an account or complete your profile, we collect information such as:</p>
      <ul>
        <li>Your name, email address and username</li>
        <li>Your profile picture or avatar</li>
        <li>
          Academic and campus information you choose to provide — for example your college or campus, course or degree,
          department, graduation year and location
        </li>
        <li>Skills, bio and links you add to your profile</li>
        <li>Your preferences, such as whether your profile is publicly visible</li>
        <li>Information you send us when you contact support or report a problem</li>
      </ul>
      <p>You do not have to provide optional information, but some features may not work without it.</p>

      <h3>1.2 Sign-in information</h3>
      <p>
        If you sign in with a third-party provider such as Google, we receive information from that provider — typically
        your name, email address, profile picture and a unique identifier. We use it to create and secure your account.
        We do not receive your third-party account password.
      </p>

      <h3>1.3 Content you create</h3>
      <p>Depending on the features you use, we store the content you submit, including:</p>
      <ul>
        <li>
          <strong>Interview experiences</strong> — the company, role, round-by-round write-up, questions asked, result
          and any details you choose to publish
        </li>
        <li>
          <strong>Live study rooms</strong> — the rooms you create or join, their topic and settings, and the in-room
          text chat you send
        </li>
        <li>
          <strong>Messages</strong> — connection requests and one-to-one messages exchanged with other students, with
          the timestamps needed to deliver them
        </li>
        <li>
          <strong>Compete and Live Battle</strong> — the questions you author, the answers you submit, your score,
          response times, leaderboard position and match history
        </li>
        <li>Anything else you choose to post, upload or send through the Service</li>
      </ul>

      <h3>1.4 Campus verification</h3>
      <p>
        If you request a campus assignment or a campus change, you may be asked to upload a college ID card or similar
        proof. Verification documents are stored in a private storage bucket, reviewed by our team through short-lived
        signed links, and removed once the review is complete. They are not shown to other students and are not part of
        your public profile.
      </p>

      <h3>1.5 Information collected automatically</h3>
      <p>When you use the Service, we and our infrastructure providers may automatically collect:</p>
      <ul>
        <li>IP address</li>
        <li>Browser type and version, device type and operating system</li>
        <li>Pages, features and actions within the Service, and the date and time of that activity</li>
        <li>Referring pages and general diagnostic or error information</li>
      </ul>
      <p>We use this for security, troubleshooting, measurement and improving the Service.</p>

      <h2>2. How we use information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Provide, operate and maintain the Service</li>
        <li>Create, authenticate and secure accounts</li>
        <li>Build and display your profile and the content you publish</li>
        <li>Run study rooms, messaging and connection requests</li>
        <li>Score Compete and Live Battle answers, and show leaderboards and history</li>
        <li>Verify campus assignments where you ask us to</li>
        <li>Communicate with you about your account and the Service</li>
        <li>Detect, prevent and investigate abuse, cheating and security incidents</li>
        <li>Diagnose technical problems and respond to support requests</li>
        <li>Measure and improve how the Service performs, where you have consented to analytics</li>
        <li>Comply with applicable legal obligations and enforce our agreements</li>
      </ul>
      <p>
        We will not use your personal information for purposes materially different from those described here without
        giving you notice where the law requires it.
      </p>

      <h2>3. What other people can see</h2>
      <p>
        The Service is built around shared learning, so some information is visible to other signed-in students — and,
        where you publish it, to anyone with the link:
      </p>
      <ul>
        <li>
          <strong>Your profile</strong> — display name, username, avatar, campus and department, skills and bio, as well
          as whether your profile is public. Private profiles are visible only to you and to the people you interact
          with.
        </li>
        <li>
          <strong>Interview experiences you publish</strong> — the write-up, company, role and details you include. A
          published experience is content you have chosen to share; do not include personal information you do not want
          to be public.
        </li>
        <li>
          <strong>Leaderboards and results</strong> — your display name, score and rank in Compete and Live Battle rooms
          are visible to other participants and on leaderboards.
        </li>
        <li>
          <strong>Room membership</strong> — other members of a study room can see that you are in it, and can read the
          in-room chat.
        </li>
        <li>
          <strong>Messages</strong> — one-to-one messages are visible only to the two participants.
        </li>
      </ul>
      <p>
        <strong>
          Do not add information to your profile or a published experience that you do not want others to see.
        </strong>{' '}
        Use the private-profile setting if you want to limit visibility.
      </p>

      <h2>4. Assessment and leaderboard results</h2>
      <p>
        Compete and Live Battle scores are a practice signal, not a hiring decision. They are stored against your
        account so you can see your history and rank, and they are shown to other participants on leaderboards. They are
        not sold, and they are not shared with employers or recruiters.
      </p>

      <h2>5. Cookies and similar technologies</h2>
      <p>We use cookies, local storage and similar technologies to:</p>
      <ul>
        <li>Keep you signed in and maintain your session</li>
        <li>Remember your preferences, such as your theme and your cookie choice</li>
        <li>Provide security features and prevent abuse</li>
        <li>Measure how the Service is used, but only where you have consented to analytics</li>
      </ul>
      <p>
        Strictly necessary cookies are required for the Service to work. Optional analytics run only after you accept
        them, and nothing is measured for visitors who decline or who have not yet decided. For the specific cookies we
        use and how to control them, see our <Link href="/cookies">Cookie Policy</Link>.
      </p>

      <h2>6. Third-party services</h2>
      <p>We rely on third-party providers for infrastructure and functionality. These currently include:</p>
      <ul>
        <li>
          <strong>Authentication, database and file storage</strong> — Supabase stores your account, profile, content
          and uploaded files on our behalf.
        </li>
        <li>
          <strong>Sign-in</strong> — if you choose Google sign-in, Google processes that authentication.
        </li>
        <li>
          <strong>Live study rooms</strong> — audio for live rooms is handled by our real-time voice provider (LiveKit).
          We do not record room audio.
        </li>
        <li>
          <strong>Hosting and content delivery</strong> — our hosting provider serves the website and its assets.
        </li>
        <li>
          <strong>Analytics</strong> — if you consent, we may load a privacy-focused analytics provider or Google
          Analytics to understand usage.
        </li>
      </ul>
      <p>
        These providers process information on our behalf or under their own terms. We encourage you to read their
        privacy policies. We do not sell your personal information.
      </p>

      <h2>7. Data security</h2>
      <p>
        We take reasonable technical and organisational measures to protect information against unauthorised access,
        disclosure, loss, misuse, alteration and destruction. These include access controls and row-level security rules
        that restrict which records each account can read.
      </p>
      <p>
        No internet-based service can guarantee absolute security. Keep your account credentials secure, and contact us
        immediately if you believe your account has been compromised.
      </p>

      <h2>8. Data retention</h2>
      <p>
        We keep information for as long as reasonably necessary to provide the Service, maintain your account, fulfil
        the purposes described in this policy, meet legal, accounting and security requirements, resolve disputes,
        enforce our agreements and prevent abuse.
      </p>
      <p>
        When information is no longer reasonably required, we delete it, anonymise it or securely dispose of it, subject
        to legal and operational requirements. Verification documents are deleted once a campus review is complete.
      </p>

      <h2>9. Account and data deletion</h2>
      <p>
        You may ask us to delete your account and the personal information associated with it by contacting us through
        the support channel on the website.
      </p>
      <p>
        Some information may need to be retained where the law requires it, or where it is reasonably necessary for
        legitimate security, fraud-prevention, dispute-resolution or legal purposes. Deleting your account may also
        remove the content you published, your messages, and your Compete and Live Battle history.
      </p>

      <h2>10. Your privacy rights</h2>
      <p>Depending on where you live and the law that applies to you, you may have the right to:</p>
      <ul>
        <li>Access the personal information we hold about you</li>
        <li>Ask us to correct information that is inaccurate or out of date</li>
        <li>Ask us to delete your information</li>
        <li>Ask us to restrict or object to certain processing</li>
        <li>Receive a copy of certain information in a portable form</li>
        <li>Withdraw consent where we rely on consent — for example for optional analytics</li>
        <li>Complain to a data-protection authority</li>
      </ul>
      <p>
        To exercise a right, contact us using the details in the Contact section below. We may need to verify your
        identity before acting on a request, and some rights are subject to legal exceptions.
      </p>

      <h2>11. Children and minors</h2>
      <p>
        The Service is intended for users who are legally able to use it. You must be at least 13 years old, or older
        where your jurisdiction requires a higher age for a service of this kind.
      </p>
      <p>
        If you are below the age of majority where you live, use the community features — publishing experiences,
        joining rooms, messaging other students — with the involvement of a parent or guardian. We do not knowingly
        collect personal information from children where that is prohibited by law. If you believe a child has provided
        us with personal information in violation of applicable requirements, contact us and we will review and act on
        it.
      </p>

      <h2>12. User-generated content</h2>
      <p>
        The Service lets users create and publish content, such as interview experiences, room chat, messages and
        profile text. You are responsible for what you publish, and you should think carefully before including personal
        information. We are not responsible for personal information you choose to make public.
      </p>

      <h2>13. Communications</h2>
      <p>
        We send communications needed to run your account and the Service, such as security alerts, connection requests,
        replies, important service changes and replies to your support requests. Where the law requires it, marketing
        messages will include a way to unsubscribe or manage your preferences.
      </p>

      <h2>14. Third-party links</h2>
      <p>
        The Service may link to third-party sites and services. We do not control them and are not responsible for their
        privacy practices. Read their privacy policies before providing personal information.
      </p>

      <h2>15. International data transfers</h2>
      <p>
        Your information may be processed and stored on servers located outside your state, province or country,
        depending on the infrastructure providers we use. Where applicable, we take reasonable steps to ensure that such
        processing is carried out in accordance with applicable data-protection law.
      </p>

      <h2>16. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. When we do, we will update the &ldquo;Last updated&rdquo;
        date at the top of this page. For material changes, we may give additional notice where the law requires it —
        for example by email or a prominent notice in the Service. Continuing to use the Service after an updated policy
        takes effect means you acknowledge the updated policy.
      </p>

      <h2>17. Contact us</h2>
      <p>
        If you have questions, concerns or requests about this Privacy Policy or your personal information, contact us
        through the support channel on the website. For privacy and data-protection requests, please mark your message
        clearly as a &ldquo;Privacy Request&rdquo; so it reaches the right team.
      </p>
      <p>
        <strong>ConnectToCampus</strong>
        <br />
        Website: <Link href="/">connecttocampus.com</Link>
      </p>
      <p>
        Where applicable law requires us to designate a grievance officer or data-protection contact, requests may be
        addressed to that contact through the support channel above.
      </p>

      <h2>18. Important notice</h2>
      <p>
        This Privacy Policy describes our general privacy practices and is intended to give you transparency about how
        information may be handled. The exact information collected depends on the features you use, your account
        settings and applicable law. Nothing in this policy limits any rights you may have under applicable
        data-protection or privacy law.
      </p>
    </LegalPage>
  )
}
