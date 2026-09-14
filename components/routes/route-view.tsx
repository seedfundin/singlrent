'use client';

import { SingleRentApp } from '@/features/app/single-rent-app';
import type { View } from '@/lib/routes';

export function RouteView({ view }: { view: View }) {
  return <SingleRentApp initialView={view} />;
}
