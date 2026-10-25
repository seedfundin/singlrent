"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleAlert, CircleCheck, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Shell, Status } from "@/features/app/shell";
import { useAppSession } from "@/features/app/app-provider";
import { InspectionSettings } from "@/features/inspections/inspections";
import { GoogleAddressAutocomplete } from "@/features/maps/google-address-autocomplete";
import { GooglePropertyMap, type PropertyCoordinates } from "@/features/maps/google-property-map";
import { ApiFieldError } from "@/features/forms/api-field-error";
import { api, apiFieldErrors, apiFormError, type ApiFieldErrors, type ApiListing } from "@/lib/api";
import type { View } from "@/lib/routes";
import "./listing-editor.css";

type Manager = "landlord" | "agent";
type Go = (view: View, query?: Record<string, string>) => void;
type ListingForm = {
  title: string;
  propertyType: ApiListing["propertyType"];
  annualRent: string;
  serviceCharge: string;
  cautionFee: string;
  state: string;
  area: string;
  address: string;
  bedrooms: number;
  bathrooms: number;
  description: string;
  amenities: string[];
  availableFrom: string;
  minimumLeaseMonths: number;
};

const amenityOptions = ["24/7 power backup", "Treated water", "Parking", "CCTV", "Gym", "Pet friendly"];
const propertyTypes: ApiListing["propertyType"][] = ["APARTMENT", "HOUSE", "DUPLEX", "STUDIO", "ROOM", "OTHER"];
const listingFieldAliases = {
  annualRentKobo: "annualRent",
  serviceChargeKobo: "serviceCharge",
  cautionFeeKobo: "cautionFee",
  minimumLeaseMonths: "minimumLeaseMonths",
  latitude: "location",
  longitude: "location",
};

function nairaFromKobo(value: string) {
  const kobo = Number(value);
  return Number.isFinite(kobo) ? String(Math.round(kobo / 100)) : "0";
}

function formFromListing(listing: ApiListing): ListingForm {
  return {
    title: listing.title,
    propertyType: listing.propertyType,
    annualRent: nairaFromKobo(listing.annualRentKobo),
    serviceCharge: nairaFromKobo(listing.serviceChargeKobo),
    cautionFee: nairaFromKobo(listing.cautionFeeKobo),
    state: listing.state,
    area: listing.area,
    address: listing.address,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    description: listing.description,
    amenities: listing.amenities,
    availableFrom: listing.availableFrom?.slice(0, 10) ?? "",
    minimumLeaseMonths: listing.minimumLeaseMonths,
  };
}

function coordinatesFromListing(listing: ApiListing): PropertyCoordinates | null {
  const latitude = Number(listing.latitude);
  const longitude = Number(listing.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    ? { latitude, longitude }
    : null;
}

function localListingErrors(form: ListingForm, coordinates: PropertyCoordinates | null): ApiFieldErrors {
  const errors: ApiFieldErrors = {};
  const add = (field: string, message: string) => { errors[field] = [...(errors[field] ?? []), message]; };
  const annualRent = Number(form.annualRent.replace(/,/g, ""));
  const serviceCharge = Number(form.serviceCharge.replace(/,/g, ""));
  const cautionFee = Number(form.cautionFee.replace(/,/g, ""));
  if (form.title.trim().length < 5) add("title", "Property title must contain at least 5 characters.");
  if (form.description.trim().length < 20) add("description", "Description must contain at least 20 characters.");
  if (!Number.isFinite(annualRent) || annualRent <= 0) add("annualRent", "Annual rent must be greater than zero.");
  if (!Number.isFinite(serviceCharge) || serviceCharge < 0) add("serviceCharge", "Service charge must be zero or greater.");
  if (!Number.isFinite(cautionFee) || cautionFee < 0) add("cautionFee", "Caution fee must be zero or greater.");
  if (form.state.trim().length < 2) add("state", "State must contain at least 2 characters.");
  if (form.area.trim().length < 2) add("area", "Area must contain at least 2 characters.");
  if (form.address.trim().length < 5) add("address", "Choose an address with at least 5 characters.");
  if (!coordinates) add("location", "Choose an address and pin the exact building location.");
  if (!Number.isInteger(form.minimumLeaseMonths) || form.minimumLeaseMonths < 1 || form.minimumLeaseMonths > 36) add("minimumLeaseMonths", "Minimum lease must be between 1 and 36 months.");
  return errors;
}

function destination(manager: Manager) {
  return manager === "agent"
    ? { home: "agent-home" as const, homes: "agent-homes" as const }
    : { home: "landlord-home" as const, homes: "landlord-homes" as const };
}

export function ListingEditor({ go, manager }: { go: Go; manager: Manager }) {
  const { session } = useAppSession();
  const searchParams = useSearchParams();
  const listingId = searchParams.get("listing");
  const views = destination(manager);
  const [listing, setListing] = useState<ApiListing | null>(null);
  const [form, setForm] = useState<ListingForm | null>(null);
  const [coordinates, setCoordinates] = useState<PropertyCoordinates | null>(null);
  const [loading, setLoading] = useState(Boolean(listingId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(listingId ? null : "Select a listing to edit.");
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});

  useEffect(() => {
    if (!listingId || !session) {
      if (!session) setError("Sign in to edit a listing.");
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    api.listings.managedDetail(session.accessToken, listingId)
      .then((response) => {
        if (!active) return;
        setListing(response);
        setForm(formFromListing(response));
        setCoordinates(coordinatesFromListing(response));
      })
      .catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : "Unable to load this listing."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [listingId, session]);

  const update = <K extends keyof ListingForm>(key: K, value: ListingForm[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
    setFieldErrors((current) => {
      const { [key]: _cleared, ...remaining } = current;
      return remaining;
    });
    setError(null);
  };
  const toggleAmenity = (amenity: string) => {
    setForm((current) => current ? {
      ...current,
      amenities: current.amenities.includes(amenity)
        ? current.amenities.filter((item) => item !== amenity)
        : [...current.amenities, amenity],
    } : current);
  };

  const save = async () => {
    if (!listing || !form || !session) return;
    setFieldErrors({});
    const localErrors = localListingErrors(form, coordinates);
    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors);
      setError("Please correct the highlighted fields and try again.");
      return;
    }
    const annualRent = Number(form.annualRent.replace(/,/g, ""));
    const serviceCharge = Number(form.serviceCharge.replace(/,/g, ""));
    const cautionFee = Number(form.cautionFee.replace(/,/g, ""));
    setSaving(true);
    setError(null);
    try {
      await api.listings.update(session.accessToken, listing.id, {
        title: form.title,
        description: form.description,
        propertyType: form.propertyType,
        annualRentKobo: String(Math.round(annualRent * 100)),
        serviceChargeKobo: String(Math.round(serviceCharge * 100)),
        cautionFeeKobo: String(Math.round(cautionFee * 100)),
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        state: form.state,
        area: form.area,
        address: form.address,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        amenities: form.amenities,
        availableFrom: form.availableFrom ? new Date(`${form.availableFrom}T00:00:00.000Z`).toISOString() : undefined,
        minimumLeaseMonths: form.minimumLeaseMonths,
      });
      go(views.home, { listing: listing.id });
    } catch (cause: unknown) {
      const nextFieldErrors = apiFieldErrors(cause, listingFieldAliases);
      setFieldErrors(nextFieldErrors);
      setError(apiFormError(cause, nextFieldErrors, "Unable to save this listing."));
    } finally {
      setSaving(false);
    }
  };

  if (loading || error && !form) {
    return <Shell go={go} role={manager} title="Edit listing"><div className="page"><button className="back" onClick={() => go(views.homes)}><ArrowLeft size={14} /> My homes</button><section className="saved-empty panel"><CircleAlert size={22} /><h2>{loading ? "Loading listing editor…" : error}</h2><Button onClick={() => go(views.homes)}>Back to my homes</Button></section></div></Shell>;
  }
  if (!listing || !form) return null;

  return <Shell go={go} role={manager} title="Edit listing"><div className="page listing-editor">
    <button className="back" onClick={() => go(views.home, { listing: listing.id })}><ArrowLeft size={14} /> Home details</button>
    <div className="page-title"><span><small>{manager === "agent" ? "Managed property" : "Your property"}</small><h1>Edit listing</h1><p>Save your changes and keep this verified listing available to tenants immediately.</p></span><Status tone="green">Publishes immediately</Status></div>
    <section className="listing-edit-notice"><CircleAlert size={18} /><span><b>Saved changes stay in public search.</b><small>Suspended listings remain unavailable until an administrator restores them.</small></span></section>
    {error && <p className="form-alert"><CircleAlert size={15} /> {error}</p>}
    <section className="panel listing-editor-form">
      <div className="editor-section"><span><small>Basics</small><h2>Property details</h2></span><div className="formgrid"><label>Property type<select value={form.propertyType} onChange={(event) => update("propertyType", event.target.value as ListingForm["propertyType"])}>{propertyTypes.map((type) => <option key={type} value={type}>{type[0]}{type.slice(1).toLowerCase()}</option>)}</select></label><label>Property title<input aria-invalid={Boolean(fieldErrors.title)} value={form.title} onChange={(event) => update("title", event.target.value)} /><ApiFieldError errors={fieldErrors} field="title" /></label><label>Annual rent (₦)<input aria-invalid={Boolean(fieldErrors.annualRent)} inputMode="numeric" value={form.annualRent} onChange={(event) => update("annualRent", event.target.value)} /><ApiFieldError errors={fieldErrors} field="annualRent" /></label><label>Service charge (₦)<input aria-invalid={Boolean(fieldErrors.serviceCharge)} inputMode="numeric" value={form.serviceCharge} onChange={(event) => update("serviceCharge", event.target.value)} /><ApiFieldError errors={fieldErrors} field="serviceCharge" /></label><label>Caution fee (₦)<input aria-invalid={Boolean(fieldErrors.cautionFee)} inputMode="numeric" value={form.cautionFee} onChange={(event) => update("cautionFee", event.target.value)} /><ApiFieldError errors={fieldErrors} field="cautionFee" /></label></div></div>
      <div className="editor-section location-step"><span><small>Location</small><h2>Set the final map pin</h2><p>Search for an address, then drag the marker or click the map to pinpoint the building. This exact pin is saved with the listing.</p></span><div className="formgrid"><label>State<input aria-invalid={Boolean(fieldErrors.state)} value={form.state} onChange={(event) => update("state", event.target.value)} /><ApiFieldError errors={fieldErrors} field="state" /></label><label>Area<input aria-invalid={Boolean(fieldErrors.area)} value={form.area} onChange={(event) => update("area", event.target.value)} /><ApiFieldError errors={fieldErrors} field="area" /></label><label className="full">Search property address<GoogleAddressAutocomplete initialValue={form.address} onPlaceSelected={({ address, coordinates: nextCoordinates }) => { update("address", address); setCoordinates(nextCoordinates); setFieldErrors((current) => { const { location: _location, ...remaining } = current; return remaining; }); }} /><ApiFieldError errors={fieldErrors} field="address" /></label><div className="full map-picker"><GooglePropertyMap value={coordinates} onChange={(nextCoordinates) => { setCoordinates(nextCoordinates); setFieldErrors((current) => { const { location: _location, ...remaining } = current; return remaining; }); }} interactive /><ApiFieldError errors={fieldErrors} field="location" /><p><MapPin size={15} /><span><b>Final pin: {coordinates ? "ready" : "required"}</b><small>Only the final marker position is saved. The public map never geocodes the address again.</small></span></p>{coordinates && <code className="coordinate-debug">lat {coordinates.latitude.toFixed(6)} · lng {coordinates.longitude.toFixed(6)}</code>}</div></div></div>
      <div className="editor-section"><span><small>Home details</small><h2>Describe the home</h2></span><div className="details"><span>Bedrooms<b><button type="button" onClick={() => update("bedrooms", Math.max(0, form.bedrooms - 1))}>−</button>{form.bedrooms}<button type="button" onClick={() => update("bedrooms", form.bedrooms + 1)}>+</button></b></span><span>Bathrooms<b><button type="button" onClick={() => update("bathrooms", Math.max(0, form.bathrooms - 1))}>−</button>{form.bathrooms}<button type="button" onClick={() => update("bathrooms", form.bathrooms + 1)}>+</button></b></span><label>Description<textarea aria-invalid={Boolean(fieldErrors.description)} value={form.description} onChange={(event) => update("description", event.target.value)} /><ApiFieldError errors={fieldErrors} field="description" /></label><div>{amenityOptions.map((amenity) => <button type="button" className={form.amenities.includes(amenity) ? "selected" : ""} onClick={() => toggleAmenity(amenity)} key={amenity}><Check size={12} />{amenity}</button>)}</div></div></div>
      <div className="editor-section"><span><small>Availability</small><h2>Rental terms</h2></span><div className="rules"><label>Available from<input type="date" value={form.availableFrom} onChange={(event) => update("availableFrom", event.target.value)} /></label><label>Minimum lease (months)<input aria-invalid={Boolean(fieldErrors.minimumLeaseMonths)} type="number" min="1" max="36" value={form.minimumLeaseMonths} onChange={(event) => update("minimumLeaseMonths", Math.max(1, Math.min(36, Number(event.target.value) || 1)))} /><ApiFieldError errors={fieldErrors} field="minimumLeaseMonths" /></label></div><p className="editor-media-note"><CircleCheck size={14} /> {listing.media.length} existing media file{listing.media.length === 1 ? "" : "s"} will remain attached to this listing.</p></div>
      <div className="actions"><Button variant="ghost" disabled={saving} onClick={() => go(views.home, { listing: listing.id })}>Cancel</Button><Button disabled={saving} onClick={() => void save()}>{saving ? "Publishing changes…" : "Save and publish changes"} <ArrowRight size={14} /></Button></div>
    </section>
    {session && <InspectionSettings listingId={listing.id} token={session.accessToken} />}
  </div></Shell>;
}
