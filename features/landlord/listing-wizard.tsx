"use client";

import { useState } from "react";
import { ArrowRight, Check, ChevronDown, CircleAlert, CircleCheck, MapPin, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Back, Shell, Status, type Navigate } from "@/features/app/shell";
import { useAppSession } from "@/features/app/app-provider";
import { GoogleAddressAutocomplete } from "@/features/maps/google-address-autocomplete";
import { GooglePropertyMap, type PropertyCoordinates } from "@/features/maps/google-property-map";
import { ListingMediaUploader } from "@/features/media/listing-media-uploader";
import { PublisherVerificationGate } from "@/features/landlord/publisher-verification";
import { ApiFieldError } from "@/features/forms/api-field-error";
import { api, apiFieldErrors, apiFormError, type ApiFieldErrors, type ListingMediaInput } from "@/lib/api";
import "./listing-wizard.css";

type ListingForm = {
  title: string;
  propertyType: "APARTMENT" | "HOUSE" | "DUPLEX" | "STUDIO" | "ROOM" | "OTHER";
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

const initialForm: ListingForm = {
  title: "",
  propertyType: "APARTMENT",
  annualRent: "",
  serviceCharge: "0",
  cautionFee: "0",
  state: "",
  area: "",
  address: "",
  bedrooms: 1,
  bathrooms: 1,
  description: "",
  amenities: [],
  availableFrom: "",
  minimumLeaseMonths: 12,
};

const steps = ["Basics", "Location", "Home details", "Media", "Rules", "Preview"];
const amenityOptions = ["24/7 power backup", "Treated water", "Parking", "CCTV", "Gym", "Pet friendly"];
const showCoordinateDebug = process.env.NODE_ENV !== "production";
const listingFieldAliases = {
  annualRentKobo: "annualRent",
  serviceChargeKobo: "serviceCharge",
  cautionFeeKobo: "cautionFee",
  minimumLeaseMonths: "minimumLeaseMonths",
  latitude: "location",
  longitude: "location",
  media: "media",
};

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function localListingErrors(form: ListingForm, coordinates: PropertyCoordinates | null, media: ListingMediaInput[]): ApiFieldErrors {
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
  if (!Number.isInteger(form.bedrooms) || form.bedrooms < 0 || form.bedrooms > 30) add("bedrooms", "Bedrooms must be between 0 and 30.");
  if (!Number.isInteger(form.bathrooms) || form.bathrooms < 0 || form.bathrooms > 30) add("bathrooms", "Bathrooms must be between 0 and 30.");
  if (!Number.isInteger(form.minimumLeaseMonths) || form.minimumLeaseMonths < 1 || form.minimumLeaseMonths > 36) add("minimumLeaseMonths", "Minimum lease must be between 1 and 36 months.");
  const images = media.filter((item) => item.mediaType === "IMAGE").length;
  const videos = media.filter((item) => item.mediaType === "VIDEO").length;
  if (images < 3 || images > 4 || videos !== 1) add("media", "Add 3–4 photos and exactly 1 video before publishing.");
  return errors;
}

function firstInvalidStep(errors: ApiFieldErrors): number {
  if (errors.title || errors.annualRent || errors.serviceCharge || errors.cautionFee) return 0;
  if (errors.state || errors.area || errors.address || errors.location) return 1;
  if (errors.bedrooms || errors.bathrooms || errors.description) return 2;
  if (errors.media) return 3;
  return 4;
}

export function ListingWizard({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const [publisherVerified, setPublisherVerified] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ListingForm>(initialForm);
  const [coordinates, setCoordinates] = useState<PropertyCoordinates | null>(null);
  const [media, setMedia] = useState<ListingMediaInput[]>([]);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const update = <K extends keyof ListingForm>(key: K, value: ListingForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const { [key]: _cleared, ...remaining } = current;
      return remaining;
    });
    setError("");
  };
  const toggleAmenity = (amenity: string) => setForm((current) => ({
    ...current,
    amenities: current.amenities.includes(amenity) ? current.amenities.filter((item) => item !== amenity) : [...current.amenities, amenity],
  }));
  const publishListing = async () => {
    setError("");
    setFieldErrors({});
    if (!session) { go("sign-in"); return; }
    if (!session.user.roles.includes("LANDLORD") && !session.user.roles.includes("AGENT")) {
      setError("Only a landlord or agent account can create a listing.");
      return;
    }
    const localErrors = localListingErrors(form, coordinates, media);
    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors);
      setStep(firstInvalidStep(localErrors));
      setError("Please correct the highlighted fields and try again.");
      return;
    }
    const rentNaira = Number(form.annualRent.replace(/,/g, ""));
    const serviceChargeNaira = Number(form.serviceCharge.replace(/,/g, ""));
    const cautionFeeNaira = Number(form.cautionFee.replace(/,/g, ""));
    setSubmitting(true);
    try {
      await api.listings.create(session.accessToken, {
        title: form.title,
        description: form.description,
        propertyType: form.propertyType,
        annualRentKobo: String(Math.round(rentNaira * 100)),
        serviceChargeKobo: String(Math.round(serviceChargeNaira * 100)),
        cautionFeeKobo: String(Math.round(cautionFeeNaira * 100)),
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
        // The media service applies its own persisted video ordering. Keep the
        // client payload in the API's documented input range, including media
        // selected before a hot reload delivered the uploader correction.
        media: media.map((item) => ({
          ...item,
          position: item.mediaType === "VIDEO" ? 0 : item.position,
        })),
      });
      go(homeView);
    } catch (cause) {
      const nextFieldErrors = apiFieldErrors(cause, listingFieldAliases);
      setFieldErrors(nextFieldErrors);
      setError(apiFormError(cause, nextFieldErrors, "Unable to publish this listing."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) {
    return <Shell go={go} role="landlord" title="Add property"><div className="page publisher-verification-page"><section className="publisher-verification-card loading"><UserRound size={24} /><div><h1>Sign in to list a property</h1><p>Landlord and agent accounts can complete publisher verification after signing in.</p><Button onClick={() => go("sign-in")}>Sign in</Button></div></section></div></Shell>;
  }

  const isAgent = session.user.roles.includes("AGENT");
  const isLandlord = session.user.roles.includes("LANDLORD");
  const publisherRole = isAgent ? "agent" : "landlord";
  const homeView = publisherRole === "agent" ? "agent-homes" : "landlord-homes";

  if (!isAgent && !isLandlord) {
    return <Shell go={go} role="tenant" title="List a property"><div className="page publisher-verification-page"><section className="publisher-verification-card loading"><CircleAlert size={24} /><div><h1>Landlord or agent account required</h1><p>Only landlord and agent accounts can create a property listing.</p><Button onClick={() => go("tenant")}>Go to dashboard</Button></div></section></div></Shell>;
  }

  if (!publisherVerified) {
    return <Shell go={go} role={publisherRole} title="Publisher verification"><PublisherVerificationGate session={session} role={publisherRole} onVerified={() => setPublisherVerified(true)} /></Shell>;
  }

  return <Shell go={go} role={publisherRole} title="Add property">
    <div className="page wizard listing-wizard">
      <div className="wizardhead"><span><Back go={go} to={homeView} /><h1>List a new property</h1></span><small><CircleCheck size={14} /> Your final map pin is saved with the listing</small></div>
      <div className="wizardbody">
        <aside>{steps.map((label, index) => <button type="button" className={step === index ? "active" : index < step ? "done" : ""} onClick={() => setStep(index)} key={label}><i>{index < step ? <Check size={12} /> : index + 1}</i>{label}</button>)}</aside>
        <section>
          <small>Step {step + 1} of {steps.length}</small>
          <h2>{["Tell us about the home", "Where is it located?", "What makes this home special?", "Add photos and a walkthrough", "Set clear expectations", "Review your property"][step]}</h2>
          <p>These details help tenants decide with confidence.</p>
          {error && <p className="form-alert"><CircleAlert size={15} /> {error}</p>}
          {step === 0 && <div className="formgrid">
            <label>Property type<select value={form.propertyType} onChange={(event) => update("propertyType", event.target.value as ListingForm["propertyType"])}>{["APARTMENT", "HOUSE", "DUPLEX", "STUDIO", "ROOM", "OTHER"].map((type) => <option key={type} value={type}>{type[0]}{type.slice(1).toLowerCase()}</option>)}</select></label>
            <label>Property title<input aria-invalid={Boolean(fieldErrors.title)} value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="e.g. Bright room near Yaba" /><ApiFieldError errors={fieldErrors} field="title" /></label>
            <label>Annual rent (₦)<input aria-invalid={Boolean(fieldErrors.annualRent)} inputMode="numeric" value={form.annualRent} onChange={(event) => update("annualRent", event.target.value)} placeholder="e.g. 480000" /><ApiFieldError errors={fieldErrors} field="annualRent" /></label>
            <label>Service charge (₦)<input aria-invalid={Boolean(fieldErrors.serviceCharge)} inputMode="numeric" value={form.serviceCharge} onChange={(event) => update("serviceCharge", event.target.value)} /><ApiFieldError errors={fieldErrors} field="serviceCharge" /></label>
            <label>Caution fee (₦)<input aria-invalid={Boolean(fieldErrors.cautionFee)} inputMode="numeric" value={form.cautionFee} onChange={(event) => update("cautionFee", event.target.value)} /><ApiFieldError errors={fieldErrors} field="cautionFee" /></label>
          </div>}
          {step === 1 && <div className="formgrid location-step">
            <label>State<input aria-invalid={Boolean(fieldErrors.state)} value={form.state} onChange={(event) => update("state", event.target.value)} placeholder="e.g. Lagos" /><ApiFieldError errors={fieldErrors} field="state" /></label>
            <label>Area<input aria-invalid={Boolean(fieldErrors.area)} value={form.area} onChange={(event) => update("area", event.target.value)} placeholder="e.g. Mushin" /><ApiFieldError errors={fieldErrors} field="area" /></label>
            <label className="full">Search property address<GoogleAddressAutocomplete onPlaceSelected={({ address, coordinates: nextCoordinates }) => { update("address", address); setCoordinates(nextCoordinates); setFieldErrors((current) => { const { address: _address, location: _location, ...remaining } = current; return remaining; }); setError(""); }} /><ApiFieldError errors={fieldErrors} field="address" /></label>
            <div className="full map-picker"><GooglePropertyMap value={coordinates} onChange={(nextCoordinates) => { setCoordinates(nextCoordinates); setFieldErrors((current) => { const { location: _location, ...remaining } = current; return remaining; }); }} interactive /><ApiFieldError errors={fieldErrors} field="location" /><p><MapPin size={15} /><span><b>Pin the exact building</b><small>Choose an address from Google suggestions, then drag the marker or click the map to set the final position. We save this exact point without geocoding again.</small></span></p>{coordinates && showCoordinateDebug && <code className="coordinate-debug">lat {formatCoordinate(coordinates.latitude)} · lng {formatCoordinate(coordinates.longitude)}</code>}</div>
          </div>}
          {step === 2 && <div className="details"><span>Bedrooms<b><button type="button" onClick={() => update("bedrooms", Math.max(0, form.bedrooms - 1))}>−</button>{form.bedrooms}<button type="button" onClick={() => update("bedrooms", form.bedrooms + 1)}>+</button></b><ApiFieldError errors={fieldErrors} field="bedrooms" /></span><span>Bathrooms<b><button type="button" onClick={() => update("bathrooms", Math.max(0, form.bathrooms - 1))}>−</button>{form.bathrooms}<button type="button" onClick={() => update("bathrooms", form.bathrooms + 1)}>+</button></b><ApiFieldError errors={fieldErrors} field="bathrooms" /></span><label>Description<textarea aria-invalid={Boolean(fieldErrors.description)} value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Describe the home, its condition and what makes it a good fit." /><ApiFieldError errors={fieldErrors} field="description" /></label><div>{amenityOptions.map((amenity) => <button type="button" className={form.amenities.includes(amenity) ? "selected" : ""} onClick={() => toggleAmenity(amenity)} key={amenity}><Check size={12} />{amenity}</button>)}</div></div>}
          {step === 3 && <><ListingMediaUploader media={media} onChange={(nextMedia) => { setMedia(nextMedia); setFieldErrors((current) => { const { media: _media, ...remaining } = current; return remaining; }); }} /><ApiFieldError errors={fieldErrors} field="media" /></>}
          {step === 4 && <div className="rules"><label>Available from<input type="date" value={form.availableFrom} onChange={(event) => update("availableFrom", event.target.value)} /></label><label>Minimum lease (months)<input aria-invalid={Boolean(fieldErrors.minimumLeaseMonths)} type="number" min="1" max="36" value={form.minimumLeaseMonths} onChange={(event) => update("minimumLeaseMonths", Number(event.target.value))} /><ApiFieldError errors={fieldErrors} field="minimumLeaseMonths" /></label></div>}
          {step === 5 && <div className="preview"><div className="preview-map"><GooglePropertyMap value={coordinates} /></div><span><Status>{coordinates ? "Map pin ready" : "Location required"}</Status><h3>{form.title || "Untitled property"}</h3><p><MapPin size={13} />{form.address || "No address selected"}</p><b>{form.annualRent ? `₦${form.annualRent} / year` : "Add annual rent"}</b><small><Check /> {form.amenities.length} amenities <Check /> {coordinates ? "Exact location pinned" : "Pin the map location"}</small></span></div>}
          <div className="actions"><Button variant="ghost" disabled={step === 0 || submitting} onClick={() => setStep((current) => current - 1)}>Back</Button><Button disabled={submitting} onClick={() => step < steps.length - 1 ? setStep((current) => current + 1) : void publishListing()}>{step === steps.length - 1 ? (submitting ? "Publishing…" : "Publish listing") : "Save and continue"}<ArrowRight size={14} /></Button></div>
        </section>
      </div>
    </div>
  </Shell>;
}
