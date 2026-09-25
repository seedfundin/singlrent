"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./property-location-map.css";

export type PropertyCoordinates = { latitude: number; longitude: number };

const lagosFallback: PropertyCoordinates = { latitude: 6.5244, longitude: 3.3792 };
const mapboxAccessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

function isCoordinate(value: PropertyCoordinates | null | undefined): value is PropertyCoordinates {
  return Boolean(value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude));
}

export function PropertyLocationMap({
  value,
  onChange,
  interactive = false,
  className = "",
}: {
  value: PropertyCoordinates | null;
  onChange?: (coordinates: PropertyCoordinates) => void;
  interactive?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  onChangeRef.current = onChange;
  valueRef.current = value;

  useEffect(() => {
    if (!mapboxAccessToken || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = mapboxAccessToken;
    const initial = isCoordinate(valueRef.current) ? valueRef.current : lagosFallback;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [initial.longitude, initial.latitude],
      zoom: isCoordinate(valueRef.current) ? 16 : 11,
      attributionControl: true,
      dragPan: interactive,
      scrollZoom: interactive,
      doubleClickZoom: interactive,
      touchZoomRotate: interactive,
      keyboard: interactive,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const placeMarker = (coordinates: PropertyCoordinates) => {
      let marker = markerRef.current;
      if (!marker) {
        marker = new mapboxgl.Marker({ draggable: interactive, color: "#1f8054" });
        marker.on("dragend", () => {
          const position = marker!.getLngLat();
          onChangeRef.current?.({ latitude: position.lat, longitude: position.lng });
        });
        markerRef.current = marker;
      }
      marker.setLngLat([coordinates.longitude, coordinates.latitude]).addTo(map);
    };

    map.on("load", () => {
      if (isCoordinate(valueRef.current)) placeMarker(valueRef.current);
    });
    if (interactive) {
      map.on("click", (event) => {
        const coordinates = { latitude: event.lngLat.lat, longitude: event.lngLat.lng };
        placeMarker(coordinates);
        onChangeRef.current?.(coordinates);
      });
    }
    return () => {
      markerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, [interactive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isCoordinate(value)) return;
    const setPosition = () => {
      let marker = markerRef.current;
      if (!marker) {
        marker = new mapboxgl.Marker({ draggable: interactive, color: "#1f8054" });
        marker.on("dragend", () => {
          const position = marker!.getLngLat();
          onChangeRef.current?.({ latitude: position.lat, longitude: position.lng });
        });
        markerRef.current = marker;
      }
      marker.setLngLat([value.longitude, value.latitude]).addTo(map);
      map.flyTo({ center: [value.longitude, value.latitude], zoom: Math.max(map.getZoom(), 16), essential: true });
    };
    if (map.loaded()) setPosition();
    else map.once("load", setPosition);
  }, [interactive, value?.latitude, value?.longitude]);

  if (!mapboxAccessToken) {
    return <div className={`property-location-map map-configuration-error ${className}`} role="status">Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to render the Mapbox map.</div>;
  }
  return <div className={`property-location-map ${interactive ? "is-interactive" : ""} ${className}`} ref={containerRef} aria-label="Property location map" />;
}
