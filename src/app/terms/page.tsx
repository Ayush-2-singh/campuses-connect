import Link from 'next/link'
import LegalPage from '@/components/legal/LegalPage'

/**
 * Terms & Conditions — rewritten for the V4 campus-hiring product.
 *
 * Covers both sides of the marketplace: students (profiles, assessments,
 * applications) and companies (shortlists, candidate-data obligations, fees).
 *
 * Fixes a live contradiction: the old Section 5 said assessment results were
 * "for entertainment purposes and may not reflect actual skill", while the
 * product now uses those results as the verified hiring signal shown to
 * companies. Section 8 here says the opposite, and matches the product.
 *
 * Metadata (title / description / canonical) lives in ./layout.tsx.
 */

export default function TermsOfServicePage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      updated="October 13, 2026"
      lede={
        <>
          These Terms govern your use of ConnectToCampus. They apply to students who build a profile and apply for
          roles, and to companies and recruiters who hire through the Service.
        </>
      }
    >
      <p>
        These Terms &amp; Conditions (&ldquo;Terms&rdquo;) are an agreement between you and{' '}
        <strong>ConnectToCampus</strong> (&ldquo;ConnectToCampus&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo; or
        &ldquo;us&rdquo;) and govern your access to and use of the ConnectToCampus website, applications and services
        (together, the &ldquo;Service&rdquo;).
      </p>
      <p>
        By accessing or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the
        Service.
      </p>

      <h2>1. Who the Service is for</h2>
      <p>ConnectToCampus connects Computer Science students with companies that are hiring. It has two sides:</p>
      <ul>
        <li>
          <strong>Students</strong> — build a profile, connect developer accounts, take assessments, browse roles and
          apply.
        </li>
        <li>
          <strong>Companies and recruiters</strong> — tell us the roles you are hiring for and receive shortlists of
          pre-screened candidates.
        </li>
      </ul>

      <h2>2. Eligibility</h2>
      <ul>
        <li>
          You must be at least 13 years old, or older where your jurisdiction requires a higher age for a service of
          this kind.
        </li>
        <li>You must have the legal capacity to enter into a binding agreement.</li>
        <li>You must not be barred from using the Service under applicable law.</li>
        <li>
          If you use the Service on behalf of a company or other organisation, you represent that you are authorised to
          bind that organisation to these Terms, and &ldquo;you&rdquo; includes that organisation.
        </li>
      </ul>
      <p>By using the Service, you represent and warrant that you meet these requirements.</p>

      <h2>3. Accounts</h2>
      <ul>
        <li>You must provide accurate, current and complete information, and keep it up to date.</li>
        <li>You are responsible for keeping your credentials confidential and for all activity under your account.</li>
        <li>Tell us immediately if you become aware of unauthorised use of your account.</li>
        <li>
          Do not share your credentials or create multiple accounts. One person or organisation may not maintain more
          than one account, except where we authorise additional accounts in writing.
        </li>
      </ul>
      <p>
        We may suspend or terminate accounts that breach these Terms or that we reasonably believe are being used in an
        unauthorised way.
      </p>

      <h2>4. Student terms</h2>

      <h3>4.1 Your profile must be truthful</h3>
      <p>
        Your profile, skills, academic details, connected developer accounts and any documents you attach must be
        accurate and must genuinely belong to you. Impersonating another person, misstating your qualifications, or
        connecting a developer account that is not yours is a serious breach of these Terms and may result in immediate
        termination.
      </p>

      <h3>4.2 Assessments and contests</h3>
      <p>
        Assessments and contests must be taken honestly and on your own. You must not use bots, automation, unauthorised
        tools, leaked solutions, or the help of another person to obtain a result that is not genuinely yours, and you
        must not exploit bugs or interfere with other participants. We may review suspicious results, invalidate them,
        and remove you from the Service.
      </p>

      <h3>4.3 Applications and documents</h3>
      <p>
        You are responsible for the applications you submit and for any document or link you attach. Only apply to roles
        you genuinely wish to be considered for, and do not upload content you do not have the right to share.
      </p>

      <h2>5. Company and recruiter terms</h2>

      <h3>5.1 Candidate information you receive</h3>
      <p>
        When we send you a candidate shortlist, we grant you a limited, non-exclusive, non-transferable right to use
        that information <strong>solely to evaluate those candidates for the role you engaged us for</strong>. You must
        not:
      </p>
      <ul>
        <li>Resell, publish, share, sublicense or redistribute the shortlist or candidate data</li>
        <li>Use candidate data for marketing, profiling unrelated to your hiring need, or any other purpose</li>
        <li>
          Use candidate data to build or enrich a database, or to train automated systems, other than for your own
          hiring decision
        </li>
        <li>
          Retain candidate data longer than is reasonably necessary for your hiring decision, or longer than applicable
          law requires
        </li>
      </ul>
      <p>
        Shortlist links are confidential and intended for the people at your organisation who are involved in the hiring
        decision. Keep them secure.
      </p>

      <h3>5.2 Your obligations as an employer</h3>
      <p>You agree that you will:</p>
      <ul>
        <li>
          Comply with all employment, anti-discrimination, data-protection and equal-opportunity laws that apply to you
          and to your hiring
        </li>
        <li>Not discriminate on any basis prohibited by applicable law</li>
        <li>Not ask candidates for money, fees, deposits or payment of any kind in connection with a role</li>
        <li>
          Describe roles honestly, including location, nature of the work, compensation information and any conditions
          you know of
        </li>
        <li>
          Handle candidate personal information securely and in accordance with the law and our{' '}
          <Link href="/privacy">Privacy Policy</Link>
        </li>
      </ul>
      <p>
        We may remove a role, decline to work with you, or end your access to the Service if we reasonably believe that
        you have misused candidate information, misrepresented a role, or acted unlawfully or unfairly.
      </p>

      <h2>6. Shortlists, the free first batch, and no guarantee of results</h2>
      <p>
        We may offer a free first batch of candidates as an introductory offer. Offers may change, and are subject to
        the eligibility criteria we communicate to you at the time.
      </p>
      <div className="legal-note">
        <p>
          <strong>We do not guarantee any outcome.</strong> We provide candidate information and screening signals. We
          do not guarantee that you will receive a particular number of qualified candidates, that a candidate will
          accept an offer, that a hire will be successful, or that a student will receive an interview or a job. Hiring
          decisions are made by employers, and employment relationships (if any) are between the employer and the
          candidate — not with ConnectToCampus.
        </p>
      </div>

      <h2>7. Fees and payment</h2>
      <p>
        The Service is free for students. We do not charge students to create a profile, take an assessment or apply for
        a role. If anyone asks you for payment in connection with a role on the Service, do not pay it and tell us
        immediately.
      </p>
      <p>
        Fees payable by a company are those we agree with you in writing — for example in an order form, a proposal or
        an invoice. Unless we agree otherwise in writing:
      </p>
      <ul>
        <li>
          Any fee that depends on a hire becomes payable only when a hire is made, as set out in the written agreement
        </li>
        <li>Fees are exclusive of applicable taxes unless stated otherwise</li>
        <li>Invoices are payable within the period stated on the invoice</li>
        <li>We may suspend access for unpaid invoices</li>
      </ul>
      <p>
        Cancellations and refunds are governed by our <Link href="/refund">Refund &amp; Cancellation Policy</Link> and
        by any written agreement between us.
      </p>

      <h2>8. Assessments, results and how they are used</h2>
      <p>
        Results from assessments and contests on the Service are a <strong>professional, verified signal</strong>. They
        may be displayed on a student&rsquo;s profile, shared with companies that are hiring through the Service, and
        used to select candidates for a shortlist.
      </p>
      <p>
        This is an important change from earlier versions of these Terms, which described such results as being for
        entertainment only. Because results now feed real hiring, you should treat them as part of your professional
        record.
      </p>
      <p>
        That said, results are <strong>not</strong> a guarantee of ability or of any outcome. They are one input among
        several, they may contain errors, and employers make their own decisions. We may correct, invalidate or remove a
        result where we reasonably believe it is inaccurate or was obtained unfairly.
      </p>

      <h2>9. Acceptable use</h2>
      <p>You agree to use the Service lawfully and in accordance with these Terms. You must not:</p>
      <ul>
        <li>Use the Service for any unlawful, fraudulent or malicious purpose</li>
        <li>Impersonate any person or organisation, or misrepresent your affiliation with one</li>
        <li>Harass, threaten, stalk, defame or harm other users</li>
        <li>
          Publish content that is unlawful, defamatory, obscene, deceptive, or invasive of another person&rsquo;s
          privacy
        </li>
        <li>Post spam, chain messages, or unsolicited commercial content</li>
        <li>Upload malware or any harmful code</li>
        <li>Attempt to gain unauthorised access to accounts, systems or networks</li>
        <li>
          Scrape, harvest or bulk-extract data, or use automated tools to access the Service — except for standard
          search-engine indexing, or where we have given you written permission
        </li>
        <li>Interfere with, disrupt or overload the Service or its infrastructure</li>
        <li>Circumvent or disable security or access-control features</li>
        <li>Collect or store other users&rsquo; personal information without their consent</li>
        <li>Cheat in assessments or contests, or exploit bugs for unfair advantage</li>
        <li>Violate any applicable law or the rights of any third party</li>
      </ul>

      <h2>10. User content</h2>

      <h3>10.1 Ownership</h3>
      <p>
        You retain ownership of content you create, post or upload (&ldquo;User Content&rdquo;) — such as your profile
        text, job postings, interview experiences, résumés and messages. These Terms do not transfer ownership to us.
      </p>

      <h3>10.2 Licence to us</h3>
      <p>
        By posting User Content, you grant us a non-exclusive, worldwide, royalty-free, sublicensable and transferable
        licence to use, reproduce, adapt, publish, translate, distribute and display that content as needed to operate,
        improve and promote the Service. This licence ends when you delete the content or your account, except where the
        content has been shared with others who have not deleted it, or where copies persist in caches or backups, or
        where we must retain it by law.
      </p>

      <h3>10.3 Your responsibility</h3>
      <p>
        You are solely responsible for your User Content. We do not endorse it and are not responsible or liable for it.
        We are not obliged to monitor content, but we may review, edit or remove it at our discretion.
      </p>

      <h2>11. Intellectual property</h2>
      <p>
        The Service — including its design, code, features, graphics, logos, trademarks and documentation — is owned by
        or licensed to ConnectToCampus and protected by intellectual-property law. You may not copy, modify, distribute,
        sell, lease, reverse-engineer or create derivative works from the Service without our written permission.
      </p>
      <p>
        Any feedback or suggestions you give us about the Service may be used by us without restriction or compensation
        to you.
      </p>

      <h2>12. Privacy</h2>
      <p>
        Your use of the Service is also governed by our <Link href="/privacy">Privacy Policy</Link>, which describes how
        we collect, use and share information, and by our <Link href="/cookies">Cookie Policy</Link>. By using the
        Service you acknowledge those documents.
      </p>

      <h2>13. Third-party services and links</h2>
      <p>
        The Service may integrate with, or link to, third-party services — for example a sign-in provider or a connected
        developer profile. These are not under our control and we are not responsible for their content, products,
        services, privacy practices or terms. Your interactions with them are governed by their terms and policies.
      </p>

      <h2>14. Disclaimers</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
        AVAILABLE&rdquo;, WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED OR STATUTORY, INCLUDING IMPLIED
        WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT.
      </p>
      <p>Without limiting the above, we do not warrant that:</p>
      <ul>
        <li>The Service will be uninterrupted, timely, secure or error-free</li>
        <li>Assessment results, profile signals, rankings or other content will be accurate, complete or reliable</li>
        <li>The Service will result in an interview, an offer, a hire or any other outcome</li>
        <li>Errors will be corrected</li>
      </ul>
      <p>
        The Service is informational and procedural. It is not a recruitment agency, it does not act as an employer or
        an agent for either side, and nothing on the Service is professional careers, legal, immigration, academic or
        financial advice. You should obtain your own advice where you need it.
      </p>

      <h2>15. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CONNECTTOCAMPUS AND ITS AFFILIATES, OFFICERS, DIRECTORS,
        EMPLOYEES, AGENTS AND LICENSORS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
        EXEMPLARY OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, OPPORTUNITY, DATA, GOODWILL OR OTHER
        INTANGIBLE LOSSES, ARISING OUT OF OR RELATING TO THE SERVICE.
      </p>
      <p>
        This includes, without limitation, damages arising from: your access to or use of (or inability to use) the
        Service; any content obtained through the Service; a hiring decision made by an employer; a candidate&rsquo;s
        conduct or the accuracy of information a candidate or company provides; and unauthorised access to or alteration
        of your content or transmissions.
      </p>
      <p>
        To the maximum extent permitted by law, our total liability to you for all claims arising out of or relating to
        the Service will not exceed the greater of (a) the amount you paid us for the Service in the twelve (12) months
        before the claim, and (b) INR 5,000.
      </p>
      <p>
        Nothing in these Terms excludes or limits liability that cannot be excluded or limited under applicable law.
      </p>

      <h2>16. Indemnification</h2>
      <p>
        You agree to indemnify, defend and hold harmless ConnectToCampus and its affiliates, officers, directors,
        employees, agents and licensors from and against any claims, liabilities, damages, losses, costs and expenses
        (including reasonable legal fees) arising out of or relating to: your use of the Service; your breach of these
        Terms; your User Content; your breach of any third-party right; or, if you are a company, your handling of
        candidate information or your employment practices.
      </p>

      <h2>17. Suspension and termination</h2>
      <p>
        We may suspend or terminate your access to the Service at any time, with or without cause and with or without
        notice, including where we reasonably believe you have:
      </p>
      <ul>
        <li>Breached these Terms</li>
        <li>Acted in a way that is harmful to other users, the Service or our business</li>
        <li>Created multiple accounts</li>
        <li>Misused candidate information or misrepresented a role</li>
        <li>Used the Service in a fraudulent or unauthorised manner</li>
      </ul>
      <p>
        On termination, your right to use the Service ends immediately. We may delete your account and associated data.
        We will not be liable to you or any third party for terminating your access.
      </p>

      <h2>18. Dispute resolution</h2>
      <p>
        If a dispute arises out of or relates to these Terms or the Service, you agree to first contact us and attempt
        to resolve it informally. If it cannot be resolved informally within a reasonable period, the dispute will be
        resolved by a court of competent jurisdiction in India, as set out in Section 19.
      </p>
      <p>
        Where permitted by applicable law, you agree that proceedings will be brought on an individual basis and not as
        a class, consolidated or representative action.
      </p>

      <h2>19. Governing law</h2>
      <p>
        These Terms and any dispute or claim arising out of or in connection with them or the Service are governed by
        and construed in accordance with the laws of India, without regard to conflict-of-law principles. Subject to
        Section 18, the courts of competent jurisdiction in India will have exclusive jurisdiction.
      </p>

      <h2>20. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. When we do, we will update the &ldquo;Last updated&rdquo; date at
        the top of this page. For material changes, we may give additional notice, such as a notice in the Service or an
        email to registered users. Continuing to use the Service after the effective date of the changes means you
        accept the updated Terms. If you do not agree, stop using the Service.
      </p>

      <h2>21. Other provisions</h2>

      <h3>21.1 Severability</h3>
      <p>
        If any provision of these Terms is found invalid, illegal or unenforceable by a court of competent jurisdiction,
        the remaining provisions continue in full force. The invalid provision will be modified to the minimum extent
        necessary to make it valid and enforceable while preserving its intent.
      </p>

      <h3>21.2 Waiver</h3>
      <p>
        Our failure to enforce a right or provision is not a waiver of it. A waiver is only effective if made in writing
        and signed by us.
      </p>

      <h3>21.3 Assignment</h3>
      <p>
        You may not assign or transfer your rights under these Terms without our written consent. We may assign our
        rights to an affiliate or in connection with a merger, acquisition or sale of assets.
      </p>

      <h3>21.4 Entire agreement</h3>
      <p>
        These Terms, together with our <Link href="/privacy">Privacy Policy</Link>, our{' '}
        <Link href="/cookies">Cookie Policy</Link> and our <Link href="/refund">Refund &amp; Cancellation Policy</Link>,
        and any written agreement between you and us, constitute the entire agreement between you and ConnectToCampus
        regarding the Service and supersede all prior agreements and understandings.
      </p>

      <h2>22. Contact us</h2>
      <p>If you have questions about these Terms, contact us through the support channel on the website.</p>
      <p>
        <strong>ConnectToCampus</strong>
        <br />
        Website: <Link href="/">connecttocampus.com</Link>
      </p>
    </LegalPage>
  )
}
