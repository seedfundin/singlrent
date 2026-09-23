import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GeocodingSuggestion = {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
};

type GeoapifyResult = {
  place_id?: unknown;
  formatted?: unknown;
  lat?: unknown;
  lon?: unknown;
};

type GeoapifyResponse = { results?: unknown };

/**
 * Server-side geocoding boundary. Add another provider branch here (or extract
 * one into its own provider class) without changing controllers or clients.
 */
@Injectable()
export class GeocodingService {
  constructor(private readonly configService: ConfigService) {}

  async search(query: string, limit: number): Promise<GeocodingSuggestion[]> {
    const provider = this.configService.getOrThrow<'geoapify'>('GEOCODING_PROVIDER');
    if (provider === 'geoapify') return this.searchGeoapify(query, limit);
    throw new ServiceUnavailableException('The configured geocoding provider is not supported');
  }

  private async searchGeoapify(query: string, limit: number): Promise<GeocodingSuggestion[]> {
    const apiKey = this.configService.get<string>('GEOCODING_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('Address search is not configured. Add GEOCODING_API_KEY on the server.');
    }

    const url = new URL('/v1/geocode/autocomplete', this.configService.getOrThrow<string>('GEOCODING_BASE_URL'));
    url.searchParams.set('text', query);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('format', 'json');
    url.searchParams.set('apiKey', apiKey);
    const countryCode = this.configService.get<string>('GEOCODING_COUNTRY_CODE');
    if (countryCode) url.searchParams.set('filter', `countrycode:${countryCode.toLowerCase()}`);

    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) }).catch(() => undefined);
    if (!response) throw new ServiceUnavailableException('Unable to reach the address search provider');
    const payload = (await response.json().catch(() => undefined)) as GeoapifyResponse | undefined;
    if (!response.ok) throw new BadGatewayException('The address search provider could not complete this request');
    if (!Array.isArray(payload?.results)) throw new BadGatewayException('The address search provider returned an invalid response');

    return payload.results.flatMap((item, index) => {
      const result = item as GeoapifyResult;
      const address = typeof result.formatted === 'string' ? result.formatted : undefined;
      const latitude = typeof result.lat === 'number' ? result.lat : undefined;
      const longitude = typeof result.lon === 'number' ? result.lon : undefined;
      if (!address || latitude === undefined || longitude === undefined || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      return [{
        id: typeof result.place_id === 'string' ? result.place_id : `${latitude}:${longitude}:${index}`,
        address,
        latitude,
        longitude,
      }];
    });
  }
}
