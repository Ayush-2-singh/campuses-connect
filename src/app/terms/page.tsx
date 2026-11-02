import Link from 'next/link'
import LegalPage from '@/components/legal/LegalPage'

/**
 * Terms & Conditions — written for the product that ships today.
 *
 * The previous version described a two-sided hiring marketplace: recruiter
 * accounts, candidate shortlists, employer obligations, fees and a first free
 * batch of candidates. None of that is live (jobs and applications are gated
 * off in src/lib/featureGates.ts and there is no recruiter UI), so those
 * clauses governed features that do not exist and implied the site would find
 * students jobs.
 *
 * This version covers only what is actually here: student accounts, profiles,
 * interview experiences, study rooms and messaging, Compete / Live Battle, the
 * question bank, and acceptable use.
 *
 * Metadata (title / description / canonical) lives in ./layout.tsx.
 */

export default function TermsOfServicePage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      updated="November 2, 2026"
      lede={
        <>
          These Terms govern your use of ConnectToCampus — a student platform for reading interview experiences,
          studying in live rooms and practising timed questions. There are no employer accounts and no job applications
          on the Service.
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
      <p>
        ConnectToCampus is for students — primarily Computer Science, IT and Electronics students preparing for campus
        placements — who want to learn from real interview write-ups and practise the questions that come up in them.
        The features available today are:
      </p>
      <ul>
        <li>
          <strong>Interview experiences</strong> — read round-by-round write-ups published by other students, and
          publish your own.
        </li>
        <li>
          <strong>Study rooms</strong> — join a topic-based room with other students to study or discuss together.
        </li>
        <li>
          <strong>Compete and Live Battle</strong> — timed practice and live quizzes, scored on the server, with
          leaderboards and your own history.
        </li>
        <li>
          <strong>Question bank</strong> — author and reuse your own practice questions, including hosting a live quiz
          from them.
        </li>
        <li>
          <strong>Profiles and connections</strong> — a student profile, connection requests and one-to-one messages.
        </li>
      </ul>
      <p>
        We do not provide recruitment services. We do not act as an employment agency, do not accept applications on
        behalf of any employer, and do not pass your details to companies. Any hiring features described elsewhere on
        the internet or in older copies of these Terms are not part of the Service.
      </p>

      <h2>2. Eligibility</h2>
      <ul>
        <li>
          You must be at least 13 years old, or older where your jurisdiction requires a higher age for a service of
          this kind.
        </li>
        <li>You must have the legal capacity to enter into a binding agreement.</li>
        <li>You must not be barred from using the Service under applicable law.</li>
        <li>
          If you are below the age of majority where you live, use the community features — publishing experiences,
          joining rooms, messaging — with the involvement of a parent or guardian.
        </li>
      </ul>
      <p>By using the Service, you represent and warrant that you meet these requirements.</p>

      <h2>3. Accounts</h2>
      <ul>
        <li>You must provide accurate, current and complete information, and keep it up to date.</li>
        <li>You are responsible for keeping your credentials confidential and for all activity under your account.</li>
        <li>Tell us immediately if you become aware of unauthorised use of your account.</li>
        <li>
          Do not create multiple accounts to evade a suspension, inflate a leaderboard, or otherwise gain an advantage.
        </li>
      </ul>
      <p>
        We may suspend or terminate accounts that breach these Terms or that we reasonably believe are being used in an
        unauthorised way.
      </p>

      <h2>4. Your profile must be truthful</h2>
      <p>
        Your profile, skills, academic details and any links you add must be accurate and must genuinely belong to you.
        Impersonating another person, claiming a campus or qualification you do not have, or misstating your experience
        is a breach of these Terms. Campus details may be verified — see our <Link href="/privacy">Privacy Policy</Link>{' '}
        for how verification documents are handled.
      </p>

      <h2>5. Interview experiences</h2>
      <p>Experiences are meant to help other students prepare, so they must be real. When you publish one:</p>
      <ul>
        <li>
          Describe a drive or interview you actually attended. Do not invent rounds, offers or outcomes, and do not post
          a write-up on someone else&rsquo;s behalf without their permission.
        </li>
        <li>
          Do not publish anything you are contractually or legally barred from sharing, such as confidential material
          covered by a non-disclosure agreement or a live assessment paper.
        </li>
        <li>
          Do not include other people&rsquo;s personal information — names, contact details, employee IDs, screenshots
          of private messages or candidate lists.
        </li>
        <li>
          Keep it useful: company, role, rounds and the questions you were asked. Mark clearly whether you were
          selected, rejected or are still waiting.
        </li>
      </ul>
      <p>
        We may edit, label or remove a published experience that appears fabricated, copied, defamatory or unlawful.
        Experiences are one student&rsquo;s account of their own interview, not a statement by us about any company.
      </p>

      <h2>6. Study rooms and messaging</h2>
      <ul>
        <li>
          Rooms exist for studying and discussion. Be civil, stay on the room&rsquo;s topic, and do not spam invites or
          messages.
        </li>
        <li>
          Do not record, stream or redistribute another participant&rsquo;s audio, video, screen or messages without
          their knowledge and consent.
        </li>
        <li>
          Do not use rooms or messages to harass, advertise, recruit for paid services, or share pirated material.
        </li>
        <li>
          Room hosts and moderators may remove participants who break these rules. Report serious abuse through the
          support channel.
        </li>
      </ul>

      <h2>7. Compete, Live Battle and leaderboards</h2>
      <p>
        Practice and live quizzes must be taken honestly and on your own. You must not use bots, automation, scripts,
        leaked answer keys, multiple accounts or the help of another person to obtain a score that is not genuinely
        yours, and you must not exploit bugs, tamper with the timer or scoring, or interfere with other participants.
      </p>
      <ul>
        <li>Scores, response times, ranks and history are recorded against your account.</li>
        <li>
          We may review suspicious results, invalidate them, remove affected entries from a leaderboard, and suspend
          accounts that repeatedly cheat.
        </li>
        <li>
          If you host a live quiz, you are responsible for the questions you load and for running it fairly. Do not host
          content that is unlawful, hateful or sexually explicit.
        </li>
      </ul>
      <div className="legal-note">
        <p>
          <strong>Scores are practice feedback, not a qualification.</strong> They are shown to other participants on
          leaderboards, they are not shared with employers, and they are not a guarantee of interview performance or of
          any outcome.
        </p>
      </div>

      <h2>8. Question bank</h2>
      <p>
        You keep ownership of the questions you author. Only upload or paste questions you wrote yourself or that you
        are permitted to use; do not copy a paid question set, a live assessment paper or another platform&rsquo;s
        content. We may remove a question that infringes someone else&rsquo;s rights or that we are asked to take down.
      </p>

      <h2>9. Free to use</h2>
      <p>
        The Service is free for students. We do not charge you to create an account, publish an experience, join a room
        or take part in a quiz, and there is nothing to buy. If anyone asks you for payment, a fee or a deposit in
        connection with the Service, do not pay it and tell us immediately.
      </p>
      <p>
        We may add paid features in future. If we do, the price and terms will be shown clearly before you are charged,
        and these Terms will be updated.
      </p>

      <h2>10. Acceptable use</h2>
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
        <li>Cheat in Compete or Live Battle, or exploit bugs for unfair advantage</li>
        <li>Violate any applicable law or the rights of any third party</li>
      </ul>

      <h2>11. User content</h2>

      <h3>11.1 Ownership</h3>
      <p>
        You retain ownership of content you create, post or upload (&ldquo;User Content&rdquo;) — such as your profile
        text, interview experiences, questions, room chat and messages. These Terms do not transfer ownership to us.
      </p>

      <h3>11.2 Licence to us</h3>
      <p>
        By posting User Content, you grant us a non-exclusive, worldwide, royalty-free, sublicensable and transferable
        licence to use, reproduce, adapt, publish, translate, distribute and display that content as needed to operate,
        improve and promote the Service. This licence ends when you delete the content or your account, except where the
        content has been shared with others who have not deleted it, or where copies persist in caches or backups, or
        where we must retain it by law.
      </p>

      <h3>11.3 Your responsibility</h3>
      <p>
        You are solely responsible for your User Content. We do not endorse it and are not responsible or liable for it.
        We are not obliged to monitor content, but we may review, edit or remove it at our discretion.
      </p>

      <h2>12. Intellectual property</h2>
      <p>
        The Service — including its design, code, features, graphics, logos, trademarks and documentation — is owned by
        or licensed to ConnectToCampus and protected by intellectual-property law. You may not copy, modify, distribute,
        sell, lease, reverse-engineer or create derivative works from the Service without our written permission.
        Question text published by other students remains theirs; read it, practise it, but do not republish it as your
        own.
      </p>
      <p>
        Any feedback or suggestions you give us about the Service may be used by us without restriction or compensation
        to you.
      </p>

      <h2>13. Privacy and cookies</h2>
      <p>
        Your use of the Service is also governed by our <Link href="/privacy">Privacy Policy</Link>, which describes how
        we collect, use and share information, and by our <Link href="/cookies">Cookie Policy</Link>. By using the
        Service you acknowledge those documents.
      </p>

      <h2>14. Third-party services and links</h2>
      <p>
        The Service relies on, and may link to, third-party services — for example a sign-in provider, our database and
        storage provider, or the service that carries live room audio. These are not under our control and we are not
        responsible for their content, products, services, privacy practices or terms. Your interactions with them are
        governed by their terms and policies.
      </p>

      <h2>15. Disclaimers</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
        AVAILABLE&rdquo;, WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED OR STATUTORY, INCLUDING IMPLIED
        WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT.
      </p>
      <p>Without limiting the above, we do not warrant that:</p>
      <ul>
        <li>The Service will be uninterrupted, timely, secure or error-free</li>
        <li>
          Interview write-ups, questions, answers, scores or rankings contributed by users or generated by the Service
          will be accurate, complete or reliable
        </li>
        <li>The Service will result in an interview, an offer, a job or any other outcome</li>
        <li>Errors will be corrected</li>
      </ul>
      <p>
        The Service is a study and practice tool. Nothing on it is professional careers, legal, immigration, academic or
        financial advice, and it is not a recruitment service. You should obtain your own advice where you need it.
      </p>

      <h2>16. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CONNECTTOCAMPUS AND ITS AFFILIATES, OFFICERS, DIRECTORS,
        EMPLOYEES, AGENTS AND LICENSORS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
        EXEMPLARY OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, OPPORTUNITY, DATA, GOODWILL OR OTHER
        INTANGIBLE LOSSES, ARISING OUT OF OR RELATING TO THE SERVICE.
      </p>
      <p>
        This includes, without limitation, damages arising from: your access to or use of (or inability to use) the
        Service; any content obtained through the Service; reliance on an interview write-up, question, answer or score;
        another user&rsquo;s conduct; and unauthorised access to or alteration of your content or transmissions.
      </p>
      <p>
        To the maximum extent permitted by law, our total liability to you for all claims arising out of or relating to
        the Service will not exceed INR 5,000.
      </p>
      <p>
        Nothing in these Terms excludes or limits liability that cannot be excluded or limited under applicable law.
      </p>

      <h2>17. Indemnification</h2>
      <p>
        You agree to indemnify, defend and hold harmless ConnectToCampus and its affiliates, officers, directors,
        employees, agents and licensors from and against any claims, liabilities, damages, losses, costs and expenses
        (including reasonable legal fees) arising out of or relating to: your use of the Service; your breach of these
        Terms; your User Content; or your breach of any third-party right.
      </p>

      <h2>18. Suspension and termination</h2>
      <p>
        We may suspend or terminate your access to the Service at any time, with or without cause and with or without
        notice, including where we reasonably believe you have:
      </p>
      <ul>
        <li>Breached these Terms</li>
        <li>Acted in a way that is harmful to other users, the Service or our community</li>
        <li>Created multiple accounts to evade a suspension or manipulate results</li>
        <li>Published fabricated or infringing content</li>
        <li>Used the Service in a fraudulent or unauthorised manner</li>
      </ul>
      <p>
        On termination, your right to use the Service ends immediately. We may delete your account and associated data.
        We will not be liable to you or any third party for terminating your access.
      </p>
      <p>
        You may stop using the Service at any time and ask us to delete your account, as described in our{' '}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>19. Dispute resolution</h2>
      <p>
        If a dispute arises out of or relates to these Terms or the Service, you agree to first contact us and attempt
        to resolve it informally. If it cannot be resolved informally within a reasonable period, the dispute will be
        resolved by a court of competent jurisdiction in India, as set out in Section 20.
      </p>
      <p>
        Where permitted by applicable law, you agree that proceedings will be brought on an individual basis and not as
        a class, consolidated or representative action.
      </p>

      <h2>20. Governing law</h2>
      <p>
        These Terms and any dispute or claim arising out of or in connection with them or the Service are governed by
        and construed in accordance with the laws of India, without regard to conflict-of-law principles. Subject to
        Section 19, the courts of competent jurisdiction in India will have exclusive jurisdiction.
      </p>

      <h2>21. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. When we do, we will update the &ldquo;Last updated&rdquo; date at
        the top of this page. For material changes, we may give additional notice, such as a notice in the Service or an
        email to registered users. Continuing to use the Service after the effective date of the changes means you
        accept the updated Terms. If you do not agree, stop using the Service.
      </p>

      <h2>22. Other provisions</h2>

      <h3>22.1 Severability</h3>
      <p>
        If any provision of these Terms is found invalid, illegal or unenforceable by a court of competent jurisdiction,
        the remaining provisions continue in full force. The invalid provision will be modified to the minimum extent
        necessary to make it valid and enforceable while preserving its intent.
      </p>

      <h3>22.2 Waiver</h3>
      <p>
        Our failure to enforce a right or provision is not a waiver of it. A waiver is only effective if made in writing
        and signed by us.
      </p>

      <h3>22.3 Assignment</h3>
      <p>
        You may not assign or transfer your rights under these Terms without our written consent. We may assign our
        rights to an affiliate or in connection with a merger, acquisition or sale of assets.
      </p>

      <h3>22.4 Entire agreement</h3>
      <p>
        These Terms, together with our <Link href="/privacy">Privacy Policy</Link> and our{' '}
        <Link href="/cookies">Cookie Policy</Link>, constitute the entire agreement between you and ConnectToCampus
        regarding the Service and supersede all prior agreements and understandings.
      </p>

      <h2>23. Contact us</h2>
      <p>If you have questions about these Terms, contact us through the support channel on the website.</p>
      <p>
        <strong>ConnectToCampus</strong>
        <br />
        Website: <Link href="/">connecttocampus.com</Link>
      </p>
    </LegalPage>
  )
}
