"use client";

import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, BedDouble, Building2, CalendarDays, ChevronDown, Home, KeyRound, MapPin, MessageCircle, Search, ShieldCheck, UserRound, Users, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveListings } from "@/features/listings/listing-card";
import { Brand, Img, PublicHeader, Status, type Navigate } from "@/features/app/shell";

export function Landing({ go }: { go: Navigate }) {
  return <>
    <PublicHeader go={go} />
    <div className="landing">
      <section className="hero solo-hero">
        <motion.div className="hero-copy" initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: "easeOut" }}>
          <span className="hero-kicker"><i /> Built for one-person moves, everywhere</span>
          <h1>Your own space.<br /><em>Without the agent wahala.</em></h1>
          <p>SingleRent helps corps members, young professionals and anyone moving solo find verified rooms, studios and shared flats — in the city they are heading to, directly from the people who own them.</p>
          <div className="searchbox"><span><MapPin size={18} /><i>Where are you moving to?<b>Lagos, Abuja, Ibadan, Enugu...</b></i><ChevronDown size={16} /></span><Button onClick={() => go("explore")}><Search size={16} /> Find a room</Button></div>
          <small className="trust"><BadgeCheck size={14} /> Verified listings <ShieldCheck size={14} /> Direct landlord chat <KeyRound size={14} /> Protected payments</small>
        </motion.div>
        <motion.figure initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: "easeOut", delay: 0.12 }}>
          <Img src="/hero-lagos-room.png" alt="Comfortable, modest room in a typical Lagos flat" />
          <div className="move-note"><Status tone="gold">Moving soon?</Status><b>Settle in before your next chapter starts.</b><span>NYSC posting · first job · new city</span></div>
          <div className="float solo-match"><i>SR</i><b>Private room or studio?<small>Filter for the way you live</small></b></div>
        </motion.figure>
      </section>
      <section className="move-reasons" aria-label="Who SingleRent is for">
        <motion.button onClick={() => go("explore")} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}><i><CalendarDays size={18} /></i><span><b>Starting NYSC?</b><small>Find a home near your place of primary assignment.</small></span><ArrowRight size={16} /></motion.button>
        <motion.button onClick={() => go("explore")} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}><i><KeyRound size={18} /></i><span><b>Moving for your first job?</b><small>Choose a space that fits your budget and commute.</small></span><ArrowRight size={16} /></motion.button>
        <motion.button onClick={() => go("sign-up")} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}><i><Building2 size={18} /></i><span><b>Have a room to let?</b><small>Meet verified tenants directly.</small></span><ArrowRight size={16} /></motion.button>
      </section>
      <motion.section className="living-styles" initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.55, ease: "easeOut" }}>
        <div className="living-styles-intro"><small>Choose the way you want to live</small><h2>Not everyone needs a whole apartment.</h2><p>Start with the kind of space that makes sense for this season of your life.</p><Button variant="outline" onClick={() => go("explore")}>Browse all spaces <ArrowRight size={14} /></Button></div>
        <div className="style-options">
          <motion.button whileHover={{ y: -7 }} onClick={() => go("explore")}><i><BedDouble size={22} /></i><span><small>01</small><b>Private rooms</b><p>Your own room in a shared home, with a clearer monthly picture.</p></span><ArrowRight size={16} /></motion.button>
          <motion.button whileHover={{ y: -7 }} onClick={() => go("explore")}><i><Home size={22} /></i><span><small>02</small><b>Self-contained studios</b><p>A compact place to call yours when privacy is the priority.</p></span><ArrowRight size={16} /></motion.button>
          <motion.button whileHover={{ y: -7 }} onClick={() => go("explore")}><i><Users size={22} /></i><span><small>03</small><b>Shared flats</b><p>More space and shared costs, for people open to living together.</p></span><ArrowRight size={16} /></motion.button>
        </div>
      </motion.section>
      <motion.section className="section" initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.16 }} transition={{ duration: 0.55, ease: "easeOut" }}>
        <div className="section-h"><span><small>Move-in ready for one</small><h2>Spaces for wherever your next move takes you</h2></span><Button variant="ghost" onClick={() => go("explore")}>Explore available spaces <ArrowRight size={14} /></Button></div>
        <LiveListings go={go} />
      </motion.section>
      <motion.section className="how" initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.6, ease: "easeOut" }}>
        <div><small>Made for a fresh start</small><h2>From “I’m moving” to “I’m settled” — without the stress.</h2></div>
        <div>{[["01", "Find your kind of space", "Search rooms, studios and shared flats in the neighbourhoods that work for you."], ["02", "Know before you visit", "See clear details, ask the landlord the important questions and avoid wasted trips."], ["03", "Move in with confidence", "Your payment is protected while you confirm the home is right for you."]].map(([number, title, copy]) => <article key={number}><b>{number}</b><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </motion.section>
      <motion.section className="renter-confidence" initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.18 }} transition={{ duration: 0.55, ease: "easeOut" }}>
        <div className="confidence-copy"><small>Less guesswork. More clarity.</small><h2>Renting alone comes with questions. Keep the important answers close.</h2><p>SingleRent keeps the details, conversations and payment journey in one clear place.</p><Button onClick={() => go("explore")}>Start exploring <ArrowRight size={14} /></Button></div>
        <div className="confidence-list"><article><i><BadgeCheck size={19} /></i><span><b>Verified listing signals</b><p>Know which homes and hosts have passed the platform’s checks.</p></span></article><article><i><MessageCircle size={19} /></i><span><b>Questions before the journey</b><p>Get the practical details before you spend on transport or inspections.</p></span></article><article><i><WalletCards size={19} /></i><span><b>A clearer payment path</b><p>See what you are paying for and move forward with protection.</p></span></article></div>
      </motion.section>
      <motion.section className="benefits" initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.55, ease: "easeOut" }}>
        <article><i><UserRound /></i><small>For tenants</small><h3>Find your place, not just any place.</h3><p>Start with a room or flat that suits your budget, commute and next chapter — without agent pressure.</p><button onClick={() => go("sign-up")}>Find your space <ArrowRight size={14} /></button></article>
        <article><i><Building2 /></i><small>For landlords</small><h3>Let your spare room with more certainty.</h3><p>Present your space clearly, speak to verified tenants and retain control of your listing.</p><button onClick={() => go("sign-up")}>List your space <ArrowRight size={14} /></button></article>
      </motion.section>
      <footer><Brand go={go} /><span>Renting in Nigeria, made more direct.</span><span>© 2026 SingleRent</span></footer>
    </div>
  </>;
}
