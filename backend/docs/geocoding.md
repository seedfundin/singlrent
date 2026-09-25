# Mapbox location configuration

SingleRent uses Mapbox GL JS for map rendering and Mapbox Geocoding for address search. Address search is handled by the backend so the browser never receives the server-side Mapbox token.

Create two Mapbox tokens: a server-side token for geocoding and a public token for map rendering. Add the server token to your local `backend/.env`:

```dotenv
MAPBOX_ACCESS_TOKEN=replace-with-your-server-side-mapbox-token
```

Add the public map-rendering token to the root frontend `.env.local` file:

```dotenv
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=replace-with-your-public-mapbox-token
```

`GET /api/v1/geocoding/search?q=22%20Ikale%20Street%2C%20Mushin%2C%20Lagos` is authenticated and restricted to landlord and agent roles. The frontend debounces requests to that endpoint and never sends the final map pin back to the geocoder. Mapbox receives `permanent=true` because the landlord’s selected coordinates are stored with a listing.

To switch providers later, keep the endpoint response shape (`id`, `address`, `latitude`, `longitude`) and replace the implementation in `src/geocoding/geocoding.service.ts`. The frontend does not need to change.
