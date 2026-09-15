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
