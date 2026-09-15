'use client';

import { useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  CreditCard,
  FileText,
  Flag,
  Heart,
  KeyRound,
  Landmark,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Star,
  Upload,
  UserRound,
  Users,
  WalletCards,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Shell } from '@/features/app/single-rent-app';
import type { View } from '@/lib/routes';
import { PaymentBreakdown } from '@/components/payment-breakdown';
import {
  calculateRentalCheckout,
  formatNaira,
  type ListingSource,
} from '@/lib/pricing';

function Badge({
  children,
  tone = 'green',
}: {
  children: React.ReactNode;
  tone?: 'green' | 'gold' | 'red' | 'blue' | 'slate';
}) {
  return <span className={`status ${tone}`}>{children}</span>;
}
function Head({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <span>
        <small>{eyebrow}</small>
        <h1>{title}</h1>
        <p>{copy}</p>
      </span>
      {action}
    </div>
  );
}
function MiniMetric({
  label,
  value,
  note,
  tone = '',
}: {
  label: string;
  value: string;
  note: string;
  tone?: string;
}) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

export function AgentWorkspace({ go }: { go: (v: View) => void }) {
  return (
    <Shell go={go} role="agent" title="Agent dashboard">
      <div className="page agent-page">
        <Head
          eyebrow="Agent workspace"
          title="Good morning, Tolu"
          copy="Manage listings, enquiries and commissions for your landlord clients."
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => go('agent-homes')}>
                <Building2 size={14} /> Managed homes
              </Button>
              <Button onClick={() => go('wizard')}>
                <Plus size={14} /> Add property
              </Button>
            </div>
          }
        />
        <div className="agent-note">
          <UserRound size={16} />
          <span>
            <b>Agent-managed listings</b>Tenants see a quiet “Managed by an
            agent” label where it is relevant; the landlord remains visible as
            the property owner.
          </span>
        </div>
        <div className="metrics four">
          <MiniMetric
            label="Managed listings"
            value="14"
            note="11 published · 3 draft"
          />
          <MiniMetric
            label="Tenant enquiries"
            value="09"
            note="3 new today"
            tone="gold"
          />
          <MiniMetric
            label="Applications"
            value="04"
            note="2 need follow-up"
            tone="green"
          />
          <MiniMetric
            label="Commission available"
            value="₦560k"
            note="5% on completed rentals"
          />
        </div>
        <div className="agent-grid">
          <section className="panel agent-listings">
            <div className="subhead">
              <span>
                <small>My listings</small>
                <h2>Performance and availability</h2>
              </span>
              <Button variant="ghost" onClick={() => go('agent-homes')}>
                All listings <ArrowRight size={13} />
              </Button>
            </div>
            {[
              [
                'Lekki 2 bedroom apartment',
                'Agent managed',
                '18 saves · 6 enquiries',
                '₦4.8m / year',
              ],
              [
                'Ikoyi 3 bedroom apartment',
                'Posted for landlord',
                '31 saves · 9 enquiries',
                '₦8.5m / year',
              ],
              [
                'Yaba studio flat',
                'Agent managed',
                '7 saves · 2 enquiries',
                '₦1.85m / year',
              ],
            ].map(([name, type, activity, rent]) => (
              <button key={name} onClick={() => go('agent-home')}>
                <span className="listing-mark">
                  <Building2 size={15} />
                </span>
                <span>
                  <b>{name}</b>
                  <small>
                    <Badge tone={type === 'Agent managed' ? 'blue' : 'slate'}>
                      {type}
                    </Badge>
                    {activity}
                  </small>
                </span>
                <b>{rent}</b>
              </button>
            ))}
          </section>
          <section className="panel agent-actions">
            <Badge tone="gold">New enquiry</Badge>
            <h3>Question about Lekki 2 bedroom</h3>
            <p>
              “Is the caution fee refundable and are there visitor parking
              spaces?”
            </p>
            <small>From Adaeze Okafor · 12 min ago</small>
            <Button>
              <MessageCircle size={13} /> Respond with Property AI
            </Button>
          </section>
        </div>
        <section className="panel agent-payout">
          <span>
            <i>
              <WalletCards size={18} />
            </i>
            <span>
              <small>Commission earnings</small>
              <h3>₦560,000 ready for payout</h3>
              <p>
                Agent fee is disclosed to tenants before payment: 5% of annual
                rent.
              </p>
            </span>
          </span>
          <Button onClick={() => go('pricing')}>
            Review fee breakdown <ArrowRight size={14} />
          </Button>
        </section>
      </div>
    </Shell>
  );
}

export function FeeCheckout({ go }: { go: (v: View) => void }) {
  const [listingSource, setListingSource] = useState<ListingSource>('landlord');
  const checkout = calculateRentalCheckout({
    annualRent: 1000000,
    cautionFee: 150000,
    listingSource,
  });
  const isAgentManaged = listingSource === 'agent';

  return (
    <Shell go={go} title="Fees & checkout">
      <div className="page fee-page">
        <Head
          eyebrow="Transparent rental pricing"
          title="Understand every amount before you pay"
          copy="The listed rent never changes. The tenant sees SingleRent, agent, and caution-fee amounts separately before paying."
        />
        <div className="rental-toggle">
          <button
            className={!isAgentManaged ? 'active' : ''}
            onClick={() => setListingSource('landlord')}
          >
            <Building2 size={15} />
            <span>
              <b>Direct landlord listing</b>
              <small>Tenant pays rent + 5% platform fee</small>
            </span>
          </button>
          <button
            className={isAgentManaged ? 'active' : ''}
            onClick={() => setListingSource('agent')}
          >
            <UserRound size={15} />
            <span>
              <b>Agent-posted listing</b>
              <small>Tenant pays a further 5% agent fee</small>
            </span>
          </button>
        </div>
        <div className="fee-layout">
          <section className="fee-steps">
            <div className="step-tabs">
              <span className="active">Property summary</span>
              <span>Application review</span>
              <span>Checkout</span>
              <span>Receipt</span>
            </div>
            <div className="fee-property">
              <div className="listing-mark">
                <Building2 />
              </div>
              <span>
                <Badge tone={isAgentManaged ? 'blue' : 'slate'}>
                  {isAgentManaged
                    ? 'Managed by Tolu Akinola, Agent'
                    : 'Posted directly by landlord'}
                </Badge>
                <h2>Bright 2 bedroom apartment</h2>
                <p>
                  <MapPin size={13} /> Lekki Phase 1, Lagos
                </p>
              </span>
              <span className="rating">
                <Star size={14} /> 4.8
              </span>
            </div>
            <div className="fee-explainer">
              <CircleCheck size={17} />
              <span>
                <b>
                  {isAgentManaged
                    ? 'Two 5% fees are shown before payment'
                    : 'One 5% platform fee is shown before payment'}
                </b>
                {isAgentManaged
                  ? 'The landlord still receives the full listed rent. SingleRent and the named agent each receive 5% after a confirmed rental.'
                  : 'The landlord receives the full listed rent. SingleRent receives the separately shown 5% platform fee after a confirmed rental.'}
              </span>
            </div>
            <div className="receipt-preview">
              <span>
                <FileText size={18} />
                <b>Receipt preview</b>
              </span>
              <p>
                {isAgentManaged
                  ? `Tenant pays ${formatNaira(checkout.total)} today. Rent, both 5% fees, and caution fee are recorded separately.`
                  : `Tenant pays ${formatNaira(checkout.total)} today. Rent, the 5% platform fee, and caution fee are recorded separately.`}
              </p>
            </div>
          </section>
          <PaymentBreakdown
            checkout={checkout}
            onViewEscrow={() => go('deposit')}
          />
        </div>
        <div className="fee-footnotes">
          <span>
            <BadgeCheck size={14} /> Landlord receives the full listed rent of{' '}
            {formatNaira(checkout.annualRent)}
          </span>
          <span>
            <ShieldCheck size={14} />{' '}
            {isAgentManaged
              ? 'Agent receives 5% only after a confirmed agent-posted rental'
              : 'No agent fee appears on a direct-landlord listing'}
          </span>
        </div>
      </div>
    </Shell>
  );
}

export function ReviewsRatings({ go }: { go: (v: View) => void }) {
  const [writing, setWriting] = useState(false);
  return (
    <Shell go={go} title="Reviews & ratings">
      <div className="page reviews-page">
        <Head
          eyebrow="Verified rental experiences"
          title="Reviews & ratings"
          copy="Reviews become available after a completed tenancy or verified rental interaction."
          action={
            <Button variant="outline" onClick={() => setWriting(!writing)}>
              <Star size={14} /> {writing ? 'Close review' : 'Write a review'}
            </Button>
          }
        />
        {writing ? (
          <section className="review-form">
            <Badge>Eligible after tenancy</Badge>
            <h2>Review your rental experience</h2>
            <p>
              Share feedback on the property, landlord and the agent who managed
              your listing.
            </p>
            <div className="review-targets">
              {['Property / apartment', 'Landlord', 'Agent — Tolu Akinola'].map(
                (x, i) => (
                  <button className={i === 0 ? 'selected' : ''} key={x}>
                    <Star size={15} />
                    {x}
                    <span>★★★★★</span>
                  </button>
                ),
              )}
            </div>
            <label>
              Written review
              <textarea placeholder="What should future renters know?" />
            </label>
            <div className="actions">
              <Button variant="ghost" onClick={() => setWriting(false)}>
                Cancel
              </Button>
              <Button onClick={() => setWriting(false)}>
                Submit review <Send size={14} />
              </Button>
            </div>
          </section>
        ) : (
          <>
            <div className="reviews-top">
              <section className="rating-card">
                <small>Property rating</small>
                <strong>4.8</strong>
                <span>★★★★★</span>
                <p>42 verified reviews</p>
              </section>
              <section className="distribution">
                {[
                  ['5 stars', 86],
                  ['4 stars', 10],
                  ['3 stars', 3],
                  ['2 stars', 1],
                  ['1 star', 0],
                ].map(([x, n]) => (
                  <span key={String(x)}>
                    <small>{x}</small>
                    <i>
                      <b style={{ width: `${n}%` }} />
                    </i>
                    <small>{n}%</small>
                  </span>
                ))}
              </section>
              <section className="review-eligibility">
                <ShieldCheck size={18} />
                <span>
                  <b>Review eligibility</b>Only tenants, landlords and agents
                  with a legitimate completed rental can leave feedback.
                </span>
              </section>
            </div>
            <div className="reviews-layout">
              <section className="review-history">
                <div className="subhead">
                  <span>
                    <small>Latest feedback</small>
                    <h2>What renters say</h2>
                  </span>
                  <Button variant="ghost">
                    Sort: Recent <ChevronDown size={13} />
                  </Button>
                </div>
                {[
                  [
                    'AO',
                    'Adaeze Okafor',
                    'Tenant · 02 Sep 2026',
                    'Great natural light and responsive management. The agent shared every fee before payment.',
                    '5.0',
                  ],
                  [
                    'MB',
                    'Mariam Bello',
                    'Tenant · 18 Aug 2026',
                    'Clean, secure and exactly as described in the listing.',
                    '4.0',
                  ],
                  [
                    'JO',
                    'Jide Ojo',
                    'Landlord · 10 Aug 2026',
                    'Adaeze was respectful and easy to work with during the tenancy.',
                    '5.0',
                  ],
                ].map(([i, name, date, copy, score]) => (
                  <article key={name + date}>
                    <i>{i}</i>
                    <span>
                      <b>
                        {name}
                        <small>{date}</small>
                      </b>
                      <p>{copy}</p>
                      <button>
                        <Flag size={12} /> Report review
                      </button>
                    </span>
                    <strong>
                      <Star size={13} /> {score}
                    </strong>
                  </article>
                ))}
              </section>
              <aside className="empty-review">
                <Heart size={21} />
                <h3>Agent reviews</h3>
                <p>
                  Tolu has no public reviews yet. They will appear after
                  verified tenancies.
                </p>
                <Button variant="outline">Review guidelines</Button>
              </aside>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

export function IncidentReports({ go }: { go: (v: View) => void }) {
  const [submitted, setSubmitted] = useState(false);
  return (
    <Shell go={go} title="Report an incident">
      <div className="page incident-page">
        <Head
          eyebrow="Safety & conduct"
          title="Report a serious issue"
          copy="This is separate from normal maintenance. Reports are reviewed by SingleRent’s safety team and shared only when appropriate."
        />
        {submitted ? (
          <section className="incident-confirm">
            <i>
              <CircleCheck size={29} />
            </i>
            <Badge tone="gold">Under admin review</Badge>
            <h2>Your report was received confidentially.</h2>
            <p>
              SR-2026-1082 has been sent to the safety team. We’ll update you by
              your selected notification channels.
            </p>
            <div>
              <span>
                <Check /> Submitted
              </span>
              <span>
                <Clock3 /> Investigation queue
              </span>
              <span>Resolution</span>
            </div>
            <Button onClick={() => setSubmitted(false)}>
              View report status <ArrowRight size={14} />
            </Button>
          </section>
        ) : (
          <div className="incident-layout">
            <section className="incident-form">
              <div className="emergency">
                <CircleAlert size={18} />
                <span>
                  <b>Immediate danger?</b>Contact local emergency services
                  first. SingleRent cannot provide emergency response.
                </span>
              </div>
              <label>
                Report type
                <div className="incident-types">
                  {[
                    'Safety threat',
                    'Harassment',
                    'Fraud',
                    'Violence',
                    'Serious property safety',
                    'Misconduct',
                  ].map((x, i) => (
                    <button className={i === 0 ? 'selected' : ''} key={x}>
                      {x}
                    </button>
                  ))}
                </div>
              </label>
              <div className="formgrid">
                <label>
                  Person or property involved
                  <button>
                    Light-filled 2 bedroom, Lekki <ChevronDown size={14} />
                  </button>
                </label>
                <label>
                  Date and time
                  <input placeholder="08 Sep 2026 · 7:30 PM" />
                </label>
              </div>
              <label>
                Description
                <textarea placeholder="Explain what happened, who was involved and anything that can help the safety team investigate." />
              </label>
              <div className="formgrid">
                <label>
                  Severity
                  <button className="severity">
                    <CircleAlert size={14} /> High <ChevronDown size={14} />
                  </button>
                </label>
                <label>
                  Evidence
                  <div className="evidence">
                    <Upload size={17} />
                    <b>Add photos or files</b>
                    <small>Optional · confidential</small>
                  </div>
                </label>
              </div>
              <label className="confidential">
                <span>
                  <i className="check">
                    <Check size={11} />
                  </i>
                  Keep my identity confidential where possible
                </span>
                <small>Admin will control who can see sensitive reports.</small>
              </label>
              <div className="actions">
                <Button variant="ghost" onClick={() => go('maintenance')}>
                  This is maintenance instead
                </Button>
                <Button onClick={() => setSubmitted(true)}>
                  Submit confidential report <ArrowRight size={14} />
                </Button>
              </div>
            </section>
            <aside className="incident-side">
              <ShieldCheck size={21} />
              <h3>Who can see this?</h3>
              <p>
                Safety reports go to Admin first. Property managers are notified
                only when it is safe and relevant.
              </p>
              <span>
                <Check size={13} /> Evidence is attached to the case
              </span>
              <span>
                <Check size={13} /> Admin controls investigation visibility
              </span>
              <span>
                <Check size={13} /> You can track the case status
              </span>
              <Button variant="outline" onClick={() => go('adminops')}>
                See admin investigation view
              </Button>
            </aside>
          </div>
        )}
      </div>
    </Shell>
  );
}

export function CautionDeposit({ go }: { go: (v: View) => void }) {
  const [state, setState] = useState<
    'held' | 'proposal' | 'disputed' | 'settled'
  >('held');
  const copy = {
    held: [
      'Held in escrow',
      'Your ₦250,000 caution fee stays separate from rent until tenancy ends.',
    ],
    proposal: [
      'Deduction proposed',
      'The landlord proposed a ₦45,000 deduction for documented wall damage.',
    ],
    disputed: [
      'Disputed',
      'Your dispute and supporting evidence are now awaiting Admin review.',
    ],
    settled: [
      'Partially refunded',
      '₦205,000 was returned to Adaeze after the final settlement.',
    ],
  }[state];
  return (
    <Shell go={go} title="Caution fee escrow">
      <div className="page deposit-page">
        <Head
          eyebrow="Security deposit"
          title="Caution fee escrow"
          copy="The caution fee is held separately from rent for the full tenancy and settled transparently at move-out."
        />
        <div className="deposit-states">
          {[
            ['held', 'Held in escrow'],
            ['proposal', 'Deduction proposed'],
            ['disputed', 'Disputed'],
            ['settled', 'Partially refunded'],
          ].map(([id, label]) => (
            <button
              className={state === id ? 'active' : ''}
              onClick={() => setState(id as typeof state)}
              key={id}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="deposit-layout">
          <section className="deposit-main">
            <Badge
              tone={
                state === 'proposal' || state === 'disputed' ? 'gold' : 'green'
              }
            >
              {copy[0]}
            </Badge>
            <h2>₦250,000 caution fee</h2>
            <p>{copy[1]}</p>
            <div className="deposit-track">
              <span className="done">
                <Landmark size={14} /> Held
              </span>
              <span className={state !== 'held' ? 'done' : ''}>
                <Search size={14} /> Inspection
              </span>
              <span
                className={
                  state === 'proposal' ||
                  state === 'disputed' ||
                  state === 'settled'
                    ? 'done'
                    : ''
                }
              >
                <FileText size={14} /> Proposal
              </span>
              <span className={state === 'settled' ? 'done' : ''}>
                <WalletCards size={14} /> Settlement
              </span>
            </div>
            {state === 'proposal' && (
              <div className="deduction-card">
                <div>
                  <b>Proposed deduction</b>
                  <strong>₦45,000</strong>
                  <p>Wall repainting after move-out inspection</p>
                </div>
                <Button variant="outline">
                  <Upload size={13} /> View evidence
                </Button>
                <footer>
                  <Button onClick={() => setState('settled')}>
                    Accept deduction
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setState('disputed')}
                  >
                    Dispute deduction
                  </Button>
                </footer>
              </div>
            )}
            {state === 'disputed' && (
              <div className="dispute-card">
                <CircleAlert size={18} />
                <span>
                  <b>Admin review in progress</b>Tenant evidence, landlord
                  evidence and internal notes are visible to the assigned case
                  reviewer.
                </span>
                <Button onClick={() => setState('settled')}>
                  Review outcome
                </Button>
              </div>
            )}
            {state === 'settled' && (
              <div className="refund-card">
                <CircleCheck size={19} />
                <span>
                  <b>Final settlement complete</b>₦205,000 refunded · ₦45,000
                  released for documented damage.
                </span>
              </div>
            )}
          </section>
          <aside className="deposit-receipt">
            <h3>Tenancy receipt</h3>
            <span>
              Annual rent <b>₦4,800,000</b>
            </span>
            <span>
              Platform fee <b>₦240,000</b>
            </span>
            <span>
              Caution fee <b>₦250,000</b>
            </span>
            <hr />
            <strong>
              Caution fee balance{' '}
              <b>{state === 'settled' ? '₦0' : '₦250,000'}</b>
            </strong>
            <small>
              <Landmark size={13} /> Kept separate from rent escrow
            </small>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

export function NotificationSettings({ go }: { go: (v: View) => void }) {
  const [enabled, setEnabled] = useState(true);
  const events = [
    'Unanswered property questions',
    'New agent enquiry',
    'Maintenance request update',
    'Serious incident report',
    'Payment and escrow update',
    'New rental application',
    'KYC result',
    'Caution fee dispute',
  ];
  return (
    <Shell go={go} title="Notification preferences">
      <div className="page notifications-page">
        <Head
          eyebrow="Stay informed, even away from the app"
          title="Notification preferences"
          copy="Choose how SingleRent reaches you. This prototype shows preferences only — notification services are not connected."
        />
        <div className="channel-grid">
          {[
            ['SMS', 'For urgent safety and payment events'],
            ['Email', 'For receipts, reports and weekly summaries'],
            ['Push', 'For time-sensitive updates'],
            ['In-app', 'For all activity history'],
          ].map(([name, copy], i) => (
            <article key={name}>
              <i>
                {i === 0 ? (
                  'SMS'
                ) : i === 1 ? (
                  '✉'
                ) : i === 2 ? (
                  '●'
                ) : (
                  <Bell size={16} />
                )}
              </i>
              <span>
                <b>{name}</b>
                <small>{copy}</small>
              </span>
              <button
                className={enabled || i === 3 ? 'toggle on' : 'toggle'}
                onClick={() => setEnabled(!enabled)}
              >
                <i />
              </button>
            </article>
          ))}
        </div>
        <section className="panel event-settings">
          <div className="subhead">
            <span>
              <small>Event preferences</small>
              <h2>Choose the updates you receive</h2>
            </span>
            <Badge tone="gold">Important events always appear in-app</Badge>
          </div>
          {events.map((event, i) => (
            <div key={event}>
              <span>
                <b>{event}</b>
                <small>
                  {i === 3 || i === 7
                    ? 'Safety-sensitive notification'
                    : 'Standard activity update'}
                </small>
              </span>
              <label>
                <input type="checkbox" defaultChecked /> SMS
              </label>
              <label>
                <input type="checkbox" defaultChecked={i !== 1} /> Email
              </label>
              <label>
                <input type="checkbox" defaultChecked /> Push
              </label>
              <label>
                <input type="checkbox" defaultChecked /> In-app
              </label>
            </div>
          ))}
        </section>
        <div className="notification-example">
          <Bell size={17} />
          <span>
            <b>Example: payment received</b>“Your rent payment is now in escrow.
            We’ll notify you when the landlord approves.”
          </span>
          <Badge>Push + in-app</Badge>
        </div>
      </div>
    </Shell>
  );
}

export function OperationsAdmin({ go }: { go: (v: View) => void }) {
  return (
    <Shell go={go} role="admin" title="Marketplace operations">
      <div className="page operations-page">
        <Head
          eyebrow="Expanded platform control"
          title="Marketplace operations"
          copy="A combined review surface for agents, reviews, serious reports, caution-fee disputes and notification history."
        />
        <div className="metrics four">
          <MiniMetric
            label="Total agents"
            value="284"
            note="18 awaiting verification"
          />
          <MiniMetric
            label="Agent listings"
            value="612"
            note="39% of published homes"
            tone="green"
          />
          <MiniMetric
            label="Caution fees held"
            value="₦18.4m"
            note="Across active tenancies"
            tone="gold"
          />
          <MiniMetric
            label="Urgent incidents"
            value="03"
            note="Requires safety review"
          />
        </div>
        <div className="ops-grid">
          <section className="panel ops-queue">
            <div className="subhead">
              <span>
                <small>Priority queue</small>
                <h2>Requires attention</h2>
              </span>
              <Button variant="ghost">
                All operations <ArrowRight size={13} />
              </Button>
            </div>
            {[
              [
                Flag,
                'Urgent incident report',
                'Threat to safety · Lekki apartment',
                'Urgent',
                'red',
                'incidents',
              ],
              [
                Landmark,
                'Caution fee dispute',
                '₦250,000 · Evidence submitted',
                'Review',
                'gold',
                'deposit',
              ],
              [
                UserRound,
                'Agent verification',
                'Tolu Akinola · NIN and licence pending',
                'Review',
                'blue',
                'agent',
              ],
              [
                Star,
                'Review moderation',
                'Flagged tenant review · possible abuse',
                'Open',
                'slate',
                'reviews',
              ],
            ].map(([Icon, title, copy, status, tone, view]) => (
              <button key={title} onClick={() => go(view as View)}>
                <i className={String(tone)}>
                  <Icon size={15} />
                </i>
                <span>
                  <b>{title}</b>
                  <small>{copy}</small>
                </span>
                <Badge tone={tone as 'gold' | 'red' | 'blue' | 'slate'}>
                  {status}
                </Badge>
              </button>
            ))}
          </section>
          <section className="panel admin-breakdown">
            <small>Transaction detail</small>
            <h2>Agent-managed rental</h2>
            <p>Clear fee visibility for Admin investigations and support.</p>
            <span>
              Annual rent <b>₦1,000,000</b>
            </span>
            <span>
              Platform fee <b>₦50,000</b>
            </span>
            <span>
              Agent commission <b>₦50,000</b>
            </span>
            <span>
              Caution fee <b>₦150,000</b>
            </span>
            <strong>
              Total tenant paid <b>₦1,250,000</b>
            </strong>
            <Button variant="outline" onClick={() => go('pricing')}>
              Open transaction view
            </Button>
          </section>
        </div>
        <section className="panel notification-audit">
          <div className="subhead">
            <span>
              <small>Notifications & audit history</small>
              <h2>Recent delivery log</h2>
            </span>
            <Button variant="ghost">
              View all <ArrowRight size={13} />
            </Button>
          </div>
          {[
            [
              'Payment received',
              'Adaeze Okafor',
              'Push · Email · In-app',
              'Delivered',
            ],
            [
              'Serious report submitted',
              'Safety team',
              'SMS · In-app',
              'Delivered',
            ],
            ['Agent enquiry', 'Tolu Akinola', 'Push · In-app', 'Read'],
          ].map(([event, recipient, channel, status]) => (
            <div key={event}>
              <Bell size={15} />
              <span>
                <b>{event}</b>
                <small>
                  {recipient} · {channel}
                </small>
              </span>
              <Badge tone={status === 'Read' ? 'blue' : 'green'}>
                {status}
              </Badge>
            </div>
          ))}
        </section>
      </div>
    </Shell>
  );
}
