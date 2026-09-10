import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for ConnectToCampus — how we collect, use, and protect your information.',
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

export default function PrivacyPolicyPage() {
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
            ← Back to ConnectToCampus
          </Link>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: '0 0 8px',
            }}
          >
            Privacy Policy
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
            Last Updated: September 10, 2026
          </p>
        </div>

        {/* Introduction */}
        <p style={textStyle}>
          Welcome to <strong>ConnectToCampus</strong> (&ldquo;ConnectToCampus,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;).
        </p>
        <p style={textStyle}>
          ConnectToCampus is a platform designed to help students connect, communicate, learn, participate in activities, and access student-focused features and services.
        </p>
        <p style={textStyle}>
          This Privacy Policy explains what information we collect, how we use it, how we protect it, and what choices you have regarding your information when you use our website, applications, games, and related services (collectively, the &ldquo;Service&rdquo;).
        </p>
        <p style={textStyle}>
          By using ConnectToCampus, you acknowledge that you have read and understood this Privacy Policy.
        </p>

        {/* Section 1 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>1. Information We Collect</h2>
          <p style={textStyle}>We may collect different types of information depending on how you use ConnectToCampus.</p>

          <h3 style={subHeadingStyle}>1.1 Information You Provide</h3>
          <p style={textStyle}>When you create an account or use certain features, we may collect information such as:</p>
          <ul style={listStyle}>
            <li>Name or display name</li>
            <li>Email address</li>
            <li>Username</li>
            <li>Profile information</li>
            <li>Profile picture or avatar</li>
            <li>College, university, course, department, or academic information that you choose to provide</li>
            <li>Content you voluntarily post or submit</li>
            <li>Messages or communications you send through the Service</li>
            <li>Information you provide when contacting our support team</li>
          </ul>
          <p style={textStyle}>You are not required to provide information that is not necessary for a particular feature.</p>

          <h3 style={subHeadingStyle}>1.2 Authentication Information</h3>
          <p style={textStyle}>If you sign in using a third-party authentication provider, such as Google, we may receive information provided by that provider, such as:</p>
          <ul style={listStyle}>
            <li>Name</li>
            <li>Email address</li>
            <li>Profile picture</li>
            <li>A unique authentication identifier</li>
          </ul>
          <p style={textStyle}>We use this information to create and maintain your ConnectToCampus account. We do not receive your third-party account password.</p>

          <h3 style={subHeadingStyle}>1.3 Automatically Collected Information</h3>
          <p style={textStyle}>When you use ConnectToCampus, certain technical information may be collected automatically, including:</p>
          <ul style={listStyle}>
            <li>IP address</li>
            <li>Browser type</li>
            <li>Device type</li>
            <li>Operating system</li>
            <li>Approximate location derived from technical information</li>
            <li>Pages or features accessed</li>
            <li>Date and time of activity</li>
            <li>Referring pages</li>
            <li>Error and diagnostic information</li>
            <li>General usage and interaction information</li>
          </ul>
          <p style={textStyle}>This information may be used for security, analytics, troubleshooting, and improving the Service.</p>
        </div>

        {/* Section 2 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>2. Information Collected During Games and Competitions</h2>
          <p style={textStyle}>ConnectToCampus may provide games, quizzes, competitions, rankings, or other interactive features.</p>
          <p style={textStyle}>When you participate, we may collect information such as:</p>
          <ul style={listStyle}>
            <li>Game or room identifier</li>
            <li>Player or display name</li>
            <li>Scores</li>
            <li>Answers or game actions</li>
            <li>Ranking or leaderboard position</li>
            <li>Game duration and participation information</li>
            <li>Technical information required to operate real-time features</li>
          </ul>
          <p style={textStyle}>Some game features may allow users to participate without creating an account. If you join a game without an account, we may use a temporary identifier or display name to operate the session.</p>
        </div>

        {/* Section 3 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>3. How We Use Your Information</h2>
          <p style={textStyle}>We may use collected information to:</p>
          <ul style={listStyle}>
            <li>Provide and operate ConnectToCampus</li>
            <li>Create and manage user accounts</li>
            <li>Authenticate users</li>
            <li>Enable communication and social features</li>
            <li>Provide games, competitions, rankings, and leaderboards</li>
            <li>Personalize your experience</li>
            <li>Maintain and improve the Service</li>
            <li>Detect, prevent, and investigate fraud, abuse, cheating, and security incidents</li>
            <li>Protect users and the integrity of the platform</li>
            <li>Diagnose technical problems</li>
            <li>Respond to support requests</li>
            <li>Analyze usage and platform performance</li>
            <li>Communicate with you about important Service-related matters</li>
            <li>Comply with applicable legal obligations</li>
          </ul>
          <p style={textStyle}>We will not use your personal information for purposes materially different from those described in this Privacy Policy without appropriate notice where required by law.</p>
        </div>

        {/* Section 4 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>4. Publicly Visible Information</h2>
          <p style={textStyle}>Some information you provide may be visible to other ConnectToCampus users depending on the feature and your settings.</p>
          <p style={textStyle}>For example, information such as display name, username, profile picture, public profile information, game scores, rankings, leaderboard positions, and content you choose to publish may be visible to other users.</p>
          <p style={boldTextStyle}>Do not publish information that you do not want other users to see.</p>
        </div>

        {/* Section 5 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>5. Cookies and Similar Technologies</h2>
          <p style={textStyle}>ConnectToCampus may use cookies, local storage, session storage, and similar technologies to:</p>
          <ul style={listStyle}>
            <li>Keep users signed in</li>
            <li>Maintain sessions</li>
            <li>Remember preferences</li>
            <li>Provide security features</li>
            <li>Understand how the Service is used</li>
            <li>Improve performance and functionality</li>
          </ul>
          <p style={textStyle}>You can control cookies through your browser settings. However, disabling certain cookies or storage technologies may cause some features of ConnectToCampus to stop working correctly.</p>
        </div>

        {/* Section 6 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>6. Third-Party Services</h2>
          <p style={textStyle}>ConnectToCampus may use third-party services to provide infrastructure, authentication, analytics, hosting, databases, communication, security, or other functionality.</p>
          <p style={textStyle}>For example, authentication or database infrastructure may be provided by third-party service providers. These providers may process information on our behalf or as otherwise described in their own privacy policies.</p>
          <p style={textStyle}>We encourage users to review the privacy policies of third-party services they use to access ConnectToCampus.</p>
        </div>

        {/* Section 7 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>7. Data Security</h2>
          <p style={textStyle}>We take reasonable technical and organizational measures to protect information against unauthorized access, unauthorized disclosure, loss, misuse, alteration, and destruction.</p>
          <p style={textStyle}>However, no internet-based service can guarantee absolute security. You are responsible for keeping your account credentials secure and should immediately contact us if you believe your account has been compromised.</p>
        </div>

        {/* Section 8 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>8. Data Retention</h2>
          <p style={textStyle}>We retain information for as long as reasonably necessary to provide the Service, maintain account functionality, fulfill the purposes described in this Privacy Policy, meet legal, regulatory, accounting, or security requirements, resolve disputes, enforce our agreements, and prevent fraud or abuse.</p>
          <p style={textStyle}>When information is no longer reasonably required, we may delete, anonymize, or securely dispose of it, subject to applicable legal and operational requirements.</p>
        </div>

        {/* Section 9 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>9. Account and Data Deletion</h2>
          <p style={textStyle}>You may request deletion of your ConnectToCampus account and associated personal information by contacting us through the support/contact mechanism provided on the website.</p>
          <p style={textStyle}>Certain information may need to be retained where required by law or where reasonably necessary for legitimate security, fraud prevention, dispute resolution, or legal purposes.</p>
          <p style={textStyle}>Deletion of an account may also result in the loss of associated content, rankings, game history, or other account-related data.</p>
        </div>

        {/* Section 10 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>10. Your Privacy Rights</h2>
          <p style={textStyle}>Depending on your location and applicable law, you may have rights regarding your personal information, including the right to:</p>
          <ul style={listStyle}>
            <li>Access your personal information</li>
            <li>Request correction of inaccurate information</li>
            <li>Request deletion of your information</li>
            <li>Request restriction of certain processing</li>
            <li>Object to certain processing</li>
            <li>Request a copy of certain information</li>
            <li>Withdraw consent where processing is based on consent</li>
          </ul>
          <p style={textStyle}>To exercise applicable rights, contact us using the contact information provided below. We may need to verify your identity before processing certain requests.</p>
        </div>

        {/* Section 11 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>11. Children&apos;s Privacy</h2>
          <p style={textStyle}>ConnectToCampus is intended for users who are legally permitted to use the Service under applicable law.</p>
          <p style={textStyle}>We do not knowingly collect personal information from children where such collection is prohibited by applicable law. If you believe that a child has provided personal information to ConnectToCampus in violation of applicable requirements, please contact us so that we can review and take appropriate action.</p>
        </div>

        {/* Section 12 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>12. User-Generated Content</h2>
          <p style={textStyle}>ConnectToCampus may allow users to create, upload, publish, or share content. You should carefully consider what information you include in publicly accessible content.</p>
          <p style={textStyle}>We are not responsible for personal information that you voluntarily make publicly available through the Service.</p>
        </div>

        {/* Section 13 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>13. Communications</h2>
          <p style={textStyle}>We may send communications necessary to operate your account or provide the Service, including account-related messages, security alerts, important Service updates, changes to policies or functionality, and support responses.</p>
          <p style={textStyle}>Where legally required, marketing communications will provide appropriate options to unsubscribe or manage communication preferences.</p>
        </div>

        {/* Section 14 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>14. Third-Party Links</h2>
          <p style={textStyle}>ConnectToCampus may contain links to third-party websites, services, or applications. We do not control those third parties and are not responsible for their privacy practices.</p>
          <p style={textStyle}>We recommend reviewing the privacy policy of any third-party service before providing personal information.</p>
        </div>

        {/* Section 15 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>15. Data Transfers</h2>
          <p style={textStyle}>Your information may be processed or stored on servers located outside your state, region, or country, depending on the infrastructure and service providers used by ConnectToCampus.</p>
          <p style={textStyle}>Where applicable, we take reasonable steps to ensure that such processing is conducted in accordance with applicable privacy laws.</p>
        </div>

        {/* Section 16 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>16. Changes to This Privacy Policy</h2>
          <p style={textStyle}>We may update this Privacy Policy from time to time. When we make changes, we will update the &ldquo;Last Updated&rdquo; date at the top of this page.</p>
          <p style={textStyle}>For material changes, we may provide additional notice where required by applicable law. Your continued use of ConnectToCampus after an updated Privacy Policy becomes effective means that you acknowledge the updated policy.</p>
        </div>

        {/* Section 17 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>17. Contact Us</h2>
          <p style={textStyle}>If you have questions, concerns, or requests regarding this Privacy Policy or your personal information, please contact us through the contact/support information provided on ConnectToCampus.</p>
          <p style={boldTextStyle}>ConnectToCampus</p>
          <p style={textStyle}>Website: <Link href="/" style={{ color: 'var(--accent)', textDecoration: 'none' }}>connecttocampus.com</Link></p>
          <p style={textStyle}>Privacy inquiries: Contact the ConnectToCampus support team through the website.</p>
        </div>

        {/* Section 18 */}
        <div style={sectionStyle}>
          <h2 style={headingStyle}>18. Important Notice</h2>
          <p style={textStyle}>This Privacy Policy describes ConnectToCampus&apos;s general privacy practices and is intended to provide transparency about how information may be handled.</p>
          <p style={textStyle}>The exact information collected and processed may depend on the features you use, your account configuration, your location, and applicable law.</p>
          <p style={textStyle}>Nothing in this Privacy Policy limits any rights that you may have under applicable data-protection or privacy laws.</p>
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
