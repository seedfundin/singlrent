'use client';

declare global {
  interface Window {
    __singleRentGoogleMapsLoaded?: () => void;
    google?: {
      maps?: {
        importLibrary?: (library: string) => Promise<unknown>;
        [key: string]: unknown;
      };
    };
  }
}

let googleMapsPromise: Promise<void> | null = null;
const googleMapsCallback = '__singleRentGoogleMapsLoaded';

function apiKey(): string | undefined {
  const value = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return value || undefined;
}

export function hasGoogleMapsApiKey(): boolean {
  return Boolean(apiKey());
}

/** Loads the base API once. Feature libraries are loaded separately with importLibrary. */
export function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined')
    return Promise.reject(
      new Error('Google Maps can only load in the browser.'),
    );
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  if (googleMapsPromise) return googleMapsPromise;

  const key = apiKey();
  if (!key)
    return Promise.reject(
      new Error('Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to render Google Maps.'),
    );

  googleMapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      delete window[googleMapsCallback];
      if (error) reject(error);
      else resolve();
    };
    window[googleMapsCallback] = () => {
      if (window.google?.maps?.importLibrary) finish();
      else finish(new Error('Google Maps did not load correctly.'));
    };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${googleMapsCallback}`;
    script.async = true;
    script.onerror = () =>
      finish(new Error('Google Maps could not be loaded.'));
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}

export async function loadGoogleMapsLibrary<T = Record<string, unknown>>(
  library: 'maps' | 'places',
): Promise<T> {
  await loadGoogleMaps();
  return window.google!.maps!.importLibrary!(library) as Promise<T>;
}
