"use client";

import { useEffect, useRef, useState } from "react";
import { hasGoogleMapsApiKey, loadGoogleMapsLibrary } from "./google-maps-loader";
import type { PropertyCoordinates } from "./google-property-map";
import "./property-location-map.css";

export default function GoogleStreetView({ coordinates }: { coordinates: PropertyCoordinates }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<any>(null);
  const coordinatesKeyRef = useRef<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !hasGoogleMapsApiKey()) return;
    const coordinatesKey = `${coordinates.latitude},${coordinates.longitude}`;
    if (panoramaRef.current && coordinatesKeyRef.current === coordinatesKey) return;
    panoramaRef.current = null;
    coordinatesKeyRef.current = coordinatesKey;
    setMessage(null);
    let cancelled = false;
    void loadGoogleMapsLibrary("maps")
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const google = (window as any).google;
        const service = new google.maps.StreetViewService();
        service.getPanorama({ location: { lat: coordinates.latitude, lng: coordinates.longitude }, radius: 100 }, (data: any, status: string) => {
          if (cancelled) return;
          if (status !== google.maps.StreetViewStatus.OK || !data?.location?.pano) {
            setMessage("Street View is not available near this property yet.");
            return;
          }
          panoramaRef.current = new google.maps.StreetViewPanorama(containerRef.current, {
            pano: data.location.pano,
            addressControl: false,
            fullscreenControl: false,
            linksControl: true,
            panControl: true,
          });
        });
      })
      .catch(() => !cancelled && setMessage("Street View could not be loaded right now."));
    return () => {
      cancelled = true;
      panoramaRef.current = null;
      coordinatesKeyRef.current = null;
    };
  }, [coordinates.latitude, coordinates.longitude]);

  if (!hasGoogleMapsApiKey()) return <div className="street-view-message">Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to load Street View.</div>;
  if (message) return <div className="street-view-message">{message}</div>;
  return <div className="property-location-map street-view" ref={containerRef} aria-label="Street View near this property" />;
}
