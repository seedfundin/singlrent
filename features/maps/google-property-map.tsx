"use client";

import { useEffect, useRef, useState } from "react";
import { hasGoogleMapsApiKey, loadGoogleMapsLibrary } from "./google-maps-loader";
import "./property-location-map.css";

export type PropertyCoordinates = { latitude: number; longitude: number };

const nigeriaFallback: PropertyCoordinates = { latitude: 9.082, longitude: 8.6753 };

function isValidCoordinates(value: PropertyCoordinates | null | undefined): value is PropertyCoordinates {
  return Boolean(value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude));
}

export function GooglePropertyMap({
  value,
  onChange,
  interactive = false,
  className = "",
}: {
  value?: PropertyCoordinates | null;
  onChange?: (coordinates: PropertyCoordinates) => void;
  interactive?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const [loadError, setLoadError] = useState<string | null>(null);

  valueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !hasGoogleMapsApiKey()) return;
    let cancelled = false;
    const listeners: any[] = [];

    const createMarker = (map: any, coordinates: PropertyCoordinates) => {
      const marker = new (window as any).google.maps.Marker({
        map,
        position: { lat: coordinates.latitude, lng: coordinates.longitude },
        draggable: interactive,
        title: "Property location",
      });
      if (interactive) {
        listeners.push(marker.addListener("dragend", (event: any) => {
          const latitude = event.latLng?.lat();
          const longitude = event.latLng?.lng();
          if (Number.isFinite(latitude) && Number.isFinite(longitude)) onChangeRef.current?.({ latitude, longitude });
        }));
      }
      return marker;
    };

    void loadGoogleMapsLibrary<{ Map: new (element: HTMLElement, options: Record<string, unknown>) => any }>("maps")
      .then(({ Map }) => {
        if (cancelled || !containerRef.current) return;
        const initial = isValidCoordinates(valueRef.current) ? valueRef.current : nigeriaFallback;
        const map = new Map(containerRef.current, {
          center: { lat: initial.latitude, lng: initial.longitude },
          zoom: isValidCoordinates(valueRef.current) ? 16 : 6,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        mapRef.current = map;
        if (isValidCoordinates(valueRef.current)) markerRef.current = createMarker(map, valueRef.current);
        if (interactive) {
          listeners.push(map.addListener("click", (event: any) => {
            const latitude = event.latLng?.lat();
            const longitude = event.latLng?.lng();
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
            const next = { latitude, longitude };
            if (!markerRef.current) markerRef.current = createMarker(map, next);
            else markerRef.current.setPosition({ lat: next.latitude, lng: next.longitude });
            onChangeRef.current?.(next);
          }));
        }
      })
      .catch((error: unknown) => !cancelled && setLoadError(error instanceof Error ? error.message : "Google Maps could not be loaded."));

    return () => {
      cancelled = true;
      listeners.forEach((listener) => listener.remove?.());
      markerRef.current?.setMap?.(null);
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [interactive]);

  useEffect(() => {
    if (!mapRef.current || !isValidCoordinates(value)) return;
    const position = { lat: value.latitude, lng: value.longitude };
    if (!markerRef.current) {
      markerRef.current = new (window as any).google.maps.Marker({
        map: mapRef.current,
        position,
        draggable: interactive,
        title: "Property location",
      });
      if (interactive) {
        markerRef.current.addListener("dragend", (event: any) => {
          const latitude = event.latLng?.lat();
          const longitude = event.latLng?.lng();
          if (Number.isFinite(latitude) && Number.isFinite(longitude)) onChangeRef.current?.({ latitude, longitude });
        });
      }
    } else {
      markerRef.current.setPosition(position);
    }
    mapRef.current.panTo(position);
    mapRef.current.setZoom(Math.max(mapRef.current.getZoom?.() ?? 0, 16));
  }, [interactive, value?.latitude, value?.longitude]);

  if (!hasGoogleMapsApiKey()) {
    return <div className={`property-location-map map-configuration-error ${className}`} role="status">Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to render this Google map.</div>;
  }
  if (loadError) return <div className={`property-location-map map-configuration-error ${className}`} role="status">{loadError}</div>;
  return <div className={`property-location-map ${interactive ? "is-interactive" : ""} ${className}`} ref={containerRef} aria-label="Property location map" />;
}
