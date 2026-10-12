'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  hasGoogleMapsApiKey,
  loadGoogleMapsLibrary,
} from './google-maps-loader';
import type { PropertyCoordinates } from './google-property-map';
import './google-address-autocomplete.css';

const minimumQueryLength = 3;
const searchDelayMs = 300;

type PlacePrediction = {
  text?: { toString: () => string };
  toPlace?: () => {
    formattedAddress?: string;
    location?: unknown;
    fetchFields: (input: { fields: string[] }) => Promise<void>;
  };
};

type PlacesLibrary = {
  AutocompleteSessionToken?: new () => unknown;
  AutocompleteSuggestion?: {
    fetchAutocompleteSuggestions: (input: {
      input: string;
      includedRegionCodes: string[];
      sessionToken: unknown;
    }) => Promise<{
      suggestions?: Array<{ placePrediction?: PlacePrediction }>;
    }>;
  };
};

function coordinateValue(
  location: any,
  key: 'lat' | 'lng',
): number | undefined {
  const value = location?.[key];
  return typeof value === 'function' ? value.call(location) : value;
}

function predictionLabel(prediction: PlacePrediction): string {
  return prediction.text?.toString() ?? 'Suggested address';
}

export function GoogleAddressAutocomplete({
  onPlaceSelected,
  initialValue = '',
}: {
  onPlaceSelected: (selection: {
    address: string;
    coordinates: PropertyCoordinates;
  }) => void;
  initialValue?: string;
}) {
  const resultsId = useId();
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  const sessionTokenRef = useRef<unknown>(null);
  const searchRequestIdRef = useRef(0);
  const selectionRequestIdRef = useRef(0);
  const selectingRef = useRef(false);
  const blurTimerRef = useRef<number | null>(null);
  const selectedAddressRef = useRef<string | null>(initialValue || null);
  const [query, setQuery] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  onPlaceSelectedRef.current = onPlaceSelected;

  useEffect(
    () => () => {
      if (blurTimerRef.current !== null)
        window.clearTimeout(blurTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const input = query.trim();
    const requestId = ++searchRequestIdRef.current;

    if (selectedAddressRef.current === query) {
      selectedAddressRef.current = null;
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
      setIsLoading(false);
      return;
    }

    if (input.length < minimumQueryLength) {
      sessionTokenRef.current = null;
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
      setIsLoading(false);
      setLoadError(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const { AutocompleteSessionToken, AutocompleteSuggestion } =
            await loadGoogleMapsLibrary<PlacesLibrary>('places');
          if (requestId !== searchRequestIdRef.current) return;
          if (!AutocompleteSessionToken || !AutocompleteSuggestion) {
            throw new Error(
              'Google Places Autocomplete is not available. Enable Places API (New) for this key.',
            );
          }

          const sessionToken =
            sessionTokenRef.current ?? new AutocompleteSessionToken();
          sessionTokenRef.current = sessionToken;
          setIsLoading(true);
          const response =
            await AutocompleteSuggestion.fetchAutocompleteSuggestions({
              input,
              includedRegionCodes: ['ng'],
              sessionToken,
            });

          if (requestId !== searchRequestIdRef.current) return;
          setSuggestions(
            (response.suggestions ?? []).flatMap((suggestion) =>
              suggestion.placePrediction ? [suggestion.placePrediction] : [],
            ),
          );
          setActiveSuggestionIndex(-1);
          setLoadError(null);
        } catch (error) {
          if (requestId !== searchRequestIdRef.current) return;
          setSuggestions([]);
          setActiveSuggestionIndex(-1);
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Google address search could not load.',
          );
        } finally {
          if (requestId === searchRequestIdRef.current) setIsLoading(false);
        }
      })();
    }, searchDelayMs);

    return () => window.clearTimeout(timeout);
  }, [query]);

  const selectPlace = async (prediction: PlacePrediction) => {
    if (selectingRef.current) return;
    const selectionRequestId = ++selectionRequestIdRef.current;
    ++searchRequestIdRef.current;
    selectingRef.current = true;
    setIsSelecting(true);
    setSuggestions([]);
    setActiveSuggestionIndex(-1);

    try {
      const place = prediction.toPlace?.();
      if (!place) throw new Error('Google could not read that address.');

      // The prediction is tied to the current Autocomplete session token. fetchFields
      // automatically sends that token again and closes the Google billing session.
      await place.fetchFields({ fields: ['formattedAddress', 'location'] });
      const latitude = coordinateValue(place.location, 'lat');
      const longitude = coordinateValue(place.location, 'lng');
      const address =
        typeof place.formattedAddress === 'string'
          ? place.formattedAddress
          : predictionLabel(prediction);
      if (
        typeof latitude !== 'number' ||
        typeof longitude !== 'number' ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !address
      ) {
        throw new Error(
          'Choose an address with a map location, then adjust the pin if needed.',
        );
      }
      if (selectionRequestId !== selectionRequestIdRef.current) return;

      selectedAddressRef.current = address;
      setQuery(address);
      setLoadError(null);
      onPlaceSelectedRef.current({
        address,
        coordinates: { latitude, longitude },
      });
    } catch (error) {
      if (selectionRequestId === selectionRequestIdRef.current) {
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Google address search could not load.',
        );
      }
    } finally {
      // Never reuse a token after a selection attempt. A later edit starts a new session.
      sessionTokenRef.current = null;
      if (selectionRequestId === selectionRequestIdRef.current)
        setIsSelecting(false);
      selectingRef.current = false;
    }
  };

  const handleChange = (value: string) => {
    // Invalidate an in-flight suggestion response before React schedules the next effect.
    ++searchRequestIdRef.current;
    ++selectionRequestIdRef.current;
    selectedAddressRef.current = null;
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
    setLoadError(null);
    setQuery(value);
  };

  const showResults =
    query.trim().length >= minimumQueryLength &&
    (isLoading || suggestions.length > 0);

  return (
    <div className="google-place-autocomplete">
      <input
        type="search"
        value={query}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={() => {
          blurTimerRef.current = window.setTimeout(
            () => setSuggestions([]),
            150,
          );
        }}
        onFocus={() => {
          if (blurTimerRef.current !== null)
            window.clearTimeout(blurTimerRef.current);
        }}
        placeholder="22 Ikale Street, Mushin, Lagos"
        aria-label="Search property address"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showResults}
        aria-controls={resultsId}
        aria-activedescendant={
          activeSuggestionIndex >= 0
            ? `${resultsId}-option-${activeSuggestionIndex}`
            : undefined
        }
        aria-describedby={loadError ? 'google-address-search-error' : undefined}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setSuggestions([]);
            setActiveSuggestionIndex(-1);
            return;
          }
          if (!suggestions.length || isSelecting) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveSuggestionIndex((current) =>
              Math.min(current + 1, suggestions.length - 1),
            );
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveSuggestionIndex((current) => Math.max(current - 1, 0));
          }
          if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
            event.preventDefault();
            void selectPlace(suggestions[activeSuggestionIndex]);
          }
        }}
        disabled={!hasGoogleMapsApiKey() || isSelecting}
      />
      {showResults && (
        <ul
          id={resultsId}
          className="google-place-autocomplete-results"
          role="listbox"
          aria-label="Address suggestions"
        >
          {isLoading && (
            <li className="google-place-autocomplete-status" role="status">
              Searching addresses…
            </li>
          )}
          {!isLoading &&
            suggestions.map((prediction, index) => (
              <li
                id={`${resultsId}-option-${index}`}
                key={`${predictionLabel(prediction)}-${index}`}
                role="option"
                aria-selected={index === activeSuggestionIndex}
              >
                <button
                  className={
                    index === activeSuggestionIndex ? 'is-active' : undefined
                  }
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void selectPlace(prediction)}
                >
                  {predictionLabel(prediction)}
                </button>
              </li>
            ))}
        </ul>
      )}
      {!hasGoogleMapsApiKey() && (
        <small id="google-address-search-error" className="error">
          Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to search addresses.
        </small>
      )}
      {loadError && (
        <small id="google-address-search-error" className="error">
          {loadError}
        </small>
      )}
    </div>
  );
}
