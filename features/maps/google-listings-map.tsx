"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiListing } from "@/lib/api";
import { hasGoogleMapsApiKey, loadGoogleMapsLibrary } from "./google-maps-loader";
import "./property-location-map.css";

type MappableListing = ApiListing & { latitude: number | string; longitude: number | string };

function mappable(listings: ApiListing[]): MappableListing[] {
  return listings.filter((listing): listing is MappableListing => {
    const latitude = Number(listing.latitude);
    const longitude = Number(listing.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  });
}

/** Mounted only after a visitor chooses the Explore Map tab. */
export default function GoogleListingsMap({
  listings,
  onSelect,
}: {
  listings: ApiListing[];
  onSelect: (listing: ApiListing) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const latestListingsRef = useRef<ApiListing[]>(listings);
  const onSelectRef = useRef(onSelect);
  const [error, setError] = useState<string | null>(null);

  latestListingsRef.current = listings;
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !hasGoogleMapsApiKey()) return;
    let cancelled = false;
    void loadGoogleMapsLibrary<{ Map: new (node: HTMLElement, options: Record<string, unknown>) => any }>("maps")
      .then(({ Map }) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new Map(containerRef.current, {
          center: { lat: 9.082, lng: 8.6753 },
          zoom: 6,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        window.dispatchEvent(new Event("singlerent-listings-map-ready"));
      })
      .catch((cause: unknown) => !cancelled && setError(cause instanceof Error ? cause.message : "Google Maps could not be loaded."));
    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.setMap?.(null));
      markersRef.current = [];
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const renderMarkers = () => {
      const map = mapRef.current;
      if (!map) return;
      markersRef.current.forEach((marker) => marker.setMap?.(null));
      const visible = mappable(latestListingsRef.current);
      const bounds = new (window as any).google.maps.LatLngBounds();
      markersRef.current = visible.map((listing) => {
        const marker = new (window as any).google.maps.Marker({
          map,
          position: { lat: Number(listing.latitude), lng: Number(listing.longitude) },
          title: listing.title,
        });
        marker.addListener("click", () => onSelectRef.current(listing));
        bounds.extend(marker.getPosition());
        return marker;
      });
      if (visible.length === 1) {
        map.setCenter(bounds.getCenter());
        map.setZoom(15);
      } else if (visible.length > 1) {
        map.fitBounds(bounds, 48);
      }
    };
    renderMarkers();
    window.addEventListener("singlerent-listings-map-ready", renderMarkers);
    return () => window.removeEventListener("singlerent-listings-map-ready", renderMarkers);
  }, [listings]);

  if (!hasGoogleMapsApiKey()) return <div className="property-location-map map-configuration-error" role="status">Map search needs NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.</div>;
  if (error) return <div className="property-location-map map-configuration-error" role="status">{error}</div>;
  if (!mappable(listings).length) return <div className="property-location-map map-configuration-error" role="status">No current search results have saved map coordinates yet.</div>;
  return <div className="property-location-map google-listings-map" ref={containerRef} aria-label="Map of available properties" />;
}
