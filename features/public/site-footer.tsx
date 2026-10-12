"use client";

import { BadgeCheck, Building2, Landmark, MessageCircle, ShieldCheck } from "lucide-react";
import { Brand, type Navigate } from "@/features/app/shell";

type SiteFooterProps = {
  go: Navigate;
};

function moveToSection(id: string, fallback: () => void) {
  const section = document.getElementById(id);

  if (section) {
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  fallback();
}

export function SiteFooter({ go }: SiteFooterProps) {
  const goHomeAndShow = (id: string) => {
    if (document.getElementById(id)) {
      moveToSection(id, () => go("home"));
      return;
    }

    go("home");
  };

  return (
    <footer className="site-footer">
      <div className="site-footer-main">
        <section className="site-footer-intro" aria-label="About SingleRent">
          <Brand go={go} />
          <p>A clearer way to find, ask about and rent your next home — directly with the people who manage it.</p>
          <div className="site-footer-trust" aria-label="SingleRent platform features">
            <span><BadgeCheck size={15} /> Listing signals</span>
            <span><ShieldCheck size={15} /> Payment protection</span>
            <span><MessageCircle size={15} /> Direct questions</span>
          </div>
        </section>

        <nav aria-label="Find a home">
          <h2>Find a home</h2>
          <button type="button" onClick={() => go("explore")}>Browse homes</button>
          <button type="button" onClick={() => goHomeAndShow("how-it-works")}>How it works</button>
          <button type="button" onClick={() => go("sign-up")}>Create an account</button>
        </nav>

        <nav aria-label="For hosts">
          <h2>For hosts</h2>
          <button type="button" onClick={() => go("sign-up")}><Building2 size={14} /> List a property</button>
          <button type="button" onClick={() => go("publisher-verification")}>Publisher verification</button>
          <button type="button" onClick={() => go("assistant")}>Property assistant</button>
        </nav>

        <nav aria-label="Support and legal">
          <h2>Support &amp; legal</h2>
          <button type="button" onClick={() => goHomeAndShow("trust-and-safety")}><Landmark size={14} /> Trust &amp; safety</button>
          <button type="button" onClick={() => go("terms")}>Terms of use</button>
          <button type="button" onClick={() => go("privacy")}>Privacy notice</button>
        </nav>
      </div>

      <div className="site-footer-bottom">
        <span>© {new Date().getFullYear()} SingleRent. All rights reserved.</span>
        <span>Built for better moves across Nigeria.</span>
      </div>
    </footer>
  );
}
