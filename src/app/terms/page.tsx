import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for ConnectToCampus — rules and guidelines for using the platform.',
}

const sectionStyle = {
  marginBottom: 32,
}

const headingStyle = {
  fontSize: 20,
  fontWeight: 700 as const,
  color: 'var(--text-primary)',
  margin: '0 0 12px',
}

const subHeadingStyle = {
  fontSize: 16,
  fontWeight: 600 as const,
  color: 'var(--text-primary)',
  margin: '20px 0 8px',
}

const textStyle = {
  fontSize: 14,
  lineHeight: 1.7,
  color: 'var(--text-secondary)',
  margin: '0 0 12px',
}

const listStyle = {
  fontSize: 14,
  lineHeight: 1.7,
  color: 'var(--text-secondary)',
  margin: '0 0 12px',
  paddingLeft: 20,
}

const boldTextStyle = {
  ...textStyle,
  color: 'var(--text-primary)',
  fontWeight: 600 as const,
}

export default function TermsOfServicePage() {
  return (
    <div
      data-accent="gold"
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--text-primary)',
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '40px 20px 80px',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <Link
            href="/"
            style={{
              fontSize: 13,
              color: 'var(--accent)',
              textDecoration: 'none',
              fontWeight: 600,
              display: 'inline-block',
              marginBottom: 16,
            }}
          >
            ← Back to Campus Connect
          </Link>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: '0 0 8px',
            }}
          >
            Terms of Service
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
            Last Updated: September 10, 2026
          </p>
        </div>

        {/* Introduction */}
        <p style={textStyle}>
          Welcome to <strong>Campus Connect</strong> (&ldquo;Campus Connect,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;).
        </p>
        <p style={textStyle}>
          Campus Connect is a platform designed to help students connect, communicate, learn, participate in activities, and access student-focused features and services.
        </p>
        <p style={textStyle}>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the Campus Connect website, applications, games, and related services (collectively, the &ldquo;Service&rdquo;). By accessing or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.
        </p>

        {/* Section 1 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>1. Eligibility</h2>
          <p style={textStyle}>You must meet the following requirements to use Campus Connect:</p>
          <ul style={listStyle}>
            <li>You must be at least 13 years of age (or the minimum age required in your jurisdiction).</li>
            <li>You must have the legal capacity to enter into a binding agreement.</li>
            <li>You must not be barred from using the Service under applicable law.</li>
            <li>If you are using the Service on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.</li>
          </ul>
          <p style={textStyle}>By using Campus Connect, you represent and warrant that you meet all eligibility requirements.</p>
        </div>

        {/* Section 2 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>2. Account Registration</h2>
          <p style={textStyle}>To access certain features, you may need to create an account. When registering:</p>
          <ul style={listStyle}>
            <li>You must provide accurate, current, and complete information.</li>
            <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
            <li>You are responsible for all activities that occur under your account.</li>
            <li>You must notify us immediately if you become aware of any unauthorized use of your account.</li>
            <li>You must not share your account credentials with others or create multiple accounts.</li>
            <li>One person or entity may not maintain more than one account.</li>
          </ul>
          <p style={textStyle}>We reserve the right to suspend or terminate accounts that violate these Terms or that we reasonably believe are being used in an unauthorized manner.</p>
        </div>

        {/* Section 3 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>3. Acceptable Use</h2>
          <p style={textStyle}>When using Campus Connect, you agree to:</p>
          <ul style={listStyle}>
            <li>Use the Service only for lawful purposes and in accordance with these Terms.</li>
            <li>Respect the rights and dignity of other users.</li>
            <li>Provide accurate information when participating in games, competitions, and other features.</li>
            <li>Comply with all applicable laws and regulations.</li>
          </ul>
          <p style={textStyle}>You agree <strong>not</strong> to:</p>
          <ul style={listStyle}>
            <li>Use the Service for any unlawful, fraudulent, or malicious purpose.</li>
            <li>Impersonate any person or entity, or misrepresent your affiliation with any person or entity.</li>
            <li>Harass, bully, threaten, intimidate, or harm other users.</li>
            <li>Post, upload, or share content that is defamatory, obscene, abusive, invasive of privacy, or otherwise objectionable.</li>
            <li>Post spam, solicitations, advertisements, or unsolicited commercial content.</li>
            <li>Upload or distribute viruses, malware, or other harmful code.</li>
            <li>Attempt to gain unauthorized access to other users&rsquo; accounts, the Service, or any related systems or networks.</li>
            <li>Use automated tools (bots, scrapers, crawlers) to access or interact with the Service, except for standard search engine indexing.</li>
            <li>Interfere with, disrupt, or overload the Service or its infrastructure.</li>
            <li>Circumvent, disable, or interfere with security features of the Service.</li>
            <li>Collect, harvest, or store personal information of other users without their consent.</li>
            <li>Cheat, exploit bugs, or use unauthorized third-party tools in games, competitions, or quizzes.</li>
            <li>Use the Service to transmit unsolicited communications (spam).</li>
            <li>Violate any applicable law, regulation, or third-party rights.</li>
          </ul>
        </div>

        {/* Section 4 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>4. User Content</h2>
          <p style={textStyle}>Campus Connect may allow you to create, post, upload, share, or otherwise make available content (&ldquo;User Content&rdquo;), including but not limited to text, posts, comments, messages, images, files, notes, and other materials.</p>

          <h3 style={subHeadingStyle}>4.1 Ownership</h3>
          <p style={textStyle}>You retain ownership of your User Content. Posting or sharing content on Campus Connect does not transfer ownership to us.</p>

          <h3 style={subHeadingStyle}>4.2 License Grant</h3>
          <p style={textStyle}>By posting User Content on Campus Connect, you grant us a non-exclusive, worldwide, royalty-free, sublicensable, and transferable license to use, reproduce, modify, adapt, publish, translate, create derivative works from, distribute, and display such content in connection with operating and providing the Service.</p>
          <p style={textStyle}>This license is limited to the purpose of operating, improving, and promoting the Service and ends when you delete your content or your account, except where content has been shared with others who have not deleted it, or where cached or archived copies persist.</p>

          <h3 style={subHeadingStyle}>4.3 Content Responsibility</h3>
          <p style={textStyle}>You are solely responsible for your User Content. We do not endorse any User Content and are not responsible or liable for any User Content posted by you or other users.</p>

          <h3 style={subHeadingStyle}>4.4 Content Removal</h3>
          <p style={textStyle}>We reserve the right, but are not obligated, to review, monitor, edit, or remove User Content at our sole discretion, for any reason or no reason, without notice.</p>
        </div>

        {/* Section 5 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>5. Games, Competitions, and Interactive Features</h2>
          <p style={textStyle}>Campus Connect may offer games, quizzes, competitions, rankings, leaderboards, and other interactive features.</p>
          <ul style={listStyle}>
            <li>Some features may allow participation without creating an account, using a temporary identifier or display name.</li>
            <li>You agree to participate fairly and not to cheat, use bots, exploit vulnerabilities, or use any unauthorized tools or methods to gain an unfair advantage.</li>
            <li>We may track scores, rankings, game history, and other participation data to operate these features.</li>
            <li>We reserve the right to modify, suspend, or discontinue any game or competition feature at any time without prior notice.</li>
            <li>Rankings and scores are provided for entertainment and informational purposes and may not reflect actual skill or ability.</li>
          </ul>
        </div>

        {/* Section 6 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>6. Intellectual Property</h2>
          <p style={textStyle}>The Service, including its design, code, features, graphics, logos, trademarks, and documentation, is owned by or licensed to Campus Connect and is protected by intellectual property laws.</p>
          <p style={textStyle}>You may not copy, modify, distribute, sell, lease, reverse-engineer, or create derivative works based on the Service or any part thereof without our express written permission.</p>
          <p style={textStyle}>Any feedback, suggestions, or ideas you provide about the Service may be used by us without restriction or compensation to you.</p>
        </div>

        {/* Section 7 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>7. Third-Party Services and Links</h2>
          <p style={textStyle}>Campus Connect may integrate with or contain links to third-party services, websites, or applications. These third parties are not under our control, and we are not responsible for their content, products, services, privacy practices, or terms.</p>
          <p style={textStyle}>Your interactions with third-party services are governed by their respective terms and privacy policies. We encourage you to review them before engaging with such services.</p>
        </div>

        {/* Section 8 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>8. Privacy</h2>
          <p style={textStyle}>Your use of the Service is also governed by our{' '}
            <Link href="/privacy" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
              Privacy Policy
            </Link>, which describes how we collect, use, and share information about you. By using the Service, you consent to the collection and use of information as described in the Privacy Policy.</p>
        </div>

        {/* Section 9 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>9. Disclaimers</h2>
          <p style={textStyle}>THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY.</p>
          <p style={textStyle}>We disclaim all warranties, including but not limited to implied warranties of merchantability, fitness for a particular purpose, title, and non-infringement.</p>
          <p style={textStyle}>Without limiting the foregoing, we do not warrant that:</p>
          <ul style={listStyle}>
            <li>The Service will be uninterrupted, timely, secure, or error-free.</li>
            <li>The results obtained from the Service will be accurate or reliable.</li>
            <li>The quality of any content, products, services, or information obtained through the Service will meet your expectations.</li>
            <li>Any errors in the Service will be corrected.</li>
          </ul>
          <p style={textStyle}>The Service is intended for informational and educational purposes. It should not be used as a substitute for professional academic, career, or legal advice.</p>
        </div>

        {/* Section 10 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>10. Limitation of Liability</h2>
          <p style={textStyle}>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL CAMPUS CONNECT, ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:</p>
          <ul style={listStyle}>
            <li>Loss of profits, data, use, goodwill, or other intangible losses.</li>
            <li>Damages resulting from your access to or use of (or inability to access or use) the Service.</li>
            <li>Damages resulting from any content obtained from the Service.</li>
            <li>Damages resulting from unauthorized access to or alteration of your content or transmissions.</li>
          </ul>
          <p style={textStyle}>Our total liability to you for all claims arising out of or relating to the use of or inability to use the Service shall not exceed the amount paid by you, if any, to us for the Service during the twelve (12) months preceding the claim.</p>
        </div>

        {/* Section 11 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>11. Indemnification</h2>
          <p style={textStyle}>You agree to indemnify, defend, and hold harmless Campus Connect and its affiliates, officers, directors, employees, agents, and licensors from and against any claims, liabilities, damages, losses, costs, and expenses (including reasonable attorneys&rsquo; fees) arising out of or relating to:</p>
          <ul style={listStyle}>
            <li>Your use of the Service.</li>
            <li>Your violation of these Terms.</li>
            <li>Your User Content.</li>
            <li>Your violation of any third-party rights.</li>
          </ul>
        </div>

        {/* Section 12 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>12. Account Suspension and Termination</h2>
          <p style={textStyle}>We may suspend or terminate your access to the Service at any time, with or without cause, with or without notice, including but not limited to if we reasonably believe you have:</p>
          <ul style={listStyle}>
            <li>Violated these Terms.</li>
            <li>Engaged in conduct that we consider harmful to other users, the Service, or our business.</li>
            <li>Created multiple accounts.</li>
            <li>Used the Service in a fraudulent or unauthorized manner.</li>
          </ul>
          <p style={textStyle}>Upon termination, your right to use the Service ceases immediately. We may delete your account and associated data. We shall not be liable to you or any third party for any termination of your access to the Service.</p>
        </div>

        {/* Section 13 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>13. Dispute Resolution</h2>
          <p style={textStyle}>Any disputes arising out of or relating to these Terms or the Service shall first be resolved through informal negotiation. If the dispute cannot be resolved informally, you agree that it shall be resolved through binding arbitration or in a court of competent jurisdiction, as determined by applicable law.</p>
          <p style={textStyle}>You agree that any dispute resolution proceedings will be conducted on an individual basis and not as a class action, consolidated action, or representative action.</p>
        </div>

        {/* Section 14 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>14. Modifications to Terms</h2>
          <p style={textStyle}>We may update these Terms from time to time. When we make changes, we will update the &ldquo;Last Updated&rdquo; date at the top of this page.</p>
          <p style={textStyle}>For material changes, we may provide additional notice, such as posting a prominent announcement on the Service or sending an email to registered users.</p>
          <p style={textStyle}>Your continued use of the Service after the effective date of any changes constitutes your acceptance of the updated Terms. If you do not agree, you must stop using the Service.</p>
        </div>

        {/* Section 15 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>15. Severability</h2>
          <p style={textStyle}>If any provision of these Terms is found to be invalid, illegal, or unenforceable by a court of competent jurisdiction, the remaining provisions shall continue in full force and effect. The invalid or unenforceable provision shall be modified to the minimum extent necessary to make it valid and enforceable while preserving its original intent.</p>
        </div>

        {/* Section 16 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>16. Waiver</h2>
          <p style={textStyle}>Our failure to enforce any right or provision of these Terms shall not constitute a waiver of such right or provision. Any waiver of any provision of these Terms will be effective only if in writing and signed by us.</p>
        </div>

        {/* Section 17 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>17. Governing Law</h2>
          <p style={textStyle}>These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law principles.</p>
        </div>

        {/* Section 18 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>18. Entire Agreement</h2>
          <p style={textStyle}>These Terms, together with our{' '}
            <Link href="/privacy" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
              Privacy Policy
            </Link>, constitute the entire agreement between you and Campus Connect regarding the Service and supersede all prior agreements and understandings.</p>
        </div>

        {/* Section 19 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>19. Contact Us</h2>
          <p style={textStyle}>If you have questions, concerns, or requests regarding these Terms, please contact us through the contact/support information provided on Campus Connect.</p>
          <p style={boldTextStyle}>Campus Connect</p>
          <p style={textStyle}>Website: <Link href="/" style={{ color: 'var(--accent)', textDecoration: 'none' }}>connecttocampus.com</Link></p>
          <p style={textStyle}>Support: Contact the Campus Connect support team through the website.</p>
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: 24,
            marginTop: 40,
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            <Link href="/" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
              ConnectToCampus
            </Link>
            {' '}· An independent student platform
          </p>
        </div>
      </div>
    </div>
  )
}
