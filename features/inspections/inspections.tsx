"use client";

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppSession } from '@/features/app/app-provider';
import { requestPushPermissionPrompt } from '@/features/notifications/push-client';
import { api, type InspectionAvailability, type InspectionBooking, type InspectionSlot, type InspectionWindow } from '@/lib/api';
import './inspections.css';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const display = (value: string, timezone = 'Africa/Lagos') => new Intl.DateTimeFormat('en-NG', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
function toUtc(value: string, timezone: string) {
  const [date, time] = value.split('T');
  if (!date || !time) throw new Error('Choose a date and time.');
  const [year = 0, month = 0, day = 0] = date.split('-').map(Number);
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(candidate));
    const get = (key: string) => Number(parts.find((part) => part.type === key)?.value);
    const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    if (local === target) return new Date(candidate).toISOString();
    candidate += target - local;
  }
  throw new Error('This local time does not exist in the property timezone. Choose another time.');
}

export function InspectionRequest({ listingId, onSignIn }: { listingId: string; onSignIn: () => void }) {
  const { session } = useAppSession();
  const [slots, setSlots] = useState<InspectionSlot[] | null>(null);
  const [timezone, setTimezone] = useState('Africa/Lagos');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [proposed, setProposed] = useState('');
  const [requestMode, setRequestMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => { try { const result = await api.inspections.slots(listingId); setSlots(result.slots); setTimezone(result.timezone); setError(''); } catch (e) { setError(errorMessage(e)); setSlots(null); } }, [listingId]);
  useEffect(() => { void load(); }, [load]);
  const submit = async () => {
    if (!session) { onSignIn(); return; }
    setBusy(true); setError('');
    try {
      const booking = await api.inspections.book(session.accessToken, listingId, requestMode || !slots?.length ? toUtc(proposed, timezone) : selected, requestMode || !slots?.length ? 'REQUEST' : 'SLOT');
      setMessage(booking.status === 'CONFIRMED' ? 'Your inspection has been confirmed.' : 'Inspection request sent. Awaiting confirmation.');
      setOpen(false); setSelected(''); setProposed(''); await load();
      requestPushPermissionPrompt('inspection');
    } catch (e) { const message = errorMessage(e); await load(); setError(message); } finally { setBusy(false); }
  };
  return <section className="inspection-panel"><Button variant="outline" disabled={slots === null} onClick={() => { setOpen(!open); setRequestMode(!slots?.length); }}>{slots?.length ? 'Schedule Inspection' : 'Request Inspection'}</Button>{slots === null && <small>{error || 'Checking inspection availability…'} {error && <button type="button" onClick={() => void load()}>Try again</button>}</small>}{message && <p role="status">{message}</p>}{error && slots !== null && <p role="alert">{error}</p>}{open && slots !== null && <div className="inspection-form"><p>Times are shown in {timezone}.</p>{!requestMode && slots.length > 0 ? <><label>Available date and time<select value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">Select a time</option>{slots.map((slot) => <option key={slot.startsAt} value={slot.startsAt}>{display(slot.startsAt, timezone)}</option>)}</select></label><button type="button" onClick={() => setRequestMode(true)}>Request another date</button></> : <><p>{slots.length ? 'Propose another date for the host to approve.' : 'No inspection dates are currently available. Propose a date for the host to approve.'}</p><label>Preferred date and time<input type="datetime-local" value={proposed} onChange={(e) => setProposed(e.target.value)} /></label>{slots.length > 0 && <button type="button" onClick={() => setRequestMode(false)}>Choose an available slot</button>}</>}<Button disabled={busy || (requestMode || !slots.length ? !proposed : !selected)} onClick={() => void submit()}>{busy ? 'Submitting…' : 'Send inspection request'}</Button></div>}</section>;
}

export function InspectionSettings({ listingId, token }: { listingId: string; token: string }) {
  const [config, setConfig] = useState<InspectionAvailability | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.inspections.availability(token, listingId).then(setConfig).catch((e) => setError(errorMessage(e))); }, [listingId, token]);
  const setMode = (mode: InspectionAvailability['mode']) => setConfig((current) => current ? { ...current, mode, windows: [] } : current);
  const updateWindow = (index: number, value: InspectionWindow) => setConfig((current) => current ? { ...current, windows: current.windows.map((window, i) => i === index ? value : window) } : current);
  const save = async () => { if (!config) return; setBusy(true); setError(''); try { await api.inspections.saveAvailability(token, listingId, config); setMessage('Inspection availability saved.'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  return <section className="panel inspection-panel"><h2>Inspection availability</h2><p>Optional. Listings can be published without setting inspection times.</p>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}{config && <div className="inspection-form"><label>Scheduling mode<select value={config.mode} onChange={(e) => setMode(e.target.value as InspectionAvailability['mode'])}><option value="BY_REQUEST">By request</option><option value="WEEKLY">Weekly availability</option><option value="SPECIFIC_DATES">Specific dates</option></select></label><label>Property timezone<input value={config.timezone} onChange={(e) => setConfig({ ...config, timezone: e.target.value })} /></label><label>Duration<select value={config.durationMinutes} onChange={(e) => setConfig({ ...config, durationMinutes: Number(e.target.value) as 30 | 60 })}><option value={30}>30 minutes</option><option value={60}>60 minutes</option></select></label><label>Offered-slot confirmation<select value={config.automaticConfirmation ? 'auto' : 'manual'} onChange={(e) => setConfig({ ...config, automaticConfirmation: e.target.value === 'auto' })}><option value="manual">Manual approval</option><option value="auto">Automatic confirmation</option></select></label><small>Tenant-proposed dates always require approval.</small>{config.windows.map((window, index) => <div className="inspection-window" key={index}>{config.mode === 'WEEKLY' ? <select aria-label="Day" value={window.day ?? 1} onChange={(e) => updateWindow(index, { ...window, day: Number(e.target.value) })}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((name, day) => <option value={day} key={name}>{name}</option>)}</select> : <input aria-label="Date" type="date" value={window.date ?? ''} onChange={(e) => updateWindow(index, { ...window, date: e.target.value })} />}<input aria-label="Start time" type="time" value={window.start} onChange={(e) => updateWindow(index, { ...window, start: e.target.value })} /><input aria-label="End time" type="time" value={window.end} onChange={(e) => updateWindow(index, { ...window, end: e.target.value })} /><button type="button" onClick={() => setConfig({ ...config, windows: config.windows.filter((_, i) => i !== index) })}>Remove</button></div>)}{config.mode !== 'BY_REQUEST' && <Button variant="outline" onClick={() => setConfig({ ...config, windows: [...config.windows, config.mode === 'WEEKLY' ? { day: 1, start: '10:00', end: '14:00' } : { date: '', start: '10:00', end: '14:00' }] })}>Add availability</Button>}<Button disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save inspection settings'}</Button></div>}</section>;
}

export function InspectionDashboard({ token, userId, manager }: { token: string; userId: string; manager: boolean }) {
  const [items, setItems] = useState<InspectionBooking[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [proposal, setProposal] = useState<Record<string, string>>({});
  const load = useCallback(async () => { try { setItems(await api.inspections.list(token)); } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); } }, [token]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (loading) return;
    const anchor = window.location.hash.slice(1);
    if (/^inspection-[0-9a-f-]{36}$/i.test(anchor)) document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
  }, [loading, items]);
  const act = async (item: InspectionBooking, action: 'approve' | 'decline' | 'cancel' | 'complete' | 'confirm-attendance' | 'dispute-attendance' | 'propose' | 'accept-proposal' | 'reject-proposal') => {
    if (action === 'cancel' && !window.confirm('Cancel this inspection?')) return;
    setBusy(item.id); setError('');
    try { await api.inspections.action(token, item.id, action, action === 'propose' ? toUtc(proposal[item.id] ?? '', item.timezone) : undefined); await load(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(''); }
  };
  return <section className="panel inspection-panel"><h2>{manager ? 'Inspection Requests' : 'My Inspections'}</h2>{loading && <p>Loading inspections…</p>}{error && <p role="alert">{error}</p>}{!loading && !items.length && <p>No inspections yet.</p>}{items.map((item) => { const host = item.hostId === userId && item.hostId === (item.listing?.managingAgentId ?? item.listing?.landlordId); const party = item.tenantId === userId || host; const active = item.status === 'PENDING' || item.status === 'CONFIRMED'; return <article className="inspection-record" id={`inspection-${item.id}`} key={item.id}><b>{item.listing?.title ?? 'Property'}</b><p>{display(item.startsAt, item.timezone)} · {item.status.toLowerCase()} · {item.timezone}</p><small>{manager ? `Tenant: ${item.tenant?.firstName ?? ''} ${item.tenant?.lastName ?? ''}` : `Host: ${item.host?.firstName ?? ''} ${item.host?.lastName ?? ''}`}</small>{item.proposedStartsAt && <p>Alternative: {display(item.proposedStartsAt, item.timezone)} · awaiting {item.proposedById === userId ? 'the other party' : 'your response'}</p>}{party && active && <div className="inspection-actions">{host && item.status === 'PENDING' && !item.proposedStartsAt && <Button disabled={!!busy} onClick={() => void act(item, 'approve')}>Approve</Button>}{host && item.status === 'PENDING' && <Button disabled={!!busy} variant="outline" onClick={() => void act(item, 'decline')}>Decline</Button>}{item.proposedStartsAt && item.proposedById !== userId && <Button disabled={!!busy} onClick={() => void act(item, 'accept-proposal')}>Accept alternative</Button>}{item.proposedStartsAt && item.proposedById !== userId && <Button disabled={!!busy} variant="outline" onClick={() => void act(item, 'reject-proposal')}>Decline alternative</Button>}<Button disabled={!!busy} variant="outline" onClick={() => void act(item, 'cancel')}>Cancel</Button><label>Propose another time ({item.timezone})<input type="datetime-local" value={proposal[item.id] ?? ''} onChange={(e) => setProposal({ ...proposal, [item.id]: e.target.value })} /></label><Button disabled={!!busy || !proposal[item.id]} variant="outline" onClick={() => void act(item, 'propose')}>Request reschedule</Button></div>}{item.status === 'CONFIRMED' && new Date(item.startsAt) <= new Date() && <div className="inspection-actions">{(item.landlordId === userId || item.agentId === userId) && !item.hostCompletedAt && <Button disabled={!!busy} onClick={() => void act(item, 'complete')}>Mark inspection completed</Button>}{item.tenantId === userId && !item.tenantConfirmedAt && <><Button disabled={!!busy} onClick={() => void act(item, 'confirm-attendance')}>Confirm inspection happened</Button><Button disabled={!!busy} variant="outline" onClick={() => void act(item, 'dispute-attendance')}>Dispute attendance</Button></>}{item.tenantDisputedAt && <p>Attendance disputed. Review eligibility is on hold until the tenant confirms.</p>}{item.hostCompletedAt && !item.tenantConfirmedAt && !item.tenantDisputedAt && <p>Awaiting tenant confirmation.</p>}</div>}{item.status === 'COMPLETED' && <InspectionReviewActions item={item} token={token} />}</article>; })}</section>;
}

function InspectionReviewActions({ item, token }: { item: InspectionBooking; token: string }) {
  const [targets, setTargets] = useState<Array<'LISTING' | 'LANDLORD' | 'AGENT' | 'TENANT'>>([]);
  const [target, setTarget] = useState<'LISTING' | 'LANDLORD' | 'AGENT' | 'TENANT' | null>(null);
  const [score, setScore] = useState(5);
  const [dimensions, setDimensions] = useState({ attendance: 5, punctuality: 5, communication: 5 });
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const rows = await api.reviews.inspectionOpportunities(token); setTargets(rows.find((row) => row.inspectionId === item.id)?.targets ?? []); }
    catch (e) { setError(errorMessage(e)); }
  }, [token, item.id]);
  useEffect(() => { void load(); }, [load]);
  const submit = async () => {
    if (!target) return;
    setBusy(true); setError('');
    try { await api.reviews.create(token, { inspectionId: item.id, targetType: target, score, body: body.trim(), ratingDimensions: target === 'TENANT' ? dimensions : undefined }); setBody(''); setTarget(null); await load(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return <div className="inspection-form"><small>Verified inspection feedback</small>{error && <p role="alert">{error}</p>}<div className="inspection-actions">{targets.map((type) => <Button key={type} variant="outline" disabled={busy} onClick={() => setTarget(type)}>Review {type === 'LISTING' ? 'Property' : type.charAt(0) + type.slice(1).toLowerCase()}</Button>)}</div>{target && <div className="inspection-form"><label>Rating<select value={score} onChange={(event) => setScore(Number(event.target.value))}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>{target === 'TENANT' && <fieldset className="inspection-review-dimensions"><legend>Inspection interaction only</legend><small>Rate attendance, punctuality and communication. This does not affect tenancy reliability.</small>{([['attendance', 'Attendance'], ['punctuality', 'Punctuality'], ['communication', 'Communication']] as const).map(([key, label]) => <label key={key}>{label}<select value={dimensions[key]} onChange={(event) => setDimensions((current) => ({ ...current, [key]: Number(event.target.value) }))}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value}/5</option>)}</select></label>)}</fieldset>}<label>Your review<textarea value={body} minLength={10} maxLength={2000} onChange={(event) => setBody(event.target.value)} placeholder={target === 'TENANT' ? 'Share factual feedback about the inspection interaction.' : undefined} /></label><Button disabled={busy || body.trim().length < 10} onClick={() => void submit()}>Publish review</Button><Button variant="outline" disabled={busy} onClick={() => setTarget(null)}>Cancel</Button></div>}</div>;
}
