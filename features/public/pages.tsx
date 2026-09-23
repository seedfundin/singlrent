"use client";

import { useState } from "react";
import { AccessGate } from "@/features/app/access-gate";
import { useAppNavigation } from "@/features/app/app-provider";
import { ExploreHomesScreen, HomeScreen, ListingDetailsScreen } from "@/features/app/single-rent-app";

export function HomePage() {
  const { go } = useAppNavigation();
  return <HomeScreen go={go} />;
}

export function HomesPage() {
  const { go } = useAppNavigation();
  return <ExploreHomesScreen go={go} />;
}

export function HomeDetailsPage() {
  const { go } = useAppNavigation();
  const [gateOpen, setGateOpen] = useState(false);
  return <><ListingDetailsScreen go={go} gate={() => setGateOpen(true)} /><AccessGate open={gateOpen} onOpenChange={setGateOpen} go={go} /></>;
}
