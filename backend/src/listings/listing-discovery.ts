import { Listing, PropertyType } from '@prisma/client';

type DiscoveryQuery = {
  search?: string;
  state?: string;
  area?: string;
  propertyType?: PropertyType;
  bedrooms?: number;
  amenities?: string;
};

type AmenitySignal = {
  label: string;
  searchTerms: string[];
  listingTerms: string[];
};

const amenitySignals: AmenitySignal[] = [
  {
    label: 'a prepaid meter',
    searchTerms: ['prepaid meter', 'prepaid electricity', 'prepaid'],
    listingTerms: ['prepaid meter', 'prepaid electricity'],
  },
  {
    label: 'Band A electricity',
    searchTerms: ['band a', 'band-a electricity'],
    listingTerms: ['band a electricity', 'band a'],
  },
  {
    label: 'a private bathroom',
    searchTerms: ['private bathroom', 'private toilet', 'ensuite', 'en suite'],
    listingTerms: ['private bathroom', 'private toilet', 'ensuite', 'en suite'],
  },
  {
    label: 'a private entrance',
    searchTerms: ['private entrance', 'own entrance'],
    listingTerms: ['private entrance', 'own entrance'],
  },
  {
    label: 'a private kitchen',
    searchTerms: ['private kitchen', 'own kitchen'],
    listingTerms: ['private kitchen', 'own kitchen'],
  },
  {
    label: 'borehole water',
    searchTerms: ['borehole'],
    listingTerms: ['borehole'],
  },
  {
    label: 'security',
    searchTerms: ['security', 'security guard', 'gated'],
    listingTerms: ['security personnel', 'gated compound', 'cctv'],
  },
  {
    label: 'CCTV',
    searchTerms: ['cctv', 'surveillance camera'],
    listingTerms: ['cctv', 'surveillance'],
  },
  {
    label: 'power backup',
    searchTerms: ['power backup', 'inverter', 'solar'],
    listingTerms: ['power backup', 'inverter', 'solar'],
  },
  {
    label: 'fibre internet',
    searchTerms: ['fibre internet', 'fiber internet', 'fast internet', 'wifi'],
    listingTerms: ['fibre internet', 'fiber internet', 'internet ready'],
  },
  {
    label: 'air conditioning',
    searchTerms: ['air conditioning', 'air conditioner'],
    listingTerms: ['air conditioning', 'air conditioner'],
  },
  {
    label: 'furnishing',
    searchTerms: ['furnished', 'furnishing'],
    listingTerms: ['furnished'],
  },
  {
    label: 'parking',
    searchTerms: ['parking', 'park car'],
    listingTerms: ['parking'],
  },
  {
    label: 'a water heater',
    searchTerms: ['water heater', 'hot water'],
    listingTerms: ['water heater'],
  },
  {
    label: 'a fitted kitchen',
    searchTerms: ['fitted kitchen', 'modern kitchen'],
    listingTerms: ['fitted kitchen'],
  },
];

export type ListingDiscoveryIntent = {
  bedrooms?: number;
  propertyType?: PropertyType;
  location?: string;
  amenities: AmenitySignal[];
  criteria: string[];
};

export type ListingDiscoveryScore = {
  score: number;
  exact: boolean;
  matchedCriteria: number;
  criteriaCount: number;
};

const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const bedroomWords: Record<string, number> = {
  studio: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

function textIncludes(value: string, phrase: string) {
  return normalize(value).includes(normalize(phrase));
}

function searchBedrooms(search: string) {
  const numeric = search.match(/\b(\d+)[\s-]*(?:bed(?:room)?s?|br)\b/i);
  if (numeric) return Number(numeric[1]);
  const written = search.match(/\b(one|two|three|four|five|six)[\s-]*(?:bed(?:room)?s?|br)\b/i);
  const word = written?.[1]?.toLocaleLowerCase();
  return word ? bedroomWords[word] : undefined;
}

function searchPropertyType(search: string): PropertyType | undefined {
  const value = normalize(search);
  if (value.includes('self contained') || value.includes('self contain') || value.includes('studio')) return PropertyType.STUDIO;
  if (value.includes('duplex')) return PropertyType.DUPLEX;
  if (value.includes('flat') || value.includes('apartment')) return PropertyType.APARTMENT;
  if (value.includes('room')) return PropertyType.ROOM;
  if (value.includes('house')) return PropertyType.HOUSE;
  return undefined;
}

function searchLocation(search: string) {
  const match = search.match(/\b(?:in|around|near|at)\s+(.+?)(?=\s+(?:with|that|which|having|and)\b|,|$)/i);
  const value = match?.[1]?.trim();
  if (value && value.length > 1) return value;

  // Keep the original simple behaviour too: a visitor who enters only
  // "Surulere" should not need to phrase it as "in Surulere".
  const amenityWords = new Set(amenitySignals.flatMap((signal) => signal.searchTerms.flatMap((term) => normalize(term).split(' '))));
  const ignoredWords = new Set([
    'a', 'an', 'and', 'apartment', 'at', 'bed', 'bedroom', 'bedrooms',
    'br', 'flat', 'for', 'house', 'i', 'in', 'looking', 'near', 'need',
    'of', 'one', 'please', 'room', 'rooms', 'self', 'studio', 'the', 'this',
    'three', 'to', 'two', 'want', 'with',
  ]);
  const candidate = normalize(search)
    .split(' ')
    .filter((word) => word.length > 1 && !ignoredWords.has(word) && !amenityWords.has(word) && !/^\d+$/.test(word));
  return candidate.length && candidate.length <= 4 ? candidate.join(' ') : undefined;
}

export function hasDiscoveryCriteria(query: DiscoveryQuery) {
  return Boolean(query.search?.trim() || query.state || query.area || query.propertyType || query.bedrooms !== undefined || query.amenities);
}

export function buildListingDiscoveryIntent(query: DiscoveryQuery): ListingDiscoveryIntent {
  const search = query.search?.trim() ?? '';
  const searchNormalized = normalize(search);
  const suppliedAmenities = query.amenities?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  const amenities = amenitySignals.filter((signal) =>
    signal.searchTerms.some((term) => searchNormalized.includes(normalize(term))) ||
    suppliedAmenities.some((amenity) => signal.listingTerms.some((term) => textIncludes(amenity, term))),
  );
  const propertyType = query.propertyType ?? searchPropertyType(search);
  const bedrooms = query.bedrooms ?? searchBedrooms(search);
  const location = query.area ?? query.state ?? searchLocation(search);
  const criteria = [
    bedrooms === 0 ? 'studio' : bedrooms ? `${bedrooms}-bedroom` : undefined,
    propertyType ? propertyType.toLocaleLowerCase().replace('_', ' ') : undefined,
    location,
    ...amenities.map((signal) => signal.label),
  ].filter((value): value is string => Boolean(value));

  return { bedrooms, propertyType, location, amenities, criteria };
}

export function scoreListingForDiscovery(listing: Pick<Listing, 'bedrooms' | 'propertyType' | 'amenities' | 'area' | 'state' | 'address' | 'title' | 'description'>, intent: ListingDiscoveryIntent): ListingDiscoveryScore {
  let score = 0;
  let matchedCriteria = 0;
  let criteriaCount = 0;

  if (intent.bedrooms !== undefined) {
    criteriaCount += 1;
    const difference = Math.abs(listing.bedrooms - intent.bedrooms);
    if (difference === 0) {
      score += 70;
      matchedCriteria += 1;
    } else {
      score -= Math.min(50, difference * 18);
    }
  }

  if (intent.propertyType) {
    criteriaCount += 1;
    if (listing.propertyType === intent.propertyType) {
      score += 50;
      matchedCriteria += 1;
    }
  }

  if (intent.location) {
    criteriaCount += 1;
    const listingLocation = normalize([listing.area, listing.state, listing.address, listing.title, listing.description].join(' '));
    const tokens = normalize(intent.location).split(' ').filter((token) => token.length > 1);
    const locationMatches = tokens.filter((token) => listingLocation.includes(token)).length;
    if (tokens.length && locationMatches === tokens.length) {
      score += 60;
      matchedCriteria += 1;
    } else if (locationMatches) {
      score += Math.round((locationMatches / Math.max(tokens.length, 1)) * 24);
    }
  }

  const listingAmenities = listing.amenities.join(' ');
  for (const amenity of intent.amenities) {
    criteriaCount += 1;
    if (amenity.listingTerms.some((term) => textIncludes(listingAmenities, term))) {
      score += 34;
      matchedCriteria += 1;
    }
  }

  return {
    score,
    exact: criteriaCount > 0 && matchedCriteria === criteriaCount,
    matchedCriteria,
    criteriaCount,
  };
}
