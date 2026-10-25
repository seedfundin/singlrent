export const TENANCY_AGREEMENT_VERSION = 'single-rent-tenancy-agreement-v2';

export type AgreementSection = {
  heading: string;
  clauses: string[];
};

export type RenderedTenancyAgreement = {
  version: typeof TENANCY_AGREEMENT_VERSION;
  title: string;
  reference: string;
  introductoryParagraphs: string[];
  sections: AgreementSection[];
  schedules: AgreementSection[];
};

type TemplateInput = {
  reference: string;
  generatedAt: Date;
  premises: {
    title: string;
    address: string;
    area: string;
    state: string;
    propertyType: string;
    annualRentKobo: bigint;
    cautionFeeKobo: bigint;
    amenities: string[];
  };
  tenancy: { startsAt: Date; endsAt: Date };
  parties: {
    tenant: { name: string; email: string };
    landlord: { name: string; email: string };
    agent: { name: string; email: string } | null;
  };
  occupantsCount: number;
};

/**
 * This is the supplied "SINGLE RENTS TENANCY AGREEMENT" converted into a
 * versioned, tenant-specific record. Keeping the rendered terms in the
 * agreement record means later account or listing edits cannot silently alter
 * what either party reviewed and signed.
 */
export function createTenancyAgreementTerms(input: TemplateInput): RenderedTenancyAgreement {
  const propertyAddress = [input.premises.address, input.premises.area, input.premises.state].filter(Boolean).join(', ');
  const tenantAddress = `Electronic address: ${input.parties.tenant.email}`;
  const landlordAddress = `Electronic address: ${input.parties.landlord.email}`;
  const propertyType = titleCase(input.premises.propertyType);
  const tenancyPeriod = `${formatDate(input.tenancy.startsAt)} to ${formatDate(input.tenancy.endsAt)}`;
  const rent = formatKobo(input.premises.annualRentKobo);
  const caution = input.premises.cautionFeeKobo > 0n ? formatKobo(input.premises.cautionFeeKobo) : 'None recorded';
  const agent = input.parties.agent ? `${input.parties.agent.name} (${input.parties.agent.email})` : 'None recorded';
  const amenities = input.premises.amenities.length ? input.premises.amenities.join(', ') : 'None recorded';

  return {
    version: TENANCY_AGREEMENT_VERSION,
    title: 'Tenancy Agreement',
    reference: input.reference,
    introductoryParagraphs: [
      `THIS TENANCY AGREEMENT is made on ${formatDate(input.generatedAt)}.`,
      `BETWEEN ${input.parties.landlord.name} of ${landlordAddress} (hereinafter called “the Landlord”, which expression shall, where the context so admits, include the Landlord’s heirs, personal representatives, successors and assigns) of the ONE PART.`,
      `AND ${input.parties.tenant.name} of ${tenantAddress} (hereinafter called “the Tenant”, which expression shall, where the context so admits, include the Tenant’s successors in title and permitted assigns) of the OTHER PART.`,
      'The Landlord and the Tenant are together referred to as “the Parties”. The Parties acknowledge that Single Rents (the “Platform”) facilitated the listing, communication, booking or documentation of this letting. The Platform is not a landlord, tenant, guarantor, property manager or legal representative merely because it facilitated the transaction. The tenancy created by this Agreement is between the Landlord and the Tenant.',
      'WHEREBY IT IS AGREED AS FOLLOWS',
    ],
    sections: [
      {
        heading: '1. DEMISE, DESCRIPTION AND USE OF THE PREMISES',
        clauses: [
          '1.1. In consideration of the rent reserved and the covenants contained in this Agreement, the Landlord hereby lets and the Tenant hereby takes the premises described below (the “Premises”), together with the appurtenances and rights expressly identified in Schedule 1.',
          `(a) Full property address: ${propertyAddress}.`,
          '(b) Building/block/floor and room/unit number: As recorded in the approved listing or handover record.',
          `(c) Type of premises: ${propertyType}.`,
          `(d) Approved occupants: ${input.occupantsCount}.`,
          '(e) Exclusive areas, shared facilities and access rights are as stated in Schedule 1.',
          '1.2. The Premises shall be used solely as a private residence by the approved occupants. The Tenant shall not use the Premises for unlawful activity, a business open to the public, short-term subletting or any purpose prohibited by law or disclosed building rules.',
          '1.3. Where the letting is for a room in a shared building, the Landlord shall identify the Tenant’s exclusive room, shared spaces, facilities, access routes and applicable house rules in Schedule 1. No house rule shall unlawfully remove a right conferred by applicable law.',
        ],
      },
      {
        heading: '2. TERM AND RENT',
        clauses: [
          '2.1. The tenancy shall be a fixed term unless the approved booking summary records a periodic tenancy.',
          `2.2. Commencement date: ${formatDate(input.tenancy.startsAt)}. Expiry date: ${formatDate(input.tenancy.endsAt)}.`,
          `2.3. The rent reserved for the agreed term is ${rent}, payable for the period and by the schedule shown in the approved Platform booking and payment summary.`,
          '2.4. Rent shall be payable on or before the agreed due date by the method and to the account stated in the Platform booking/payment summary or in a separate written notice verified directly with the Landlord. The Tenant shall obtain a dated receipt for every payment.',
          '2.5. The Landlord shall not demand an undisclosed rent, fee, deposit or advance payment after the Tenant has accepted the written total-cost summary, except where the Tenant separately agrees in writing and the charge is lawful.',
          '2.6. Any rent review or increase must comply with applicable law, this Agreement and any valid court order. Nothing in this Agreement permits an unlawful or arbitrary increase.',
        ],
      },
      {
        heading: '3. SECURITY DEPOSIT AND REFUNDS',
        clauses: [
          `3.1. Security deposit (if any): ${caution}. The deposit is security for documented unpaid sums or damage beyond fair wear and tear and is not a substitute for rent unless agreed in writing.`,
          '3.2. The deposit shall be held and handled only as described in the Platform booking/payment summary. The Platform will describe any formal third-party holding arrangement only where that arrangement genuinely exists.',
          '3.3. Within the applicable period after vacant possession and return of keys, the Landlord shall return the undisputed balance of the deposit, together with an itemized statement of any deductions and reasonable supporting evidence. If a dispute prevents final calculation, the undisputed portion shall be returned promptly.',
          '3.4. Deductions may cover evidenced damage caused by the Tenant or approved occupants beyond fair wear and tear, unpaid agreed utilities or other sums lawfully due. Deductions shall not cover pre-existing defects, ordinary wear or repairs that are the Landlord’s responsibility.',
          '3.5. Any refund of advance rent following early termination, cancellation, uninhabitability or another event shall be determined by this Agreement and applicable law. The Parties shall not assume that all advance rent is automatically refundable or automatically forfeited.',
        ],
      },
      {
        heading: '4. PLATFORM FEE',
        clauses: [
          '4.1. For a successful letting concluded through Single Rents, the Platform-use fee is 3% of the annual rent stated in clause 2.3, unless a different fee is expressly displayed and accepted before the booking is confirmed.',
          '4.2. Under the agreed Platform model, the Landlord is responsible for the 3% Platform fee. It is separate from rent, the security deposit and any legal fee. It shall not be charged to the Tenant as a second Platform fee unless a revised written fee schedule expressly identifies the Tenant as payer and the Tenant accepts it before committing.',
          '4.3. The Platform shall provide a receipt or electronic confirmation for any Platform fee it collects. The fee is consideration for Platform services and is not a legal fee or government tax.',
          '4.4. The Platform’s separate terms and conditions govern account use, listing moderation, payment processing and Platform complaints. As between the Landlord and Tenant, this Agreement and applicable law govern tenancy rights.',
        ],
      },
      {
        heading: '5. LEGAL FEE FOR PREPARATION OF AGREEMENT',
        clauses: [
          '5.1. The proposed legal fee is 10% of the annual rent, payable by the Tenant for preparation of this Agreement, only where the appointed Nigerian legal practitioner confirms in writing that the fee, allocation of liability to the Tenant and scope of service comply with the applicable Legal Practitioners Remuneration Order and professional rules.',
          '5.2. Before payment is required, the legal practitioner or authorised billing party shall disclose in writing: (a) the legal practitioner’s name and contact details; (b) the precise work covered; (c) the fee calculation and amount; (d) any VAT, filing, stamping, disbursement or other charge; and (e) the intended recipient of payment.',
          '5.3. The legal fee is separate from the 3% Platform fee, rent and deposit. It shall not be represented as a fee retained by Single Rents unless the Platform is legally entitled to receive it and the arrangement is transparently disclosed. A receipt shall be issued by the actual recipient.',
          '5.4. If the proposed 10% amount is inconsistent with applicable professional fee rules or the required fee for the legal work, it shall not be implemented as written. The legal practitioner shall provide a compliant fee and the Tenant shall be informed before signing or paying. No double charge shall be made for the same legal work.',
          '5.5. If no separate legal practitioner has been appointed, or no compliant written fee note has been provided, the proposed 10% legal fee is not payable under this clause until those matters are resolved in writing.',
        ],
      },
      {
        heading: '6. THE TENANT HEREBY COVENANTS WITH THE LANDLORD',
        clauses: [
          '(a) To pay rent and agreed lawful charges when due and retain proof of payment.',
          '(b) To use the Premises as a residence, keep it reasonably clean and promptly report defects, damage, safety hazards or incidents.',
          '(c) To avoid deliberate or negligent damage, nuisance, unlawful conduct, unreasonable noise and interference with other residents’ lawful use of shared spaces.',
          '(d) Not to sublet, assign, transfer occupation or allow unapproved additional occupants without the Landlord’s prior written consent, subject to applicable law.',
          '(e) Not to make structural alterations or install equipment that materially affects the Premises without prior written consent.',
          '(f) To be responsible for damage caused by the Tenant or the Tenant’s guests beyond fair wear and tear.',
          '(g) To pay electricity, water, waste collection, internet, security, cleaning, generator/fuel, service charges and other recurring costs only as allocated and disclosed in Schedule 1.',
          '(h) To comply with applicable laws and disclosed, lawful building rules relating to the Premises.',
          '(i) To return the Premises and keys/access devices at the end of the tenancy, subject to fair wear and tear and rights under applicable law.',
          '(j) To compensate the Landlord for evidenced loss directly resulting from the Tenant’s breach, to the extent recoverable under applicable law.',
        ],
      },
      {
        heading: '7. THE LANDLORD HEREBY COVENANTS WITH THE TENANT',
        clauses: [
          '(a) That the Landlord has the legal right or valid authority to let the Premises and receive rent and shall provide reasonable evidence of identity and authority when requested.',
          '(b) That the listing description, photographs, rent, facilities, availability, permitted occupancy, restrictions and material information supplied to the Platform and Tenant are accurate and not misleading.',
          '(c) To deliver the Premises reasonably fit for the agreed residential purpose, safe to occupy and supplied with facilities expressly promised, subject to disclosed defects and applicable law.',
          '(d) To carry out structural and other repairs that are the Landlord’s responsibility under law and this Agreement, and to respond within a reasonable time to hazards, serious leaks, electrical risks, security defects or urgent issues.',
          '(e) To respect the Tenant’s privacy and peaceful enjoyment. Except in an emergency or where legally authorised, entry shall be at a reasonable time after reasonable prior notice and for a legitimate purpose.',
          '(f) To provide receipts for rent and other payments received and not to unlawfully disconnect utilities, seize belongings or harass the Tenant.',
          '(g) To disclose material disputes, restrictions, known serious defects, shared occupancy arrangements and service charges before the Tenant commits.',
          '(h) To maintain those areas and facilities which the Landlord is responsible for maintaining by law or under this Agreement.',
        ],
      },
      {
        heading: '8. REPAIRS, UTILITIES AND CONDITION OF PREMISES',
        clauses: [
          '8.1. Responsibility for electricity, water, waste collection, internet, security, cleaning, generator/fuel, service charges and other recurring costs shall be stated in Schedule 1. No undisclosed charge may be imposed retrospectively.',
          '8.2. Where utilities are shared, the Parties shall record the allocation method (for example, sub-meter, agreed fixed amount or documented proportion) and how bills are evidenced. Neither Party shall knowingly misrepresent meter readings or utility costs.',
          '8.3. At handover, the Parties shall complete Schedule 2, record meter readings and keys/access cards, and attach dated photographs or video of the Premises, fixtures, shared areas and any pre-existing damage.',
          '8.4. Emergency repairs and access shall be handled promptly and reasonably, with due regard to safety, notice requirements and the Tenant’s privacy.',
        ],
      },
      {
        heading: '9. TERMINATION, NOTICE AND RECOVERY OF POSSESSION',
        clauses: [
          '9.1. A fixed-term tenancy expires on the agreed date unless renewed, subject to any statutory notice or other requirement applicable in the circumstances.',
          '9.2. For a periodic tenancy, the notice period shall be subject to the Lagos State Tenancy Law 2011 as applicable, any valid written agreement and other applicable law. Where this Agreement is silent or the stated period is invalid, the applicable statutory period shall apply.',
          '9.3. Any notice to quit, notice of intention to recover possession, and enforcement must comply with applicable law. Nothing in this Agreement authorizes a Party to bypass mandatory legal procedure.',
          '9.4. The Tenant shall return possession and keys on lawful termination. The Parties shall arrange a joint inspection and settle outstanding sums, deposit deductions and refunds in accordance with clause 3.',
          '9.5. Any early surrender or negotiated termination should be documented in writing, including the agreed date, treatment of rent, deposit, utility bills and handover obligations.',
          '9.6. The Landlord shall not use self-help eviction, lock out the Tenant, remove the Tenant’s belongings, disconnect essential services unlawfully or use force to recover possession.',
        ],
      },
      {
        heading: '10. DEFAULT AND DISPUTE RESOLUTION',
        clauses: [
          '10.1. A Party alleging breach shall, where reasonably possible, give written particulars and a reasonable opportunity to remedy the breach, except where urgent action or applicable law requires otherwise.',
          '10.2. The Parties shall first attempt to resolve disputes through direct written communication. If unresolved, they may use mediation or another lawful dispute-resolution process by mutual agreement. Nothing prevents either Party from approaching a court or authority with jurisdiction or seeking urgent relief.',
          '10.3. Disputes concerning the Platform’s own services, listing accuracy, Platform charges or Platform account may also be submitted through Single Rents’ published complaint process. The Platform is not empowered to determine legal title or replace a court.',
          '10.4. Nothing in this Agreement excludes statutory rights, consumer protections, privacy rights or remedies that cannot lawfully be excluded.',
        ],
      },
      {
        heading: '11. PLATFORM ROLE, VERIFICATION AND PAYMENTS',
        clauses: [
          '11.1. The Platform is an intermediary unless a separate written agreement expressly provides otherwise. The Landlord and Tenant remain responsible for the accuracy of their statements and for complying with this Agreement and the law.',
          '11.2. Platform verification or publication of a listing is not a guarantee of title, structural condition, future conduct or legal outcome. The Platform should take reasonable steps under its published procedures to verify users and handle reports, but the Parties should inspect the Premises and verify payment instructions.',
          '11.3. The Tenant should view the Premises in person or by a credible live viewing before paying substantial sums, verify the identity and authority of the recipient and use only the payment channel confirmed in the Platform booking summary. A change of bank account must be independently verified.',
          '11.4. The Platform must not be described as holding funds under a formal third-party arrangement unless that arrangement is disclosed and legally valid. Payment processing, refund or disbursement terms must be disclosed before payment.',
        ],
      },
      {
        heading: '12. NOTICES AND ELECTRONIC SIGNATURES',
        clauses: [
          `12.1. Notices under this Agreement shall be delivered to the physical or electronic addresses stated below, or to updated details notified in writing. Landlord notice email: ${input.parties.landlord.email}. Tenant notice email: ${input.parties.tenant.email}. Any statutory notice must also satisfy applicable legal form and service requirements.`,
          '12.2. The Parties may sign in counterparts or by electronic signature where legally valid. Each Party shall receive a complete copy of the signed Agreement and its schedules.',
        ],
      },
      {
        heading: '13. GENERAL',
        clauses: [
          '13.1. This Agreement and its completed schedules record the Parties’ tenancy terms. Any amendment must be in writing, accepted by both Parties and comply with applicable law.',
          '13.2. If any provision is invalid or unenforceable, the remaining provisions shall continue to apply.',
          '13.3. This Agreement is governed by the laws applicable in Lagos State and the applicable laws of the Federal Republic of Nigeria.',
          '13.4. The Parties confirm that they have read and understood this Agreement, had an opportunity to ask questions and obtain independent advice, and have not relied on any material promise omitted from the written terms.',
        ],
      },
      {
        heading: 'EXECUTION',
        clauses: [
          'IN WITNESS WHEREOF, the Parties have executed this Agreement on the date first written above.',
          `LANDLORD: ${input.parties.landlord.name}. Signature method and date are recorded in the executed agreement record when supplied.`,
          `TENANT: ${input.parties.tenant.name}. Signature method and date are recorded in the executed agreement record when supplied.`,
          'PREPARING LEGAL PRACTITIONER (IF APPLICABLE): name, firm, address, fee note reference and amount must be supplied separately before any related legal fee is collected.',
        ],
      },
    ],
    schedules: [
      {
        heading: 'SCHEDULE 1. PROPERTY AND COST DETAILS',
        clauses: [
          `Property: ${input.premises.title}.`,
          `Address: ${propertyAddress}.`,
          `Property type: ${propertyType}.`,
          `Approved occupants: ${input.occupantsCount}.`,
          `Tenancy period: ${tenancyPeriod}.`,
          `Rent recorded in the Platform booking: ${rent}.`,
          `Caution deposit recorded in the Platform booking: ${caution}.`,
          `Managing agent: ${agent}.`,
          `Amenities recorded in the listing: ${amenities}.`,
          'Shared facilities, utility allocations, building rules and any other agreed charges are those disclosed in the approved listing, booking summary and handover record.',
        ],
      },
      {
        heading: 'SCHEDULE 2. CONDITION AND HANDOVER RECORD',
        clauses: [
          'The Tenant completed the SingleRent move-in condition checklist before this agreement was made available for signature.',
          'The property was approved through that verification workflow. Any photographs, videos, meter readings, keys/access-card record, disclosed defects and repair records remain part of the Platform’s move-in verification record.',
          'For the SingleRent workflow, an eligible tenancy becomes active when the Tenant signs electronically or submits a signed manual PDF after this condition record is approved. This platform status does not alter any signature, witnessing or other formality that applicable law or the Parties separately require.',
        ],
      },
    ],
  };
}

export function agreementPdfLines(terms: RenderedTenancyAgreement, signatures: string[]): string[] {
  return [
    `Agreement reference: ${terms.reference}`,
    ...terms.introductoryParagraphs,
    ...terms.sections.flatMap((section) => [section.heading, ...section.clauses]),
    ...terms.schedules.flatMap((section) => [section.heading, ...section.clauses]),
    'Recorded signatures:',
    ...(signatures.length ? signatures : ['No signatures recorded yet.']),
  ];
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-NG', { day: '2-digit', month: 'long', year: 'numeric' }).format(value);
}

function formatKobo(value: bigint): string {
  return `N${(value / 100n).toLocaleString('en-NG')}`;
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|_)([a-z])/g, (_all, separator: string, character: string) => `${separator ? ' ' : ''}${character.toUpperCase()}`);
}
