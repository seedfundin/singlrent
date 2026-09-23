"use client";

import { useState } from "react";
import { AccessGate } from "@/features/app/access-gate";
import { useAppNavigation } from "@/features/app/app-provider";
import { Landing } from "@/features/public/landing";
import { ExploreHomes, ListingDetails } from "@/features/listings/pages";

export function HomePage() {
  const { go } = useAppNavigation();
  return <Landing go={go} />;
}

export function HomesPage() {
  const { go } = useAppNavigation();
  return <ExploreHomes go={go} />;
}

export function HomeDetailsPage() {
  const { go } = useAppNavigation();
  const [gateOpen, setGateOpen] = useState(false);
  return <><ListingDetails go={go} gate={() => setGateOpen(true)} /><AccessGate open={gateOpen} onOpenChange={setGateOpen} go={go} /></>;
}
