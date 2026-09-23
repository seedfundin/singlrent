# Address search configuration

SingleRent renders maps with MapLibre and OpenStreetMap tiles. Address search is deliberately handled by the backend so a browser never calls the public OpenStreetMap Nominatim service or receives a provider key.

The current provider adapter uses Geoapify Address Autocomplete. Add the following to your local `backend/.env` after creating a Geoapify API key:

```dotenv
GEOCODING_PROVIDER=geoapify
GEOCODING_API_KEY=replace-with-your-server-side-key
GEOCODING_BASE_URL=https://api.geoapify.com
GEOCODING_COUNTRY_CODE=ng
```

`GET /api/v1/geocoding/search?q=22%20Ikale%20Street%2C%20Mushin%2C%20Lagos` is authenticated and restricted to landlord and agent roles. The frontend debounces requests to that endpoint and never sends the final map pin back to the geocoder. If the provider is not configured, the endpoint returns a clear `503` response rather than silently falling back to public Nominatim.

To switch providers later, keep the endpoint response shape (`id`, `address`, `latitude`, `longitude`) and add a provider branch or provider class in `src/geocoding/geocoding.service.ts`. The frontend does not need to change.
