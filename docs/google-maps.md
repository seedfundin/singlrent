# Google Maps setup

SingleRent uses Google Maps in the browser only. Add this to the root `.env.local` file:

```dotenv
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=replace-with-your-browser-key
```

The key is intentionally public to the browser, so restrict it in Google Cloud Console by HTTP referrer (at minimum `http://localhost:3000/*` for local development and the production domain when deployed). Do not add a Google service-account credential or unrestricted server key to the frontend or backend.

Enable these Google Maps Platform APIs in the same Google Cloud project:

- Maps JavaScript API
- Places API (New)

The listing form loads the Places library only after a landlord or agent has entered at least three address characters and paused for 300 ms. It uses the Place Autocomplete Data API with one session token per search, then requests only the selected place's formatted address and location fields. It then saves the final marker latitude and longitude already present on `Listing`.

Property cards never load Google Maps. On a property detail page, the default **Map** tab initializes only the map. **Street View** is a separate dynamic client-only import and initializes only after the visitor selects that tab. It uses the saved listing coordinates directly and shows an availability message when no panorama is nearby.
