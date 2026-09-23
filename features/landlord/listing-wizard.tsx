"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown, CircleAlert, CircleCheck, MapPin, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Back, Shell, Status, type Navigate } from "@/features/app/shell";
import { useAppSession } from "@/features/app/app-provider";
import { PropertyLocationMap, type PropertyCoordinates } from "@/features/maps/property-location-map";
import { api, type GeocodingSuggestion } from "@/lib/api";
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

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

export function ListingWizard({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ListingForm>(initialForm);
  const [coordinates, setCoordinates] = useState<PropertyCoordinates | null>(null);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [results, setResults] = useState<GeocodingSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const query = form.address.trim();
    if (!session || query.length < 3 || query === selectedAddress) {
      setResults([]);
      setLocationError("");
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setLocationError("");
      api.geocoding.search(session.accessToken, query)
        .then((suggestions) => active && setResults(suggestions))
        .catch((cause: unknown) => active && setLocationError(cause instanceof Error ? cause.message : "Address search is unavailable."))
        .finally(() => active && setSearching(false));
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [form.address, session]);

  const update = <K extends keyof ListingForm>(key: K, value: ListingForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleAmenity = (amenity: string) => setForm((current) => ({
    ...current,
    amenities: current.amenities.includes(amenity) ? current.amenities.filter((item) => item !== amenity) : [...current.amenities, amenity],
  }));
  const chooseAddress = (result: GeocodingSuggestion) => {
    update("address", result.address);
    setSelectedAddress(result.address);
    setCoordinates({ latitude: result.latitude, longitude: result.longitude });
    setResults([]);
    setLocationError("");
  };

  const saveDraft = async () => {
    setError("");
    if (!session) { go("sign-in"); return; }
    if (!session.user.roles.includes("LANDLORD") && !session.user.roles.includes("AGENT")) {
      setError("Only a landlord or agent account can create a listing.");
      return;
    }
    if (!coordinates) { setStep(1); setError("Search for the address, then pin the exact building location on the map."); return; }
    const rentNaira = Number(form.annualRent.replace(/,/g, ""));
    const serviceChargeNaira = Number(form.serviceCharge.replace(/,/g, ""));
    const cautionFeeNaira = Number(form.cautionFee.replace(/,/g, ""));
    if (!Number.isFinite(rentNaira) || rentNaira <= 0 || !Number.isFinite(serviceChargeNaira) || !Number.isFinite(cautionFeeNaira)) {
      setError("Enter valid rent, service charge and caution-fee amounts in naira.");
      return;
    }
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
      });
      go("landlord-homes");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save this listing draft.");
    } finally {
      setSubmitting(false);
    }
  };

  return <Shell go={go} role="landlord" title="Add property">
    <div className="page wizard listing-wizard">
      <div className="wizardhead"><span><Back go={go} to="landlord" /><h1>List a new property</h1></span><small><CircleCheck size={14} /> Your final map pin is saved with the listing</small></div>
      <div className="wizardbody">
        <aside>{steps.map((label, index) => <button type="button" className={step === index ? "active" : index < step ? "done" : ""} onClick={() => setStep(index)} key={label}><i>{index < step ? <Check size={12} /> : index + 1}</i>{label}</button>)}</aside>
        <section>
          <small>Step {step + 1} of {steps.length}</small>
          <h2>{["Tell us about the home", "Where is it located?", "What makes this home special?", "Add photos and a walkthrough", "Set clear expectations", "Review your property"][step]}</h2>
          <p>These details help tenants decide with confidence.</p>
          {error && <p className="form-alert"><CircleAlert size={15} /> {error}</p>}
          {step === 0 && <div className="formgrid">
            <label>Property type<select value={form.propertyType} onChange={(event) => update("propertyType", event.target.value as ListingForm["propertyType"])}>{["APARTMENT", "HOUSE", "DUPLEX", "STUDIO", "ROOM", "OTHER"].map((type) => <option key={type} value={type}>{type[0]}{type.slice(1).toLowerCase()}</option>)}</select></label>
            <label>Property title<input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="e.g. Bright room near Yaba" /></label>
            <label>Annual rent (₦)<input inputMode="numeric" value={form.annualRent} onChange={(event) => update("annualRent", event.target.value)} placeholder="e.g. 480000" /></label>
            <label>Service charge (₦)<input inputMode="numeric" value={form.serviceCharge} onChange={(event) => update("serviceCharge", event.target.value)} /></label>
            <label>Caution fee (₦)<input inputMode="numeric" value={form.cautionFee} onChange={(event) => update("cautionFee", event.target.value)} /></label>
          </div>}
          {step === 1 && <div className="formgrid location-step">
            <label>State<input value={form.state} onChange={(event) => update("state", event.target.value)} placeholder="e.g. Lagos" /></label>
            <label>Area<input value={form.area} onChange={(event) => update("area", event.target.value)} placeholder="e.g. Mushin" /></label>
            <label className="full">Search property address<input value={form.address} onChange={(event) => { update("address", event.target.value); setSelectedAddress(""); setCoordinates(null); }} placeholder="22 Ikale Street, Mushin, Lagos" autoComplete="off" /></label>
            <div className="geocode-results full" aria-live="polite">{searching && <small>Finding addresses…</small>}{locationError && <small className="error"><CircleAlert size={13} /> {locationError}</small>}{results.map((result) => <button type="button" key={result.id} onClick={() => chooseAddress(result)}><MapPin size={15} /><span><b>{result.address}</b><small>{formatCoordinate(result.latitude)}, {formatCoordinate(result.longitude)}</small></span></button>)}</div>
            <div className="full map-picker"><PropertyLocationMap value={coordinates} onChange={setCoordinates} interactive /><p><MapPin size={15} /><span><b>Pin the exact building</b><small>Choose a suggestion, then drag the marker or click the map to set the final position. We will save this exact point without geocoding again.</small></span></p>{coordinates && showCoordinateDebug && <code className="coordinate-debug">lat {formatCoordinate(coordinates.latitude)} · lng {formatCoordinate(coordinates.longitude)}</code>}</div>
          </div>}
          {step === 2 && <div className="details"><span>Bedrooms<b><button type="button" onClick={() => update("bedrooms", Math.max(0, form.bedrooms - 1))}>−</button>{form.bedrooms}<button type="button" onClick={() => update("bedrooms", form.bedrooms + 1)}>+</button></b></span><span>Bathrooms<b><button type="button" onClick={() => update("bathrooms", Math.max(0, form.bathrooms - 1))}>−</button>{form.bathrooms}<button type="button" onClick={() => update("bathrooms", form.bathrooms + 1)}>+</button></b></span><label>Description<textarea value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Describe the home, its condition and what makes it a good fit." /></label><div>{amenityOptions.map((amenity) => <button type="button" className={form.amenities.includes(amenity) ? "selected" : ""} onClick={() => toggleAmenity(amenity)} key={amenity}><Check size={12} />{amenity}</button>)}</div></div>}
          {step === 3 && <div className="media"><Upload size={26} /><h3>Photos are added after this draft is saved</h3><p>You can save location and property details now. Add at least eight clear photos before submitting the listing for review.</p></div>}
          {step === 4 && <div className="rules"><label>Available from<input type="date" value={form.availableFrom} onChange={(event) => update("availableFrom", event.target.value)} /></label><label>Minimum lease (months)<input type="number" min="1" max="36" value={form.minimumLeaseMonths} onChange={(event) => update("minimumLeaseMonths", Number(event.target.value))} /></label></div>}
          {step === 5 && <div className="preview"><div className="preview-map"><PropertyLocationMap value={coordinates} /></div><span><Status>{coordinates ? "Map pin ready" : "Location required"}</Status><h3>{form.title || "Untitled property"}</h3><p><MapPin size={13} />{form.address || "No address selected"}</p><b>{form.annualRent ? `₦${form.annualRent} / year` : "Add annual rent"}</b><small><Check /> {form.amenities.length} amenities <Check /> {coordinates ? "Exact location pinned" : "Pin the map location"}</small></span></div>}
          <div className="actions"><Button variant="ghost" disabled={step === 0 || submitting} onClick={() => setStep((current) => current - 1)}>Back</Button><Button disabled={submitting} onClick={() => step < steps.length - 1 ? setStep((current) => current + 1) : void saveDraft()}>{step === steps.length - 1 ? (submitting ? "Saving…" : "Save listing draft") : "Save and continue"}<ArrowRight size={14} /></Button></div>
        </section>
      </div>
    </div>
  </Shell>;
}
