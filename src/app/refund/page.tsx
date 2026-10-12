import Link from 'next/link'
import LegalPage from '@/components/legal/LegalPage'

/**
 * Refund & Cancellation Policy.
 *
 * The Service is free for students. Company fees are agreed in writing and
 * depend on a hire — no automated checkout is integrated today, so this policy
 * deliberately defers to the written agreement rather than inventing a
 * self-serve billing process that does not exist.
 *
 * Metadata (title / description / canonical) lives in ./layout.tsx.
 */

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund & Cancellation Policy"
      updated="October 13, 2026"
      lede={
        <>
          ConnectToCampus is free for students. For companies, fees are agreed in writing and are tied to a hire — this
          policy explains how cancellations and refunds work.
        </>
      }
    >
      <p>
        This policy explains when fees are payable and how cancellations and refunds are handled. It forms part of our{' '}
        <Link href="/terms">Terms &amp; Conditions</Link>. Where a written agreement between you and ConnectToCampus
        says something different, that agreement takes precedence.
      </p>

      <h2>1. Students</h2>
      <p>
        The Service is <strong>free for students</strong>. We do not charge you to create a profile, connect a developer
        account, take an assessment, browse roles or apply for a job. There is nothing to refund, because there is
        nothing to pay.
      </p>
      <div className="legal-note">
        <p>
          <strong>
            If anyone asks you for money in connection with a role found through ConnectToCampus — a fee, a deposit, a
            &ldquo;registration&rdquo; or &ldquo;training&rdquo; charge — do not pay it.
          </strong>{' '}
          Tell us immediately through the support channel. Legitimate employers do not charge candidates.
        </p>
      </div>
      <p>
        You can stop using the Service at any time, and you can ask us to delete your account as described in our{' '}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>2. Companies and recruiters</h2>

      <h3>2.1 Your first batch</h3>
      <p>
        We may offer a free first batch of candidates as an introductory offer. When we do, that batch costs nothing, so
        there is nothing to cancel or refund for it. Offers are subject to the eligibility criteria we give you at the
        time, and may change.
      </p>

      <h3>2.2 Fees</h3>
      <p>
        Fees payable by a company are the ones we agree with you in writing — for example in an order form, a proposal
        or an invoice. Unless we agree otherwise in writing:
      </p>
      <ul>
        <li>Fees that depend on a hire become payable only when that hire is made</li>
        <li>Fees are exclusive of applicable taxes unless the written agreement says otherwise</li>
        <li>Invoices are payable within the period stated on the invoice</li>
      </ul>

      <h3>2.3 Cancelling before we deliver</h3>
      <p>
        You can cancel a request for a batch at any time before we deliver it, by telling us in writing. If you have not
        been invoiced, there is nothing to pay. If you have paid in advance for work we have not started, we will refund
        the unused amount.
      </p>

      <h3>2.4 Cancelling after we deliver</h3>
      <p>
        Once we have delivered a shortlist, that work has been performed. A fee tied to a hire becomes payable when the
        hire is made, as set out in the written agreement. If you cancel or do not hire, no hire-linked fee is due — but
        any separate, non-hire-linked fee that has already been invoiced and earned (for example a fixed engagement fee
        we agreed in writing) remains payable.
      </p>

      <h3>2.5 Refunds</h3>
      <p>We will refund a payment where:</p>
      <ul>
        <li>You paid in advance and we have not performed the work</li>
        <li>We cancel the engagement and cannot deliver what we agreed</li>
        <li>A payment was made in error, or was duplicated</li>
        <li>A refund is required by applicable law</li>
      </ul>
      <p>
        Where a refund is due, we will process it to the original payment method or by bank transfer, normally within 14
        business days of agreeing it. Bank charges and payment-processor fees that we cannot recover may be deducted
        where the law allows.
      </p>

      <h3>2.6 What we do not refund</h3>
      <p>
        Except where the law requires otherwise or we agree in writing, we do not refund fees for work that has already
        been performed and delivered — including a shortlist you have received. We also do not guarantee any hiring
        outcome, so a decision not to hire (or a candidate declining an offer) is not, by itself, a ground for refund.
      </p>

      <h3>2.7 Chargebacks</h3>
      <p>
        If you dispute a payment with your bank or payment provider, please contact us first — we can usually resolve it
        faster. We may pause an engagement while a dispute is open.
      </p>

      <h2>3. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. When we do, we will update the &ldquo;Last updated&rdquo; date at
        the top of this page. Changes apply from the date they are posted and do not affect fees already agreed in
        writing for an existing engagement, unless the written agreement says otherwise.
      </p>

      <h2>4. Contact us</h2>
      <p>
        To cancel an engagement, request a refund, or ask a question about this policy, contact us through the support
        channel on the website.
      </p>
      <p>
        <strong>ConnectToCampus</strong>
        <br />
        Website: <Link href="/">connecttocampus.com</Link>
      </p>
    </LegalPage>
  )
}
