import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GeocodingSuggestion = {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
};

type MapboxFeature = {
  id?: unknown;
  properties?: { full_address?: unknown; name?: unknown };
  place_name?: unknown;
  geometry?: { coordinates?: unknown };
};

type MapboxResponse = { features?: unknown };

/**
 * Server-side Mapbox boundary. Controllers and frontend clients remain stable
 * if this implementation is later replaced with another provider.
 */
@Injectable()
export class GeocodingService {
  constructor(private readonly configService: ConfigService) {}

  async search(query: string, limit: number): Promise<GeocodingSuggestion[]> {
    const accessToken = this.configService.get<string>('MAPBOX_ACCESS_TOKEN');
    if (!accessToken) {
      throw new ServiceUnavailableException('Address search is not configured. Add MAPBOX_ACCESS_TOKEN on the server.');
    }

    const url = new URL('/search/geocode/v6/forward', 'https://api.mapbox.com');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('country', 'ng');
    // The resulting point is saved with the listing, so request storage permission explicitly.
    url.searchParams.set('permanent', 'true');
    url.searchParams.set('access_token', accessToken);

    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) }).catch(() => undefined);
    if (!response) throw new ServiceUnavailableException('Unable to reach Mapbox address search');
    const payload = (await response.json().catch(() => undefined)) as MapboxResponse | undefined;
    if (!response.ok) throw new BadGatewayException('Mapbox address search could not complete this request');
    if (!Array.isArray(payload?.features)) throw new BadGatewayException('Mapbox address search returned an invalid response');

    return payload.features.flatMap((item, index) => {
      const result = item as MapboxFeature;
      const address = typeof result.properties?.full_address === 'string'
        ? result.properties.full_address
        : typeof result.place_name === 'string'
          ? result.place_name
          : typeof result.properties?.name === 'string'
            ? result.properties.name
            : undefined;
      const coordinates = result.geometry?.coordinates;
      const longitude = Array.isArray(coordinates) && typeof coordinates[0] === 'number' ? coordinates[0] : undefined;
      const latitude = Array.isArray(coordinates) && typeof coordinates[1] === 'number' ? coordinates[1] : undefined;
      if (!address || latitude === undefined || longitude === undefined || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      return [{
        id: typeof result.id === 'string' ? result.id : `${latitude}:${longitude}:${index}`,
        address,
        latitude,
        longitude,
      }];
    });
  }
}
