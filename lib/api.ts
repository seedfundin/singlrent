export type ApiRole = 'TENANT' | 'LANDLORD' | 'AGENT' | 'ADMIN' | 'SUPER_ADMIN';

export type ApiSession = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: ApiRole[];
  };
};

export type NinVerificationResult = {
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  verified: boolean;
  provider: 'DOJAH';
  providerReference?: string;
  superseded?: boolean;
};

export type ApiListingImage = {
  id: string;
  url: string;
  altText: string | null;
  position: number;
};

export type ApiListing = {
  id: string;
  slug: string;
  title: string;
  description: string;
  propertyType: 'APARTMENT' | 'HOUSE' | 'DUPLEX' | 'STUDIO' | 'ROOM' | 'OTHER';
  source: 'LANDLORD' | 'AGENT';
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'SUSPENDED' | 'ARCHIVED';
  availability: 'AVAILABLE' | 'RENTED' | 'UNAVAILABLE';
  annualRentKobo: string;
  serviceChargeKobo: string;
  cautionFeeKobo: string;
  bedrooms: number;
  bathrooms: number;
  state: string;
  area: string;
  address: string;
  amenities: string[];
  availableFrom: string | null;
  minimumLeaseMonths: number;
  images: ApiListingImage[];
  landlord: { id: string; firstName: string; lastName: string; profileImageUrl: string | null };
  managingAgent: { id: string; firstName: string; lastName: string; profileImageUrl: string | null } | null;
  _count: { savedBy: number; applications: number; maintenanceRequests: number };
};

export type PaginatedResponse<T> = {
  items: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

export type ListingQuery = {
  page?: number;
  pageSize?: number;
  state?: string;
  area?: string;
  bedrooms?: number;
  propertyType?: ApiListing['propertyType'];
};

export type ApiMaintenanceRequest = {
  id: string;
  listingId: string;
  title: string;
  description: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
  listing: { id: string; slug: string; title: string };
  reporter: { id: string; firstName: string; lastName: string };
  updates: { id: string; body: string | null; fromStatus: string | null; toStatus: string | null; createdAt: string; author: { id: string; firstName: string; lastName: string } }[];
};

type ApiErrorResponse = { message?: string | string[] };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')
  : process.env.NODE_ENV === 'development'
    ? 'http://localhost:4000/api/v1'
    : null;
const sessionStorageKey = 'singlerent.session';
const registrationDraftKey = 'singlerent.registration-draft';

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  if (!apiBaseUrl) {
    throw new ApiError('SingleRent API deployment has not been configured yet.', 503);
  }
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = payload as ApiErrorResponse | undefined;
    const message = Array.isArray(error?.message) ? error.message.join(', ') : error?.message;
    throw new ApiError(message ?? 'Something went wrong. Please try again.', response.status);
  }
  return payload as T;
}

function queryString(query: ListingQuery = {}): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const value = params.toString();
  return value ? `?${value}` : '';
}

export const sessionStore = {
  get(): ApiSession | null {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(sessionStorageKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ApiSession;
    } catch {
      window.sessionStorage.removeItem(sessionStorageKey);
      return null;
    }
  },
  set(session: ApiSession): void {
    if (typeof window !== 'undefined') window.sessionStorage.setItem(sessionStorageKey, JSON.stringify(session));
  },
  clear(): void {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(sessionStorageKey);
  },
};

export type RegistrationDraft = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export const registrationDraftStore = {
  get(): RegistrationDraft | null {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(registrationDraftKey);
    return raw ? (JSON.parse(raw) as RegistrationDraft) : null;
  },
  set(draft: RegistrationDraft): void {
    if (typeof window !== 'undefined') window.sessionStorage.setItem(registrationDraftKey, JSON.stringify(draft));
  },
  clear(): void {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(registrationDraftKey);
  },
};

export const api = {
  auth: {
    login(input: { email: string; password: string }): Promise<ApiSession> {
      return request<ApiSession>('/auth/login', { method: 'POST', body: JSON.stringify(input) });
    },
    register(input: RegistrationDraft & { role: 'TENANT' | 'LANDLORD' | 'AGENT' }): Promise<ApiSession> {
      return request<ApiSession>('/auth/register', { method: 'POST', body: JSON.stringify(input) });
    },
    me(token: string): Promise<ApiSession['user']> {
      return request<ApiSession['user']>('/auth/me', {}, token);
    },
    logout(token: string, refreshToken: string): Promise<void> {
      return request<void>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }, token);
    },
  },
  listings: {
    search(query?: ListingQuery): Promise<PaginatedResponse<ApiListing>> {
      return request<PaginatedResponse<ApiListing>>(`/listings${queryString(query)}`);
    },
    mine(token: string, query?: ListingQuery): Promise<PaginatedResponse<ApiListing>> {
      return request<PaginatedResponse<ApiListing>>(`/listings/mine${queryString(query)}`, {}, token);
    },
    saved(token: string, query?: ListingQuery): Promise<PaginatedResponse<ApiListing>> {
      return request<PaginatedResponse<ApiListing>>(`/listings/saved${queryString(query)}`, {}, token);
    },
    detail(idOrSlug: string): Promise<ApiListing> {
      return request<ApiListing>(`/listings/${encodeURIComponent(idOrSlug)}`);
    },
    save(token: string, listingId: string): Promise<void> {
      return request<void>(`/listings/${listingId}/save`, { method: 'POST' }, token);
    },
    unsave(token: string, listingId: string): Promise<void> {
      return request<void>(`/listings/${listingId}/save`, { method: 'DELETE' }, token);
    },
  },
  maintenance: {
    list(token: string, listingId?: string): Promise<PaginatedResponse<ApiMaintenanceRequest>> {
      const query = listingId ? `?listingId=${encodeURIComponent(listingId)}` : '';
      return request<PaginatedResponse<ApiMaintenanceRequest>>(`/maintenance${query}`, {}, token);
    },
    update(token: string, requestId: string, input: { status?: ApiMaintenanceRequest['status']; body?: string }): Promise<ApiMaintenanceRequest> {
      return request<ApiMaintenanceRequest>(`/maintenance/${requestId}`, { method: 'PATCH', body: JSON.stringify(input) }, token);
    },
  },
  users: {
    updateProfile(token: string, input: Record<string, unknown>) {
      return request('/users/me/profile', { method: 'PATCH', body: JSON.stringify(input) }, token);
    },
    sendPhoneVerification(token: string, phone: string) {
      return request<{ id: string; expiresAt: string; developmentCode?: string }>('/users/me/phone-verification', { method: 'POST', body: JSON.stringify({ phone }) }, token);
    },
    confirmPhoneVerification(token: string, challengeId: string, code: string) {
      return request('/users/me/phone-verification/confirm', { method: 'POST', body: JSON.stringify({ challengeId, code }) }, token);
    },
    submitNin(token: string, nin: string) {
      return request<NinVerificationResult>('/users/me/kyc/nin', { method: 'POST', body: JSON.stringify({ nin }) }, token);
    },
  },
};
