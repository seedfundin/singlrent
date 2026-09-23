"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, BadgeCheck, Bath, BedDouble, CalendarDays, CircleAlert, CircleCheck, Clock3, Grid2X2, Heart, House, Map, MapPin, MessageCircle, Search, Sparkles, Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/features/app/app-provider";
import { api, type ApiListing } from "@/lib/api";
import { formatNaira } from "@/lib/pricing";
import { Back, PublicHeader, Status, type Navigate } from "@/features/app/shell";
import { ListingCard, ListingPhoto, listingLocation, nairaFromKobo } from "@/features/listings/listing-card";

export function ExploreHomes({ go }: { go: Navigate }) {
  const [map, setMap] = useState(true);
  const [areaInput, setAreaInput] = useState("");
  const [area, setArea] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [listings, setListings] = useState<ApiListing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    api.listings.search({ pageSize: 12, area: area || undefined, bedrooms: bedrooms ? Number(bedrooms) : undefined })
      .then((response) => { if (active) { setListings(response.items); setTotal(response.meta.total); } })
      .catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : "Unable to load homes."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [area, bedrooms]);
  const search = (event: FormEvent) => { event.preventDefault(); setArea(areaInput.trim()); };
  return <>
    <PublicHeader go={go} />
    <div className="public explore">
      <div className="top"><span><small>Explore homes</small><h1>Find your next space</h1><p>{loading ? "Searching verified homes…" : `${total} verified ${total === 1 ? "home" : "homes"} available now`}</p></span><Button variant="outline" onClick={() => go("home")}><ArrowLeft size={14} /> Back home</Button></div>
      <form className="filters" onSubmit={search}>
        <label className="listing-filter-field"><MapPin size={15} /><input value={areaInput} onChange={(event) => setAreaInput(event.target.value)} placeholder="Search city or area" aria-label="Search by city or area" /></label>
        <label className="listing-filter-field"><BedDouble size={15} /><select value={bedrooms} onChange={(event) => setBedrooms(event.target.value)} aria-label="Number of bedrooms"><option value="">Any bedrooms</option>{[0, 1, 2, 3, 4].map((count) => <option key={count} value={count}>{count === 0 ? "Studio" : `${count} ${count === 1 ? "bedroom" : "bedrooms"}`}</option>)}</select></label>
        <Button type="submit" size="sm"><Search size={14} /> Search</Button>
        <span><button type="button" className={!map ? "on" : ""} onClick={() => setMap(false)}><Grid2X2 size={14} /> List</button><button type="button" className={map ? "on" : ""} onClick={() => setMap(true)}><Map size={14} /> Map</button></span>
      </form>
      <div className="search-layout"><section><p className="sort"><b>Verified listings</b>{area && <i>{area} ×</i>}</p>{loading ? <div className="listing-state"><Clock3 size={17} /> Loading verified homes…</div> : error ? <div className="listing-state error"><CircleAlert size={17} /> {error}</div> : listings.length ? <div className="results">{listings.map((listing) => <ListingCard key={listing.id} go={go} listing={listing} />)}</div> : <div className="listing-state"><House size={17} /> No verified homes match this search yet.</div>}</section>
      {map && listings.length > 0 && <aside className="map"><div className="road r1" /><div className="road r2" />{listings.slice(0, 3).map((listing, index) => <b className={`pin ${["a", "b", "c"][index]}`} key={listing.id}>{formatNaira(nairaFromKobo(listing.annualRentKobo))}</b>)}<div className="map-card"><ListingPhoto listing={listings[0]} /><span><Status><BadgeCheck size={11} /> Verified</Status><b>{listings[0].title}</b><small>{formatNaira(nairaFromKobo(listings[0].annualRentKobo))} / yr</small></span></div></aside>}</div>
    </div>
  </>;
}

export function ListingDetails({ go, gate }: { go: Navigate; gate: () => void }) {
  const { session } = useAppSession();
  const searchParams = useSearchParams();
  const listingId = searchParams.get("listing");
  const [listing, setListing] = useState<ApiListing | null>(null);
  const [loading, setLoading] = useState(Boolean(listingId));
  const [error, setError] = useState<string | null>(listingId ? null : "Choose a verified home from Explore homes to view its details.");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!listingId) return;
    let active = true; setLoading(true); setError(null);
    api.listings.detail(listingId).then((response) => active && setListing(response)).catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : "Unable to load this home.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [listingId]);
  const toggleSave = async () => {
    if (!listing) return;
    if (!session) {
      go("sign-in");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (saved) await api.listings.unsave(session.accessToken, listing.id);
      else await api.listings.save(session.accessToken, listing.id);
      setSaved((value) => !value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update your saved homes.");
    } finally {
      setSaving(false);
    }
  };
  return <>
    <PublicHeader go={go} />
    <div className="public listing"><div className="top"><Back go={go} to="explore" /><span><Button variant="outline" size="icon"><Heart size={16} /></Button><Button variant="outline" size="icon"><Upload size={16} /></Button></span></div>
      {loading ? <div className="listing-state"><Clock3 size={17} /> Loading this verified home…</div> : error ? <div className="listing-state error"><CircleAlert size={17} /> {error}</div> : listing && <>
        <section className="gallery"><div><ListingPhoto listing={listing} /><button><Grid2X2 size={14} /> View all {listing.images.length} photos</button></div><div>{listing.images[1] ? <img className="img" src={listing.images[1].url} alt={listing.images[1].altText ?? listing.title} /> : <ListingPhoto listing={listing} />}<span>{listing.images[2] ? <img className="img" src={listing.images[2].url} alt={listing.images[2].altText ?? listing.title} /> : <ListingPhoto listing={listing} />}<button><Video size={14} /> Property photos</button></span></div></section>
        <div className="detail-layout"><article><div className="title"><span><Status><BadgeCheck size={12} /> Verified home</Status><h1>{listing.title}</h1><p><MapPin size={15} /> {listing.address}, {listingLocation(listing)}</p></span><button onClick={toggleSave} disabled={saving} aria-label={saved ? "Remove from saved homes" : "Save home"}><Heart size={18} fill={saved ? "currentColor" : "none"} /></button></div>
          <div className="facts"><span><BedDouble /><b>{listing.bedrooms}<small>Bedrooms</small></b></span><span><Bath /><b>{listing.bathrooms}<small>Bathrooms</small></b></span><span><House /><b>{listing.propertyType.toLowerCase()}<small>Property type</small></b></span><span><CalendarDays /><b>{listing.availability === "AVAILABLE" ? "Now" : listing.availability.toLowerCase()}<small>Availability</small></b></span></div>
          <h2>About this home</h2><p className="bodycopy">{listing.description}</p><h2>What this home offers</h2>{listing.amenities.length ? <div className="amenities">{listing.amenities.map((amenity) => <span key={amenity}><CircleCheck size={15} /> {amenity}</span>)}</div> : <p className="bodycopy">The landlord has not added amenities yet.</p>}
          <div className="host"><i>{`${listing.landlord.firstName.charAt(0)}${listing.landlord.lastName.charAt(0)}`}</i><span><small>Listed by</small><b>{listing.landlord.firstName} {listing.landlord.lastName}</b><small>{listing.source === "AGENT" ? "Managed by an agent" : "Direct landlord listing"}</small></span><Button variant="outline" onClick={gate}><MessageCircle size={14} /> Ask landlord</Button></div>
        </article><aside className="rent"><b>{formatNaira(nairaFromKobo(listing.annualRentKobo))} <small>/ year</small></b><p>{formatNaira(nairaFromKobo(listing.annualRentKobo) / 12)} monthly equivalent</p><hr /><span>Property is available <Status tone={listing.availability === "AVAILABLE" ? "green" : "slate"}>{listing.availability.toLowerCase()}</Status></span><Button onClick={() => go("apply")} disabled={listing.availability !== "AVAILABLE"}>Rent this home <ArrowRight size={15} /></Button><Button variant="outline" onClick={gate}><Sparkles size={15} /> Ask Property AI</Button><small><CircleCheck size={14} /> Secure rent payment held in escrow</small></aside></div>
      </>}
    </div>
  </>;
}
