'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Bath,
  BedDouble,
  Building2,
  Check,
  CircleAlert,
  CircleCheck,
  Clock3,
  Heart,
  MapPin,
  MessageCircle,
  Plus,
  ShieldCheck,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Shell } from '@/features/app/single-rent-app';
import type { View } from '@/lib/routes';
import { api, type ApiListing, type ApiMaintenanceRequest, sessionStore } from '@/lib/api';
import { formatNaira } from '@/lib/pricing';
import './portfolio.css';

type Go = (view: View, query?: Record<string, string>) => void;
type Manager = 'landlord' | 'agent';

function nairaFromKobo(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount / 100 : 0;
}

function homeImage(home: ApiListing) {
  return home.images[0]?.url;
}

function HomePhoto({ home, alt = '' }: { home: ApiListing; alt?: string }) {
  const image = homeImage(home);
  return image ? <img src={image} alt={alt || home.title} referrerPolicy="no-referrer" /> : <span className="portfolio-photo-empty"><Building2 size={18} /> Photo pending</span>;
}

function useListings(kind: 'saved' | 'mine') {
  const [homes, setHomes] = useState<ApiListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    const session = sessionStore.get();
    if (!session) {
      setHomes([]);
      setError('Sign in to view your homes.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const request = kind === 'saved' ? api.listings.saved(session.accessToken, { pageSize: 50 }) : api.listings.mine(session.accessToken, { pageSize: 50 });
    request
      .then((response) => setHomes(response.items))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Unable to load homes.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [kind]);
  return { homes, loading, error, reload: load, setHomes };
}

function Status({
  children,
  tone = 'green',
}: {
  children: React.ReactNode;
  tone?: 'green' | 'gold' | 'red' | 'blue' | 'slate';
}) {
  return <span className={`status ${tone}`}>{children}</span>;
}

function managerViews(manager: Manager) {
  return {
    homes: manager === 'agent' ? 'agent-homes' : 'landlord-homes',
    home: manager === 'agent' ? 'agent-home' : 'landlord-home',
    maintenance:
      manager === 'agent' ? 'agent-maintenance' : 'landlord-maintenance',
  } as const;
}

function managerCopy(manager: Manager) {
  return manager === 'agent'
    ? {
        heading: 'Managed homes',
        copy: 'See the homes you manage, their tenants and incoming maintenance cases.',
        eyebrow: 'Agent property management',
        owner: 'Managed for Jide Ojo',
        add: 'Add a managed property',
      }
    : {
        heading: 'My homes',
        copy: 'See every home you have created, its tenancy and property activity.',
        eyebrow: 'Property portfolio',
        owner: 'Owned by Jide Ojo',
        add: 'Add a property',
      };
}

export function SavedHomes({ go }: { go: Go }) {
  const { homes: saved, loading, error, setHomes } = useListings('saved');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const remove = async (home: ApiListing) => {
    const session = sessionStore.get();
    if (!session) return go('sign-in');
    setRemovingId(home.id);
    try {
      await api.listings.unsave(session.accessToken, home.id);
      setHomes((current) => current.filter((item) => item.id !== home.id));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Shell go={go} title="Saved homes">
      <div className="page saved-homes-page">
        <div className="page-title">
          <span>
            <small>Your shortlist</small>
            <h1>Saved homes</h1>
            <p>Keep the homes you are considering in one place.</p>
          </span>
          <Button onClick={() => go('explore')}>
            Explore homes <ArrowRight size={14} />
          </Button>
        </div>

        {loading ? <section className="saved-empty panel"><Clock3 size={22} /><h2>Loading saved homes…</h2></section> : error ? (
          <section className="saved-empty panel"><CircleAlert size={22} /><h2>{error}</h2><Button onClick={() => go('sign-in')}>Sign in</Button></section>
        ) : saved.length ? (
          <div className="saved-home-grid">
            {saved.map((home) => (
              <article className="saved-home-card" key={home.id}>
                <HomePhoto home={home} />
                <div className="saved-home-copy">
                  <div>
                    <Status tone="green">
                      <ShieldCheck size={11} /> Verified
                    </Status>
                    <button
                      className="saved-heart"
                      aria-label={`Remove ${home.title} from saved homes`}
                      onClick={() => void remove(home)}
                      disabled={removingId === home.id}
                    >
                      <Heart size={16} fill="currentColor" />
                    </button>
                  </div>
                  <strong>{formatNaira(nairaFromKobo(home.annualRentKobo))} / year</strong>
                  <h2>{home.title}</h2>
                  <p>
                    <MapPin size={13} /> {home.area}, {home.state}
                  </p>
                  <span className="saved-home-specs">
                    <BedDouble size={14} /> {home.bedrooms} beds <Bath size={14} /> {home.bathrooms} baths
                  </span>
                  <Button variant="outline" onClick={() => go('listing', { listing: home.id })}>
                    View home <ArrowRight size={14} />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <section className="saved-empty panel">
            <i>
              <Heart size={22} />
            </i>
            <h2>Your saved homes will appear here.</h2>
            <p>Explore verified homes and save the ones you want to compare later.</p>
            <Button onClick={() => go('explore')}>Explore homes</Button>
          </section>
        )}
      </div>
    </Shell>
  );
}

export function ManagedHomes({
  go,
  manager,
}: {
  go: Go;
  manager: Manager;
}) {
  const copy = managerCopy(manager);
  const views = managerViews(manager);
  const { homes, loading, error } = useListings('mine');
  const available = homes.filter((home) => home.availability === 'AVAILABLE').length;
  const maintenance = homes.reduce((count, home) => count + home._count.maintenanceRequests, 0);

  return (
    <Shell go={go} role={manager} title={copy.heading}>
      <div className="page managed-homes-page">
        <div className="page-title">
          <span>
            <small>{copy.eyebrow}</small>
            <h1>{copy.heading}</h1>
            <p>{copy.copy}</p>
          </span>
          <Button onClick={() => go('wizard')}>
            <Plus size={14} /> {copy.add}
          </Button>
        </div>

        <section className="home-portfolio-summary">
          <span>
            <Building2 size={17} />
            <b>{homes.length} {homes.length === 1 ? 'home' : 'homes'}</b>
            <small>{available} available</small>
          </span>
          <span>
            <Users size={17} />
            <b>{homes.reduce((count, home) => count + home._count.applications, 0)} applications</b>
            <small>Application data for your listings</small>
          </span>
          <span>
            <Wrench size={17} />
            <b>{maintenance} maintenance cases</b>
            <small>Across your current homes</small>
          </span>
        </section>

        <section className="portfolio-list panel">
          <div className="portfolio-list-head">
            <span>Home</span>
            <span>Tenant</span>
            <span>Maintenance</span>
            <span />
          </div>
          {loading ? <div className="portfolio-empty">Loading your homes…</div> : error ? <div className="portfolio-empty">{error}</div> : homes.length ? homes.map((home) => (
            <button
              className="portfolio-row"
              key={home.id}
              onClick={() => go(views.home, { listing: home.id })}
            >
              <span className="portfolio-property">
                <HomePhoto home={home} />
                <span>
                  <b>{home.title}</b>
                  <small>
                    <MapPin size={11} /> {home.area}, {home.state} · {formatNaira(nairaFromKobo(home.annualRentKobo))} / year
                  </small>
                  <Status tone={home.availability === 'AVAILABLE' ? 'green' : 'slate'}>
                    {home.availability.toLowerCase()}
                  </Status>
                </span>
              </span>
              <span className="portfolio-tenant">
                <i>{home._count.applications}</i>
                <span>
                  <b>{home._count.applications ? `${home._count.applications} applications` : 'No applications yet'}</b>
                  <small>Tenancy data appears after an application is approved.</small>
                </span>
              </span>
              <span className="portfolio-maintenance">
                <Status tone={home._count.maintenanceRequests ? 'gold' : 'slate'}>
                  {home._count.maintenanceRequests ? <Wrench size={11} /> : <Check size={11} />}
                  {home._count.maintenanceRequests ? `${home._count.maintenanceRequests} open cases` : 'No open issues'}
                </Status>
              </span>
              <ArrowRight size={15} />
            </button>
          )) : <div className="portfolio-empty">You have not created any homes yet.</div>}
        </section>
      </div>
    </Shell>
  );
}

export function ManagedHomeDetails({
  go,
  manager,
}: {
  go: Go;
  manager: Manager;
}) {
  const copy = managerCopy(manager);
  const views = managerViews(manager);
  const searchParams = useSearchParams();
  const listingId = searchParams.get('listing');
  const [home, setHome] = useState<ApiListing | null>(null);
  const [loading, setLoading] = useState(Boolean(listingId));
  const [error, setError] = useState<string | null>(listingId ? null : 'Select one of your homes to view its details.');
  useEffect(() => {
    if (!listingId) return;
    api.listings.detail(listingId)
      .then(setHome)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Unable to load this home.'))
      .finally(() => setLoading(false));
  }, [listingId]);

  if (loading || error || !home) {
    return (
      <Shell go={go} role={manager} title="Home details">
        <div className="page"><button className="back" onClick={() => go(views.homes)}><ArrowLeft size={14} /> {copy.heading}</button><section className="saved-empty panel"><Building2 size={22} /><h2>{loading ? 'Loading home details…' : error}</h2><Button onClick={() => go(views.homes)}>Back to {copy.heading}</Button></section></div>
      </Shell>
    );
  }

  return (
    <Shell go={go} role={manager} title="Home details">
      <div className="page home-details-page">
        <button className="back" onClick={() => go(views.homes)}>
          <ArrowLeft size={14} /> {copy.heading}
        </button>
        <section className="home-detail-hero">
          <HomePhoto home={home} />
          <span>
            <small>{copy.owner}</small>
            <h1>{home.title}</h1>
            <p>
              <MapPin size={13} /> {home.address}, {home.area}, {home.state}
            </p>
            <div>
              <Status>
                <CircleCheck size={11} /> {home.availability.toLowerCase()}
              </Status>
              <Status tone="blue">
                <BedDouble size={11} /> {home.bedrooms} bedrooms
              </Status>
              <Status tone="gold">{formatNaira(nairaFromKobo(home.annualRentKobo))} / year</Status>
            </div>
          </span>
        </section>

        <div className="home-detail-grid">
          <section className="panel home-occupants">
            <div className="subhead">
              <span>
                <small>Current occupants</small>
                <h2>Who is living here</h2>
              </span>
            </div>
            <div className="occupant-row">
              <i>{home._count.applications}</i>
              <span>
                <b>{home._count.applications ? `${home._count.applications} application${home._count.applications === 1 ? '' : 's'}` : 'No current tenant'}</b>
                <small>Approved tenancy and occupant details appear here once the rental is active.</small>
              </span>
              <Status tone={home._count.applications ? 'gold' : 'slate'}>{home._count.applications ? 'Applications received' : 'Awaiting applications'}</Status>
            </div>
            <div className="occupant-row empty-occupant">
              <i>
                <UserRound size={14} />
              </i>
              <span>
                <b>Occupant details are not available yet</b>
                <small>They are recorded when a tenancy is created.</small>
              </span>
            </div>
          </section>

          <section className="panel tenancy-card">
            <small>Tenancy</small>
            <strong>{formatNaira(nairaFromKobo(home.annualRentKobo))}</strong>
            <span>Annual rent · Payment records appear after checkout</span>
            <div>
              <b>{home.availableFrom ? new Date(home.availableFrom).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Available now'}</b>
              <i />
              <b>{home.minimumLeaseMonths} month minimum lease</b>
            </div>
            <small>Lease start and end dates</small>
          </section>
        </div>

        <section className="panel property-maintenance-preview">
          <div>
            <span>
              <small>Maintenance for this home</small>
              <h2>{home._count.maintenanceRequests} active {home._count.maintenanceRequests === 1 ? 'request' : 'requests'}</h2>
              <p>Tenant-reported issues appear here for the property team.</p>
            </span>
            <Status tone={home._count.maintenanceRequests ? 'gold' : 'slate'}>
              <Wrench size={12} /> {home._count.maintenanceRequests ? 'Needs attention' : 'No open issues'}
            </Status>
          </div>
          <article>
            <i>
              <Wrench size={16} />
            </i>
            <span>
              <b>{home._count.maintenanceRequests ? 'Maintenance requests available' : 'No maintenance requests for this home'}</b>
              <small>Tenant-reported issues are shown here when they are submitted.</small>
            </span>
            <Button variant="outline" onClick={() => go(views.maintenance, { listing: home.id })}>
              View maintenance <ArrowRight size={13} />
            </Button>
          </article>
        </section>
      </div>
    </Shell>
  );
}

export function PropertyMaintenance({
  go,
  manager,
}: {
  go: Go;
  manager: Manager;
}) {
  const copy = managerCopy(manager);
  const views = managerViews(manager);
  const searchParams = useSearchParams();
  const listingId = searchParams.get('listing');
  const [requests, setRequests] = useState<ApiMaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(Boolean(listingId));
  const [error, setError] = useState<string | null>(listingId ? null : 'Select a home to view its maintenance requests.');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  useEffect(() => {
    const session = sessionStore.get();
    if (!listingId || !session) {
      if (!session) setError('Sign in to view maintenance requests.');
      return;
    }
    api.maintenance.list(session.accessToken, listingId)
      .then((response) => setRequests(response.items))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Unable to load maintenance requests.'))
      .finally(() => setLoading(false));
  }, [listingId]);
  const advance = async (request: ApiMaintenanceRequest) => {
    const session = sessionStore.get();
    const next = request.status === 'OPEN' ? 'ACKNOWLEDGED' : request.status === 'ACKNOWLEDGED' ? 'IN_PROGRESS' : request.status === 'IN_PROGRESS' ? 'RESOLVED' : undefined;
    if (!session || !next) return;
    setUpdatingId(request.id);
    try {
      const updated = await api.maintenance.update(session.accessToken, request.id, { status: next, body: `Status changed to ${next.toLowerCase().replace('_', ' ')}.` });
      setRequests((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to update this request.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <Shell go={go} role={manager} title="Property maintenance">
      <div className="page property-maintenance-page">
        <button className="back" onClick={() => go(views.home)}>
          <ArrowLeft size={14} /> Home details
        </button>
        <div className="page-title">
          <span>
            <small>Incoming tenant requests</small>
            <h1>Maintenance for this home</h1>
            <p>Review, assign and resolve issues reported by the tenant.</p>
          </span>
          <Status tone="blue">
            <Building2 size={11} /> {requests[0]?.listing.title ?? 'Selected home'}
          </Status>
        </div>

        <div className="manager-maintenance-grid">
          <section className="panel incoming-issue">
            {loading ? <div className="portfolio-empty">Loading maintenance requests…</div> : error ? <div className="portfolio-empty">{error}</div> : requests.length ? requests.map((request) => (
              <article className="maintenance-live-card" key={request.id}>
                <div className="issue-header"><span><Status tone={request.status === 'RESOLVED' || request.status === 'CLOSED' ? 'green' : 'gold'}>{request.status.toLowerCase().replace('_', ' ')}</Status><h2>{request.title}</h2><p>Reported by {request.reporter.firstName} {request.reporter.lastName} · {new Date(request.createdAt).toLocaleDateString('en-NG')}</p></span><Status tone="gold"><CircleAlert size={11} /> {request.priority.toLowerCase()}</Status></div>
                <p className="issue-description">{request.description}</p>
                <div className="issue-actions"><Button variant="outline" onClick={() => go('assistant')}><MessageCircle size={14} /> Message tenant</Button>{!['RESOLVED', 'CLOSED'].includes(request.status) && <Button onClick={() => void advance(request)} disabled={updatingId === request.id}>{updatingId === request.id ? 'Updating…' : request.status === 'IN_PROGRESS' ? 'Mark resolved' : 'Advance request'} <ArrowRight size={14} /></Button>}</div>
              </article>
            )) : <div className="portfolio-empty">There are no maintenance requests for this home.</div>}
          </section>

          <aside className="property-maintenance-side">
            <section className="panel">
              <small>Property</small>
              <h3>{requests[0]?.listing.title ?? 'Selected home'}</h3>
              <p><MapPin size={12} /> Live request information is shown here.</p>
              <Button variant="outline" onClick={() => listingId && go(views.home, { listing: listingId })}>
                Home details
              </Button>
            </section>
            <section className="panel">
              <small>Request owner</small>
              <div className="maintenance-contact">
                <i>{requests[0] ? `${requests[0].reporter.firstName.charAt(0)}${requests[0].reporter.lastName.charAt(0)}` : '—'}</i>
                <span>
                  <b>{requests[0] ? `${requests[0].reporter.firstName} ${requests[0].reporter.lastName}` : 'No request owner yet'}</b>
                  <small>Tenant contact is shown for active requests.</small>
                </span>
              </div>
              <p>Tenant receives status updates whenever this case changes.</p>
            </section>
            <section className="manager-note">
              <Wrench size={17} />
              <span>
                <b>{manager === 'agent' ? 'Managing for the landlord' : 'Landlord maintenance'}</b>
                <small>{manager === 'agent' ? 'Jide Ojo remains copied on updates and decisions.' : 'This workspace receives issues; tenants submit them from their own maintenance area.'}</small>
              </span>
            </section>
          </aside>
        </div>
      </div>
    </Shell>
  );
}
