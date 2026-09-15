'use client';

import { useState } from 'react';
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
import './portfolio.css';

type Go = (view: View) => void;
type Manager = 'landlord' | 'agent';

const homes = [
  {
    name: 'Light-filled 2 bedroom apartment',
    area: 'Lekki Phase 1, Lagos',
    rent: '₦4,800,000 / year',
    status: 'Occupied',
    tenant: 'Adaeze Okafor',
    tenancy: 'Ends 31 Aug 2027',
    issue: '1 repair in progress',
    image:
      'https://d1o88e3pxnk9ri.cloudfront.net/uploads/property/DEC2024/0223758001733920118-property-DEC2024.jpeg',
  },
  {
    name: '3 bedroom apartment, Ikoyi',
    area: 'Bourdillon Road, Ikoyi',
    rent: '₦8,500,000 / year',
    status: 'Occupied',
    tenant: 'Mariam Bello',
    tenancy: 'Ends 14 Mar 2027',
    issue: 'No open issues',
    image:
      'https://images.trvl-media.com/lodging/112000000/111750000/111748200/111748150/93d43aff.jpg?impolicy=resizecrop&ra=fill&rh=575&rw=575',
  },
  {
    name: 'Studio on Admiralty Way',
    area: 'Lekki Phase 1, Lagos',
    rent: '₦1,850,000 / year',
    status: 'Available',
    tenant: 'No current tenant',
    tenancy: 'Published 3 days ago',
    issue: 'No open issues',
    image:
      'https://images.nigeriapropertycentre.com/properties/images/3294165/0696896bc6e46e-fully-service-2bedroom-apartment-for-rent-lekki-lagos.jpg',
  },
];

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
  const [saved, setSaved] = useState(homes);

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

        {saved.length ? (
          <div className="saved-home-grid">
            {saved.map((home) => (
              <article className="saved-home-card" key={home.name}>
                <img src={home.image} alt={home.name} referrerPolicy="no-referrer" />
                <div className="saved-home-copy">
                  <div>
                    <Status tone="green">
                      <ShieldCheck size={11} /> Verified
                    </Status>
                    <button
                      className="saved-heart"
                      aria-label={`Remove ${home.name} from saved homes`}
                      onClick={() =>
                        setSaved((current) =>
                          current.filter((item) => item.name !== home.name),
                        )
                      }
                    >
                      <Heart size={16} fill="currentColor" />
                    </button>
                  </div>
                  <strong>{home.rent}</strong>
                  <h2>{home.name}</h2>
                  <p>
                    <MapPin size={13} /> {home.area}
                  </p>
                  <span className="saved-home-specs">
                    <BedDouble size={14} /> 2 beds <Bath size={14} /> 2 baths
                  </span>
                  <Button variant="outline" onClick={() => go('listing')}>
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
            <b>3 homes</b>
            <small>2 occupied · 1 available</small>
          </span>
          <span>
            <Users size={17} />
            <b>2 active tenancies</b>
            <small>Both tenants are KYC verified</small>
          </span>
          <span>
            <Wrench size={17} />
            <b>1 open maintenance case</b>
            <small>Bathroom shower pressure · Lekki</small>
          </span>
        </section>

        <section className="portfolio-list panel">
          <div className="portfolio-list-head">
            <span>Home</span>
            <span>Tenant</span>
            <span>Maintenance</span>
            <span />
          </div>
          {homes.map((home) => (
            <button
              className="portfolio-row"
              key={home.name}
              onClick={() => go(views.home)}
            >
              <span className="portfolio-property">
                <img src={home.image} alt="" referrerPolicy="no-referrer" />
                <span>
                  <b>{home.name}</b>
                  <small>
                    <MapPin size={11} /> {home.area} · {home.rent}
                  </small>
                  <Status tone={home.status === 'Occupied' ? 'green' : 'slate'}>
                    {home.status}
                  </Status>
                </span>
              </span>
              <span className="portfolio-tenant">
                <i>{home.tenant === 'Adaeze Okafor' ? 'AO' : home.tenant === 'Mariam Bello' ? 'MB' : '—'}</i>
                <span>
                  <b>{home.tenant}</b>
                  <small>{home.tenancy}</small>
                </span>
              </span>
              <span className="portfolio-maintenance">
                <Status tone={home.issue.includes('1 repair') ? 'gold' : 'slate'}>
                  {home.issue.includes('1 repair') ? <Wrench size={11} /> : <Check size={11} />}
                  {home.issue}
                </Status>
              </span>
              <ArrowRight size={15} />
            </button>
          ))}
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
  const home = homes[0];

  return (
    <Shell go={go} role={manager} title="Home details">
      <div className="page home-details-page">
        <button className="back" onClick={() => go(views.homes)}>
          <ArrowLeft size={14} /> {copy.heading}
        </button>
        <section className="home-detail-hero">
          <img src={home.image} alt={home.name} referrerPolicy="no-referrer" />
          <span>
            <small>{copy.owner}</small>
            <h1>{home.name}</h1>
            <p>
              <MapPin size={13} /> {home.area}
            </p>
            <div>
              <Status>
                <CircleCheck size={11} /> Occupied
              </Status>
              <Status tone="blue">
                <BedDouble size={11} /> 2 bedrooms
              </Status>
              <Status tone="gold">₦4.8m / year</Status>
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
              <Status tone="green">
                <ShieldCheck size={11} /> KYC verified
              </Status>
            </div>
            <div className="occupant-row">
              <i>AO</i>
              <span>
                <b>Adaeze Okafor</b>
                <small>Primary tenant · +234 803 555 0142</small>
              </span>
              <Status>Active tenancy</Status>
            </div>
            <div className="occupant-row empty-occupant">
              <i>
                <UserRound size={14} />
              </i>
              <span>
                <b>No additional occupant declared</b>
                <small>Occupant information is updated by the tenant.</small>
              </span>
            </div>
          </section>

          <section className="panel tenancy-card">
            <small>Tenancy</small>
            <strong>₦4,800,000</strong>
            <span>Annual rent · Paid via SingleRent</span>
            <div>
              <b>01 Sep 2026</b>
              <i />
              <b>31 Aug 2027</b>
            </div>
            <small>Lease start and end dates</small>
          </section>
        </div>

        <section className="panel property-maintenance-preview">
          <div>
            <span>
              <small>Maintenance for this home</small>
              <h2>1 active request</h2>
              <p>Tenant-reported issues appear here for the property team.</p>
            </span>
            <Status tone="gold">
              <Wrench size={12} /> Repair in progress
            </Status>
          </div>
          <article>
            <i>
              <Wrench size={16} />
            </i>
            <span>
              <b>Bathroom shower pressure</b>
              <small>Reported by Adaeze Okafor · Medium priority · Updated today</small>
            </span>
            <Button variant="outline" onClick={() => go(views.maintenance)}>
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
  const [status, setStatus] = useState<'received' | 'in-progress' | 'resolved'>('in-progress');
  const copy = managerCopy(manager);
  const views = managerViews(manager);
  const statusLabel =
    status === 'received'
      ? 'Received'
      : status === 'in-progress'
        ? 'Repair in progress'
        : 'Resolved';

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
            <Building2 size={11} /> Light-filled 2 bedroom
          </Status>
        </div>

        <div className="manager-maintenance-grid">
          <section className="panel incoming-issue">
            <div className="issue-header">
              <span>
                <Status tone={status === 'resolved' ? 'green' : 'gold'}>
                  {status === 'resolved' ? <Check size={11} /> : <Wrench size={11} />}
                  {statusLabel}
                </Status>
                <h2>Bathroom shower pressure</h2>
                <p>Reported by Adaeze Okafor · 08 Sep, 9:14 AM</p>
              </span>
              <Status tone="gold">
                <CircleAlert size={11} /> Medium priority
              </Status>
            </div>
            <p className="issue-description">
              The shower pressure has been very low since yesterday evening. The kitchen tap is working normally. I am available for a technician visit after 10 AM.
            </p>
            <div className="issue-activity">
              <span className="done">
                <i><Check size={12} /></i>
                <b>Tenant request received<small>08 Sep · 9:14 AM</small></b>
              </span>
              <span className={status !== 'received' ? 'done' : ''}>
                <i>{status !== 'received' && <Check size={12} />}</i>
                <b>Plumber assigned<small>{status !== 'received' ? '08 Sep · 12:02 PM' : 'Assign a repair professional'}</small></b>
              </span>
              <span className={status === 'in-progress' || status === 'resolved' ? 'now' : ''}>
                <i>{(status === 'in-progress' || status === 'resolved') && <Wrench size={12} />}</i>
                <b>Repair work<small>{status === 'resolved' ? 'Repair completed' : 'Expected completion: 12 Sep'}</small></b>
              </span>
              <span className={status === 'resolved' ? 'done' : ''}>
                <i>{status === 'resolved' && <Check size={12} />}</i>
                <b>Tenant confirmation<small>{status === 'resolved' ? 'Tenant has been notified' : 'Pending repair completion'}</small></b>
              </span>
            </div>
            <div className="issue-actions">
              <Button variant="outline">
                <MessageCircle size={14} /> Message tenant
              </Button>
              {status === 'received' ? (
                <Button onClick={() => setStatus('in-progress')}>
                  Assign repair <ArrowRight size={14} />
                </Button>
              ) : status === 'in-progress' ? (
                <Button onClick={() => setStatus('resolved')}>
                  Mark resolved <Check size={14} />
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setStatus('in-progress')}>
                  Reopen case
                </Button>
              )}
            </div>
          </section>

          <aside className="property-maintenance-side">
            <section className="panel">
              <small>Property</small>
              <h3>Light-filled 2 bedroom</h3>
              <p><MapPin size={12} /> Lekki Phase 1, Lagos</p>
              <Button variant="outline" onClick={() => go(views.home)}>
                Home details
              </Button>
            </section>
            <section className="panel">
              <small>Request owner</small>
              <div className="maintenance-contact">
                <i>AO</i>
                <span>
                  <b>Adaeze Okafor</b>
                  <small>Verified tenant</small>
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
