import Link from 'next/link'
import LegalPage from '@/components/legal/LegalPage'

/**
 * Privacy Policy — rewritten for the V4 campus-hiring product.
 *
 * The previous version described the retired social/community platform. This
 * version covers what the Service actually does now: student profiles and
 * verified skill signals, assessments, job applications, and the information
 * companies submit when they ask us for a candidate batch.
 *
 * Metadata (title / description / canonical) lives in ./layout.tsx.
 */

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="October 13, 2026"
      lede={
        <>
          ConnectToCampus connects Computer Science students with companies that are hiring. This policy explains what
          we collect from students and from companies, how we use it, and the choices you have.
        </>
      }
    >
      <p>
        This Privacy Policy applies to <strong>ConnectToCampus</strong> (&ldquo;ConnectToCampus&rdquo;,
        &ldquo;we&rdquo;, &ldquo;our&rdquo; or &ldquo;us&rdquo;) and to the website, applications and services we
        operate (together, the &ldquo;Service&rdquo;). It applies to everyone who uses the Service — students and job
        seekers, and the companies and recruiters who engage with us.
      </p>
      <p>
        By using the Service, you acknowledge that you have read and understood this Privacy Policy. If you do not agree
        with it, please do not use the Service.
      </p>

      <h2>1. Information we collect</h2>

      <h3>1.1 Account and profile information (students)</h3>
      <p>When you create an account or complete your profile, we collect information such as:</p>
      <ul>
        <li>Your name, email address and username</li>
        <li>Your profile picture or avatar</li>
        <li>
          Academic and campus information you choose to provide — for example your college or campus, course or degree,
          department, graduation year and location
        </li>
        <li>Skills, bio, links and any other profile fields you fill in</li>
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

      <h3>1.3 Skills, assessments and connected developer profiles</h3>
      <p>
        To help companies evaluate candidates on evidence rather than on résumés alone, we collect and display
        skill-related information, including:
      </p>
      <ul>
        <li>Your results and scores in coding assessments and contests run on the Service</li>
        <li>
          Developer-profile handles and profile URLs you choose to connect (for example GitHub, LeetCode or Codeforces)
        </li>
        <li>
          Public statistics and activity we derive from those profiles — for example repository counts, contribution
          activity, or problems solved
        </li>
        <li>Any verification status attached to a connected profile</li>
      </ul>
      <div className="legal-note">
        <p>
          <strong>Please note:</strong> connected developer profiles are public by nature. When you link one, we may
          read and display publicly available information from it. Only connect accounts you are comfortable having
          shown to companies. You can disconnect a profile at any time, and it will stop updating, though previously
          shared copies may persist as described in Section 10.
        </p>
      </div>

      <h3>1.4 Applications and job activity</h3>
      <p>When you use the jobs and applications features, we collect:</p>
      <ul>
        <li>Job postings you view, save or follow</li>
        <li>Applications you submit, including your application status and any notes you keep for yourself</li>
        <li>
          Any document or link you attach to an application, such as a résumé file or URL, and any cover note you write
        </li>
        <li>Interview experiences you choose to publish</li>
      </ul>

      <h3>1.5 Company and recruiter information</h3>
      <p>
        If you contact us on behalf of a company, or if you post roles on the Service, we collect the information you
        give us — for example your company name, your name, your work email address, the role you are hiring for, the
        number of openings, and any notes you add. We also collect the content of job postings you publish, such as the
        role title, description, location, compensation information and required skills.
      </p>
      <p>
        Where a recruiter account is created for a company, we associate that account with the company and the role it
        is hiring for.
      </p>

      <h3>1.6 Shortlists we prepare for companies</h3>
      <p>
        When a company asks us for a candidate batch, we prepare a shortlist from student profiles and share it with
        that company through a private link. See Section 5 for what that means for students and for companies.
      </p>

      <h3>1.7 Information collected automatically</h3>
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
        <li>Build and display student profiles, including verified skill signals</li>
        <li>Run assessments and contests and record their results</li>
        <li>Match students with roles and prepare candidate shortlists for companies</li>
        <li>Operate the jobs, applications and company features</li>
        <li>Communicate with you about your account, your applications and the Service</li>
        <li>Detect, prevent and investigate fraud, cheating, abuse and security incidents</li>
        <li>Diagnose technical problems and respond to support requests</li>
        <li>Measure and improve how the Service performs, where you have consented to analytics</li>
        <li>Comply with applicable legal obligations and enforce our agreements</li>
      </ul>
      <p>
        We will not use your personal information for purposes materially different from those described here without
        giving you notice where the law requires it.
      </p>

      <h2>3. Assessment results and verified signals</h2>
      <p>
        Assessment and contest results on ConnectToCampus are a professional signal, not a game score. They are stored
        on your profile, may be shown to companies that are hiring through the Service, and are used to decide who
        appears in a candidate shortlist.
      </p>
      <div className="legal-note">
        <p>
          <strong>This is an important change from earlier versions of this policy.</strong> Our assessment and
          leaderboard results are used to evaluate candidates for real hiring, and should not be treated as
          entertainment. If you do not want a result to form part of your professional profile, do not take the
          assessment, or contact us to remove it where we are able to do so.
        </p>
      </div>

      <h2>4. How we use information to match candidates and roles</h2>
      <p>
        When a company asks us for candidates, we use profile information, assessment results, connected-profile signals
        and the role requirements to select students who may be a fit, and we prepare a shortlist. This involves
        automated comparison of profile data against the role. It does not make an employment decision — the company
        interviews and decides — but it determines which profiles the company is shown.
      </p>

      <h2>5. Candidate shortlists and company access</h2>
      <p>
        When we send a company a shortlist, the company receives a <strong>private, unlisted link</strong> to a page
        showing the selected candidates and their professional information — typically names, campuses, skills,
        assessment results and connected-profile signals.
      </p>
      <ul>
        <li>
          Companies may use that information <strong>only</strong> to evaluate candidates for the role they are hiring
          for. They may not resell it, publish it, or use it for marketing.
        </li>
        <li>
          Shortlist links are confidential. We limit how long a link stays active and may deactivate a link at any time.
        </li>
        <li>
          We cannot control what a company does with information after it has received it. If you believe a company has
          misused your information, tell us and we will investigate and may stop working with them.
        </li>
      </ul>

      <h2>6. Publicly visible information</h2>
      <p>
        Some information may be visible to other users, or to companies, depending on the feature and your settings —
        for example your display name, username, avatar, public profile details, campus and department, skills,
        assessment results, leaderboard positions, connected-profile signals, and content you publish such as job
        postings or interview experiences.
      </p>
      <p>
        <strong>Do not add information to your profile that you do not want companies or other users to see.</strong>{' '}
        Where we offer a private-profile setting, use it if you want to limit visibility — note that private profiles
        may be excluded from candidate shortlists.
      </p>

      <h2>7. Cookies and similar technologies</h2>
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

      <h2>8. Third-party services</h2>
      <p>
        We rely on third-party providers for infrastructure and functionality. These currently include providers of
        authentication, database and file storage, hosting and content delivery, and optional analytics. For example:
      </p>
      <ul>
        <li>
          <strong>Authentication and data storage</strong> — an authentication and database provider stores your
          account, profile and application data on our behalf.
        </li>
        <li>
          <strong>Sign-in</strong> — if you choose Google sign-in, Google processes that authentication.
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

      <h2>9. Data security</h2>
      <p>
        We take reasonable technical and organisational measures to protect information against unauthorised access,
        disclosure, loss, misuse, alteration and destruction. These include access controls and row-level security rules
        that restrict which records each account can read.
      </p>
      <p>
        No internet-based service can guarantee absolute security. Keep your account credentials secure, and contact us
        immediately if you believe your account has been compromised.
      </p>

      <h2>10. Data retention</h2>
      <p>
        We keep information for as long as reasonably necessary to provide the Service, maintain your account, fulfil
        the purposes described in this policy, meet legal, accounting and security requirements, resolve disputes,
        enforce our agreements and prevent fraud or abuse.
      </p>
      <p>
        When information is no longer reasonably required, we delete it, anonymise it or securely dispose of it, subject
        to legal and operational requirements. Information already shared with a company through a shortlist is subject
        to Section 5.
      </p>

      <h2>11. Account and data deletion</h2>
      <p>
        You may ask us to delete your account and the personal information associated with it by contacting us through
        the support channel on the website.
      </p>
      <p>
        Some information may need to be retained where the law requires it, or where it is reasonably necessary for
        legitimate security, fraud-prevention, dispute-resolution or legal purposes. Deleting your account may also
        remove content, applications, assessment history and other account-related data, and may remove you from
        shortlists that have not yet been delivered.
      </p>

      <h2>12. Your privacy rights</h2>
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
        To exercise a right, contact us using the details in Section 19. We may need to verify your identity before
        acting on a request, and some rights are subject to legal exceptions.
      </p>

      <h2>13. Children and minors</h2>
      <p>
        The Service is intended for users who are legally able to use it. You must be at least 13 years old, or older
        where your jurisdiction requires a higher age for a service of this kind.
      </p>
      <p>
        Because the Service is used for hiring, if you are below the age of majority where you live, you should only
        apply for roles, or take part in hiring-related features, with the involvement of a parent or guardian, and you
        must be legally able to work in the relevant location. We do not knowingly collect personal information from
        children where that is prohibited by law. If you believe a child has provided us with personal information in
        violation of applicable requirements, contact us and we will review and act on it.
      </p>

      <h2>14. User-generated content</h2>
      <p>
        The Service lets users create and publish content, such as job postings, interview experiences and profile text.
        You are responsible for what you publish, and you should think carefully before including personal information.
        We are not responsible for personal information you choose to make public.
      </p>

      <h2>15. Communications</h2>
      <p>
        We send communications needed to run your account and the Service, such as security alerts, application updates,
        shortlist notifications, important service changes and replies to your support requests. Where the law requires
        it, marketing messages will include a way to unsubscribe or manage your preferences.
      </p>

      <h2>16. Third-party links</h2>
      <p>
        The Service may link to third-party sites and services. We do not control them and are not responsible for their
        privacy practices. Read their privacy policies before providing personal information.
      </p>

      <h2>17. International data transfers</h2>
      <p>
        Your information may be processed and stored on servers located outside your state, province or country,
        depending on the infrastructure providers we use. Where applicable, we take reasonable steps to ensure that such
        processing is carried out in accordance with applicable data-protection law.
      </p>

      <h2>18. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. When we do, we will update the &ldquo;Last updated&rdquo;
        date at the top of this page. For material changes, we may give additional notice where the law requires it —
        for example by email or a prominent notice in the Service. Continuing to use the Service after an updated policy
        takes effect means you acknowledge the updated policy.
      </p>

      <h2>19. Contact us</h2>
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

      <h2>20. Important notice</h2>
      <p>
        This Privacy Policy describes our general privacy practices and is intended to give you transparency about how
        information may be handled. The exact information collected depends on the features you use, your account
        settings and applicable law. Nothing in this policy limits any rights you may have under applicable
        data-protection or privacy law.
      </p>
    </LegalPage>
  )
}
