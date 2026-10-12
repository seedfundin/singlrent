"use client";

import { ArrowLeft, FileText, LockKeyhole } from "lucide-react";
import { PublicHeader, type Navigate } from "@/features/app/shell";
import { SiteFooter } from "@/features/public/site-footer";

type LegalPageProps = {
  go: Navigate;
  kind: "terms" | "privacy";
};

const termsSections = [
  {
    title: "Using SingleRent",
    body: "SingleRent helps tenants, landlords and agents discover homes, exchange property questions and manage rental steps in one place. A listing, enquiry or application does not by itself guarantee availability, approval or a completed tenancy.",
  },
  {
    title: "Accounts and listings",
    body: "Keep your account information accurate and protect your sign-in details. Hosts are responsible for truthful listing details, media, pricing and property availability. Where required, a host must complete publisher verification before submitting a listing for review.",
  },
  {
    title: "Payments and transaction records",
    body: "When a payment is made through SingleRent, the platform records a SingleRent transaction reference and the related payment-provider reference. Use the in-app payment flow and keep these references when you need support or need to report a problem.",
  },
  {
    title: "Respect and safety",
    body: "Do not use the platform for fraud, harassment, misleading listings or attempts to move protected payments off-platform. Report a concern promptly when a listing, conversation or transaction does not look right.",
  },
];

const privacySections = [
  {
    title: "Information used to run the service",
    body: "SingleRent uses the details you provide for your account, listings, enquiries, applications and rental activity so the platform can deliver the services you request and keep the relevant people informed.",
  },
  {
    title: "Property and location information",
    body: "Hosts may provide a property address and the final map position for a listing. That saved location is used to show renters where a property is; it is not repeatedly searched just to display the listing.",
  },
  {
    title: "Verification and payments",
    body: "Where identity verification or payment is needed, the relevant information is processed through the platform's verification and payment providers. SingleRent keeps the status and transaction references needed to operate and audit the rental flow.",
  },
  {
    title: "Your choices",
    body: "You can review the information in your account and use the in-app reporting tools if you believe information or activity is incorrect. Do not share passwords, verification codes or payment credentials with another user.",
  },
];

export function LegalPage({ go, kind }: LegalPageProps) {
  const isTerms = kind === "terms";
  const sections = isTerms ? termsSections : privacySections;
  const Icon = isTerms ? FileText : LockKeyhole;

  return <>
    <PublicHeader go={go} />
    <main className="legal-page">
      <button className="legal-back" type="button" onClick={() => go("home")}><ArrowLeft size={16} /> Back to home</button>
      <section className="legal-hero">
        <span><Icon size={18} /> SingleRent</span>
        <h1>{isTerms ? "Terms of use" : "Privacy notice"}</h1>
        <p>{isTerms ? "The shared expectations for using SingleRent safely and clearly." : "A plain-language summary of the information used to make SingleRent work."}</p>
        <small>Last updated: 9 October 2026</small>
      </section>
      <section className="legal-content" aria-label={isTerms ? "Terms of use" : "Privacy notice"}>
        {sections.map((section, index) => <article key={section.title}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div><h2>{section.title}</h2><p>{section.body}</p></div>
        </article>)}
      </section>
    </main>
    <SiteFooter go={go} />
  </>;
}
