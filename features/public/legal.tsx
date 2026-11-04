"use client";

import { ArrowLeft, FileText, LockKeyhole } from "lucide-react";
import { PublicHeader, type Navigate } from "@/features/app/shell";
import { privacySections, termsSections } from "@/features/public/legal-content";
import { SiteFooter } from "@/features/public/site-footer";
import "./legal.css";

type LegalPageProps = {
  go: Navigate;
  kind: "terms" | "privacy";
};

export function LegalPage({ go, kind }: LegalPageProps) {
  const isTerms = kind === "terms";
  const sections = isTerms ? termsSections : privacySections;
  const Icon = isTerms ? FileText : LockKeyhole;
  const title = isTerms ? "Terms of use" : "Privacy policy";
  const description = isTerms
    ? "The terms that govern use of SingleRent's website, mobile application and related services."
    : "How SingleRent collects, uses, shares and protects personal data.";

  return <>
    <PublicHeader go={go} />
    <main className="legal-page">
      <button className="legal-back" type="button" onClick={() => go("home")}><ArrowLeft size={16} /> Back to home</button>
      <section className="legal-hero">
        <span><Icon size={18} /> SingleRent</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <small>Operator: SINGLE RENTS LIMITED</small>
      </section>
      <section className="legal-content" aria-label={title}>
        {sections.map((section, index) => <article key={section.title}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
          </div>
        </article>)}
      </section>
    </main>
    <SiteFooter go={go} />
  </>;
}
