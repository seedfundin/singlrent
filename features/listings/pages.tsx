"use client";

import { useEffect, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bath,
  BedDouble,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  Clock3,
  Grid2X2,
  Heart,
  House,
  Map,
  MapPin,
  MessageCircle,
  Search,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/features/app/app-provider";
import { api, type ApiListing } from "@/lib/api";
import { formatNaira } from "@/lib/pricing";
import {
  Back,
  PublicHeader,
  Status,
  type Navigate,
} from "@/features/app/shell";
import {
  ListingCard,
  ListingPhoto,
  listingImages,
  listingLocation,
  listingVideo,
  nairaFromKobo,
} from "@/features/listings/listing-card";
import {
  GooglePropertyMap,
  type PropertyCoordinates,
} from "@/features/maps/google-property-map";
import "@/features/maps/google-listings-map.css";

const GoogleStreetView = dynamic(
  () => import("@/features/maps/google-street-view"),
  {
    ssr: false,
    loading: () => (
      <div className="street-view-message">Loading Street View…</div>
    ),
  },
);

const GoogleListingsMap = dynamic(
  () => import("@/features/maps/google-listings-map"),
  { ssr: false, loading: () => <div className="map listing-map-unavailable"><Clock3 size={22} /><p>Loading map…</p></div> },
);

function listingCoordinates(listing: ApiListing): PropertyCoordinates | null {
  const latitude = Number(listing.latitude);
  const longitude = Number(listing.longitude);
  return Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
    ? { latitude, longitude }
    : null;
}

type LocationView = "map" | "street-view" | null;

function PropertyLocation({
  coordinates,
  view,
  onViewChange,
}: {
  coordinates: PropertyCoordinates | null;
  view: LocationView;
  onViewChange: (view: Exclude<LocationView, null>) => void;
}) {
  return (
    <section className="tenant-location">
      <h2>Property location</h2>
      <p className="bodycopy">
        The map pin is the final location selected by the landlord when the
        listing was created.
      </p>
      {!coordinates ? (
        <div className="location-unavailable">
          <MapPin size={21} />
          <span>
            <b>Map pin not available yet</b>
            <small>
              This listing was created without a final location pin. The
              landlord needs to update its location before a map can be shown.
            </small>
          </span>
        </div>
      ) : view ? (
        <>
          <div
            className="location-tabs"
            role="tablist"
            aria-label="Property location view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === "map"}
              className={view === "map" ? "active" : ""}
              onClick={() => onViewChange("map")}
            >
              Map
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "street-view"}
              className={view === "street-view" ? "active" : ""}
              onClick={() => onViewChange("street-view")}
            >
              Street View
            </button>
          </div>
          {view === "map" ? (
            <GooglePropertyMap value={coordinates} />
          ) : (
            <GoogleStreetView coordinates={coordinates} />
          )}
        </>
      ) : (
        <div className="location-launcher">
          <MapPin size={21} />
          <span>
            <b>See the exact property area</b>
            <small>
              The map loads only when you request it, helping keep map usage
              costs down.
            </small>
          </span>
          <div>
            <Button type="button" size="sm" onClick={() => onViewChange("map")}>
              <Map size={14} /> View map
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onViewChange("street-view")}
            >
              View Street View
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export function ExploreHomes({ go }: { go: Navigate }) {
  // The map is opt-in. Listing cards load first and no Google map request is
  // made until the visitor explicitly selects Map.
  const [map, setMap] = useState(false);
  const [areaInput, setAreaInput] = useState("");
  const [area, setArea] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [listings, setListings] = useState<ApiListing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.listings
      .search({
        pageSize: 12,
        area: area || undefined,
        bedrooms: bedrooms ? Number(bedrooms) : undefined,
      })
      .then((response) => {
        if (active) {
          setListings(response.items);
          setTotal(response.meta.total);
        }
      })
      .catch(
        (cause: unknown) =>
          active &&
          setError(
            cause instanceof Error ? cause.message : "Unable to load homes.",
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [area, bedrooms]);
  const search = (event: FormEvent) => {
    event.preventDefault();
    setArea(areaInput.trim());
  };
  return (
    <>
      <PublicHeader go={go} />
      <div className="public explore">
        <div className="top">
          <span>
            <small>Explore homes</small>
            <h1>Find your next space</h1>
            <p>
              {loading
                ? "Searching homes…"
                : `${total} ${total === 1 ? "home" : "homes"} available now`}
            </p>
          </span>
          <Button variant="outline" onClick={() => go("home")}>
            <ArrowLeft size={14} /> Back home
          </Button>
        </div>
        <form className="filters" onSubmit={search}>
          <label className="listing-filter-field">
            <MapPin size={15} />
            <input
              value={areaInput}
              onChange={(event) => setAreaInput(event.target.value)}
              placeholder="Search city or area"
              aria-label="Search by city or area"
            />
          </label>
          <label className="listing-filter-field">
            <BedDouble size={15} />
            <select
              value={bedrooms}
              onChange={(event) => setBedrooms(event.target.value)}
              aria-label="Number of bedrooms"
            >
              <option value="">Any bedrooms</option>
              {[0, 1, 2, 3, 4].map((count) => (
                <option key={count} value={count}>
                  {count === 0
                    ? "Studio"
                    : `${count} ${count === 1 ? "bedroom" : "bedrooms"}`}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" size="sm">
            <Search size={14} /> Search
          </Button>
          <span>
            <button
              type="button"
              className={!map ? "on" : ""}
              onClick={() => setMap(false)}
            >
              <Grid2X2 size={14} /> List
            </button>
            <button
              type="button"
              className={map ? "on" : ""}
              onClick={() => setMap(true)}
            >
              <Map size={14} /> Map
            </button>
          </span>
        </form>
        <div className="search-layout">
          <section>
            <p className="sort">
              <b>Available listings</b>
              {area && <i>{area} ×</i>}
            </p>
            {loading ? (
              <div className="listing-state">
                <Clock3 size={17} /> Loading homes…
              </div>
            ) : error ? (
              <div className="listing-state error">
                <CircleAlert size={17} /> {error}
              </div>
            ) : listings.length ? (
              <div className="results">
                {listings.map((listing) => (
                  <ListingCard key={listing.id} go={go} listing={listing} />
                ))}
              </div>
            ) : (
              <div className="listing-state">
                <House size={17} /> No homes match this search yet.
              </div>
            )}
          </section>
          {map && (
            <aside className="map listing-map-live">
              <div className="map-heading"><span><Map size={18} /><b>Available homes on the map</b></span><Button variant="ghost" size="sm" onClick={() => setMap(false)}>Hide map</Button></div>
              {loading ? <div className="listing-state"><Clock3 size={17} /> Loading homes…</div> : error ? <div className="listing-state error"><CircleAlert size={17} /> {error}</div> : <GoogleListingsMap listings={listings} onSelect={(listing) => go("listing", { listing: listing.id })} />}
            </aside>
          )}
        </div>
      </div>
    </>
  );
}

export function ListingDetails({
  go,
  onSignInRequired,
}: {
  go: Navigate;
  onSignInRequired: () => void;
}) {
  const { session } = useAppSession();
  const searchParams = useSearchParams();
  const listingId = searchParams.get("listing");
  const [listing, setListing] = useState<ApiListing | null>(null);
  const [loading, setLoading] = useState(Boolean(listingId));
  const [error, setError] = useState<string | null>(
    listingId
      ? null
      : "Choose a home from Explore homes to view its details.",
  );
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // Maps are deliberately opt-in: mounting either component starts a Google Maps request.
  const [locationView, setLocationView] = useState<LocationView>(null);
  const images = listing ? listingImages(listing) : [];
  const video = listing ? listingVideo(listing) : undefined;
  useEffect(() => {
    if (!listingId) return;
    let active = true;
    setLoading(true);
    setError(null);
    setLocationView(null);
    api.listings
      .detail(listingId)
      .then((response) => active && setListing(response))
      .catch(
        (cause: unknown) =>
          active &&
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load this home.",
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
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
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to update your saved homes.",
      );
    } finally {
      setSaving(false);
    }
  };
  // Asking questions is not a transaction. A signed-in user can go straight to
  // the property conversation; an unauthenticated visitor only needs to sign
  // in (and never complete KYC) before doing so.
  const openPropertyConversation = (mode: "ai" | "landlord") => {
    if (!session) {
      onSignInRequired();
      return;
    }
    if (!listing) return;
    go("assistant", { listing: listing.id, mode });
  };
  return (
    <>
      <PublicHeader go={go} />
      <div className="public listing">
        <div className="top">
          <Back go={go} to="explore" />
          <span>
            <Button variant="outline" size="icon">
              <Heart size={16} />
            </Button>
            <Button variant="outline" size="icon">
              <Upload size={16} />
            </Button>
          </span>
        </div>
        {loading ? (
          <div className="listing-state">
            <Clock3 size={17} /> Loading this home…
          </div>
        ) : error ? (
          <div className="listing-state error">
            <CircleAlert size={17} /> {error}
          </div>
        ) : (
          listing && (
            <>
              <section className="gallery">
                <div>
                  <ListingPhoto listing={listing} />
                  <button>
                    <Grid2X2 size={14} /> View all {images.length} photos
                  </button>
                </div>
                <div>
                  {images[1] ? (
                    <img
                      className="img"
                      src={images[1].url}
                      alt={images[1].altText ?? listing.title}
                    />
                  ) : (
                    <ListingPhoto listing={listing} />
                  )}
                  <span>
                    {images[2] ? (
                      <img
                        className="img"
                        src={images[2].url}
                        alt={images[2].altText ?? listing.title}
                      />
                    ) : (
                      <ListingPhoto listing={listing} />
                    )}
                    <button>
                      <Video size={14} />{" "}
                      {video ? "Video tour included" : "Property photos"}
                    </button>
                  </span>
                </div>
              </section>
              <div className="detail-layout">
                <article>
                  <div className="title">
                    <span>
                      <Status>
                        <BadgeCheck size={12} /> Listed home
                      </Status>
                      <h1>{listing.title}</h1>
                      <p>
                        <MapPin size={15} /> {listing.address},{" "}
                        {listingLocation(listing)}
                      </p>
                    </span>
                    <button
                      onClick={toggleSave}
                      disabled={saving}
                      aria-label={
                        saved ? "Remove from saved homes" : "Save home"
                      }
                    >
                      <Heart size={18} fill={saved ? "currentColor" : "none"} />
                    </button>
                  </div>
                  <div className="facts">
                    <span>
                      <BedDouble />
                      <b>
                        {listing.bedrooms}
                        <small>Bedrooms</small>
                      </b>
                    </span>
                    <span>
                      <Bath />
                      <b>
                        {listing.bathrooms}
                        <small>Bathrooms</small>
                      </b>
                    </span>
                    <span>
                      <House />
                      <b>
                        {listing.propertyType.toLowerCase()}
                        <small>Property type</small>
                      </b>
                    </span>
                    <span>
                      <CalendarDays />
                      <b>
                        {listing.availability === "AVAILABLE"
                          ? "Now"
                          : listing.availability.toLowerCase()}
                        <small>Availability</small>
                      </b>
                    </span>
                  </div>
                  <PropertyLocation
                    coordinates={listingCoordinates(listing)}
                    view={locationView}
                    onViewChange={setLocationView}
                  />
                  <h2>About this home</h2>
                  <p className="bodycopy">{listing.description}</p>
                  <h2>What this home offers</h2>
                  {listing.amenities.length ? (
                    <div className="amenities">
                      {listing.amenities.map((amenity) => (
                        <span key={amenity}>
                          <CircleCheck size={15} /> {amenity}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="bodycopy">
                      The landlord has not added amenities yet.
                    </p>
                  )}
                  {video && (
                    <section className="listing-video">
                      <h2>Video tour</h2>
                      <video controls preload="metadata" src={video.url}>
                        Your browser cannot play this property video.
                      </video>
                    </section>
                  )}
                  <div className="host">
                    <i>{`${listing.landlord.firstName.charAt(0)}${listing.landlord.lastName.charAt(0)}`}</i>
                    <span>
                      <small>Listed by</small>
                      <b>
                        {listing.landlord.firstName} {listing.landlord.lastName}
                      </b>
                      <small>
                        {listing.source === "AGENT"
                          ? "Managed by an agent"
                          : "Direct landlord listing"}
                      </small>
                    </span>
                    <Button variant="outline" onClick={() => openPropertyConversation("landlord")}>
                      <MessageCircle size={14} /> Ask landlord
                    </Button>
                  </div>
                </article>
                <aside className="rent">
                  <b>
                    {formatNaira(nairaFromKobo(listing.annualRentKobo))}{" "}
                    <small>/ year</small>
                  </b>
                  <p>
                    {formatNaira(nairaFromKobo(listing.annualRentKobo) / 12)}{" "}
                    monthly equivalent
                  </p>
                  <hr />
                  <span>
                    Property is available{" "}
                    <Status
                      tone={
                        listing.availability === "AVAILABLE" ? "green" : "slate"
                      }
                    >
                      {listing.availability.toLowerCase()}
                    </Status>
                  </span>
                  <Button
                    onClick={() => session ? go("apply", { listing: listing.id }) : onSignInRequired()}
                    disabled={listing.availability !== "AVAILABLE"}
                  >
                    Rent this home <ArrowRight size={15} />
                  </Button>
                  <Button variant="outline" onClick={() => openPropertyConversation("ai")}>
                    <Sparkles size={15} /> Ask about this home
                  </Button>
                  <small>
                    <CircleCheck size={14} /> Secure rent payment held in escrow
                  </small>
                </aside>
              </div>
            </>
          )
        )}
      </div>
    </>
  );
}
