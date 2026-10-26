export function realtimeUrl(): string {
  const configured = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (configured) return configured.replace(/\/$/, '');
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
  return apiUrl.replace(/\/api\/v1\/?$/, '');
}
