"use client";

import { useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, Bath, BedDouble, CircleAlert, Clock3, Heart, House, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/features/app/app-provider";
import { Status, type Navigate } from "@/features/app/shell";
import { api, type ApiListing } from "@/lib/api";
import { formatNaira } from "@/lib/pricing";
import { viewPaths } from "@/lib/routes";

export function nairaFromKobo(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount / 100 : 0;
}

export function listingLocation(listing: ApiListing) {
  return `${listing.area}, ${listing.state}`;
}

export function listingImages(listing: ApiListing) {
  return listing.media.filter((item) => item.mediaType === "IMAGE").sort((left, right) => left.position - right.position);
}

export function listingVideo(listing: ApiListing) {
  return listing.media.find((item) => item.mediaType === "VIDEO");
}

export function ListingPhoto({ listing, className }: { listing: ApiListing; className?: string }) {
  const image = listingImages(listing)[0];
  if (image) return <img className={className ?? "img"} src={image.url} alt={image.altText ?? listing.title} />;
  return <div className={`${className ?? "img"} listing-photo-empty`} aria-label="No property photo uploaded"><House size={28} /><small>Photo coming soon</small></div>;
}

export function ListingCard({
  go,
  listing,
  short = false,
  initiallySaved = false,
}: {
  go: Navigate;
  listing: ApiListing;
  short?: boolean;
  initiallySaved?: boolean;
}) {
  const router = useRouter();
  const { session } = useAppSession();
  const [saved, setSaved] = useState(initiallySaved);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const toggleSave = async () => {
    if (!session) return go("sign-in");
    setSaving(true);
    setSaveError(null);
    try {
      if (saved) await api.listings.unsave(session.accessToken, listing.id);
      else await api.listings.save(session.accessToken, listing.id);
      setSaved(!saved);
    } catch (cause: unknown) {
      setSaveError(cause instanceof Error ? cause.message : "Unable to update saved homes.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <article className="property-card">
      <div className="property-pic">
        <ListingPhoto listing={listing} />
        <Status><BadgeCheck size={12} /> Listed</Status>
        <button className="save" onClick={toggleSave} disabled={saving} aria-label={saved ? `Remove ${listing.title} from saved homes` : `Save ${listing.title}`}><Heart size={15} fill={saved ? "currentColor" : "none"} /></button>
      </div>
      <div className="property-text">
        <b>{formatNaira(nairaFromKobo(listing.annualRentKobo))} / year</b>
        <h3>{listing.title}</h3>
        <p><MapPin size={13} />{listingLocation(listing)}</p>
        <div className="spec"><span><BedDouble size={14} />{listing.bedrooms} {listing.bedrooms === 1 ? "bed" : "beds"}</span><span><Bath size={14} />{listing.bathrooms} {listing.bathrooms === 1 ? "bath" : "baths"}</span><span>{listing.propertyType.toLowerCase()}</span></div>
        {saveError && <small className="listing-card-error">{saveError}</small>}
        {!short && <Button variant="outline" onClick={() => router.push(`${viewPaths.listing}?listing=${encodeURIComponent(listing.id)}`)}>View home <ArrowRight size={14} /></Button>}
      </div>
    </article>
  );
}

export function LiveListings({
  go,
  limit = 3,
  compact = false,
  className = "cards",
}: {
  go: Navigate;
  limit?: number;
  compact?: boolean;
  className?: string;
}) {
  const [listings, setListings] = useState<ApiListing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api.listings.search({ pageSize: limit })
      .then((response) => active && setListings(response.items))
      .catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : "Unable to load homes."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [limit]);
  if (loading) return <div className="listing-state"><Clock3 size={17} /> Loading homes…</div>;
  if (error) return <div className="listing-state error"><CircleAlert size={17} /> {error}</div>;
  if (!listings.length) return <div className="listing-state"><House size={17} /> No homes are available yet.</div>;
  return <div className={className}>{listings.map((listing) => <motion.div key={listing.id} whileHover={{ y: -6 }} transition={{ duration: 0.2 }}><ListingCard go={go} listing={listing} short={compact} /></motion.div>)}</div>;
}
