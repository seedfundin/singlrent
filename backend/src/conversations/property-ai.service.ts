import { Injectable } from '@nestjs/common';
import { ListingsService } from '../listings/listings.service';

export type PropertyAssistantReply = {
  body: string;
  needsPropertyContactReply: boolean;
};

function formatNaira(kobo: bigint): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(kobo) / 100);
}

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(value);
}

function rulesText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    return items.length ? items.join(', ') : null;
  }
  if (value && typeof value === 'object') {
    const items = Object.entries(value)
      .filter(([, item]) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
      .map(([key, item]) => `${key.replace(/([A-Z])/g, ' $1')}: ${String(item)}`);
    return items.length ? items.join(', ') : null;
  }
  return null;
}

@Injectable()
export class PropertyAiService {
  constructor(private readonly listingsService: ListingsService) {}

  /**
   * This is intentionally deterministic: it only returns facts already stored
   * on the listing. Any other question is handed to the property contact by
   * ConversationsService, rather than being sent to an external AI provider.
   */
  async answer(listingId: string, question: string, userId?: string): Promise<PropertyAssistantReply> {
    const listing = await this.listingsService.getByPublicId(listingId, userId);
    const normalized = question.toLowerCase().replace(/\s+/g, ' ').trim();
    const answer = (body: string): PropertyAssistantReply => ({ body, needsPropertyContactReply: false });
    const handoff = (): PropertyAssistantReply => ({
      body: 'That detail is not included in this listing, so I will send your question to the property contact.',
      needsPropertyContactReply: true,
    });

    // A keyword match cannot reliably answer a multi-part or conditional
    // question. Escalate rather than presenting a related fact as an answer.
    if (/^(can|could|would|will|do|does|is|are|has|have|may)\b/.test(normalized) ||
        (normalized.match(/\?/g) ?? []).length > 1 ||
        /\b(negotiable|negotiate|discount|refund|refundable|permission|allowed|allow|guarantee|except|unless|condition|how much extra)\b/.test(normalized) ||
        /\b(and|also|but)\b/.test(normalized)) return handoff();

    if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(normalized)) {
      return answer('Hello. I can help with the price, fees, location, availability, lease length, amenities, house rules, and home details shown in this listing.');
    }
    if (/\b(thanks|thank you)\b/.test(normalized)) {
      return answer('You are welcome.');
    }
    if (/\b(service charge|service fee)\b/.test(normalized)) {
      return answer(`The listed service charge is ${formatNaira(listing.serviceChargeKobo)}.`);
    }
    if (/\b(caution|deposit|security fee|security deposit)\b/.test(normalized)) {
      return answer(`The listed caution fee is ${formatNaira(listing.cautionFeeKobo)}.`);
    }
    if (/\b(rent|price|cost|annual rent|yearly rent|per year)\b/.test(normalized)) {
      return answer(`The annual rent is ${formatNaira(listing.annualRentKobo)}.`);
    }
    if (/\b(bedroom|bedrooms)\b/.test(normalized)) {
      return answer(`This home has ${listing.bedrooms} bedroom${listing.bedrooms === 1 ? '' : 's'}.`);
    }
    if (/\b(bathroom|bathrooms|toilet|toilets)\b/.test(normalized)) {
      return answer(`This home has ${listing.bathrooms} bathroom${listing.bathrooms === 1 ? '' : 's'}.`);
    }
    if (/\b(where|address|location|located|area|state|neighbourhood|neighborhood)\b/.test(normalized)) {
      return answer(`The listing location is ${listing.address}, ${listing.area}, ${listing.state}.`);
    }
    if (/\b(available|availability|move in|move-in|when can i move|when.*move)\b/.test(normalized)) {
      const availableFrom = formatDate(listing.availableFrom);
      return answer(`This home is marked ${listing.availability.toLowerCase().replace(/_/g, ' ')}${availableFrom ? ` from ${availableFrom}` : ''}.`);
    }
    if (/\b(lease|minimum stay|duration|how long|tenancy length|contract length)\b/.test(normalized)) {
      return answer(`The minimum lease length is ${listing.minimumLeaseMonths} month${listing.minimumLeaseMonths === 1 ? '' : 's'}.`);
    }
    if (/\b(amenit|facilit|feature|what.*offer|what.*included|included)\b/.test(normalized)) {
      return listing.amenities.length
        ? answer(`The listing includes: ${listing.amenities.join(', ')}.`)
        : answer('No amenities have been listed for this home yet.');
    }
    if (/\b(rule|pet|smok|guest|visitor)\b/.test(normalized)) {
      const rules = rulesText(listing.rules);
      return rules ? answer(`The listed house rules are: ${rules}.`) : handoff();
    }
    if (/\b(property type|home type|apartment|house|studio|room|duplex)\b/.test(normalized)) {
      return answer(`This is listed as a ${listing.propertyType.toLowerCase()}.`);
    }
    if (/\b(about|description|tell me about|what is this home)\b/.test(normalized)) {
      return answer(listing.description);
    }
    if (/\b(agent|landlord|owner|listed by|contact)\b/.test(normalized)) {
      return answer(listing.managingAgent
        ? 'This listing is managed by an agent, who is the main contact for questions about the home.'
        : 'This listing was posted directly by the landlord, who is the main contact for questions about the home.');
    }

    return handoff();
  }
}
