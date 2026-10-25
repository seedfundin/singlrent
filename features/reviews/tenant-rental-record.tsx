'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, CircleAlert, Clock3, LoaderCircle, LockKeyhole, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type ApiReview, type ApiTenantReviewRecord } from '@/lib/api';
import './tenant-rental-record.css';

type RecordSource = 'TENANCY' | 'INSPECTION';
type Records = Partial<Record<RecordSource, ApiTenantReviewRecord>>;

const sourceCopy: Record<RecordSource, { title: string; subtitle: string; empty: string }> = {
  TENANCY: {
    title: 'Completed tenancy history',
    subtitle: 'Payment, property care, communication and tenancy obligations.',
    empty: 'No completed-tenancy feedback has been recorded yet.',
  },
  INSPECTION: {
    title: 'Verified inspection feedback',
    subtitle: 'Attendance, punctuality and communication only. This never changes tenancy reliability.',
    empty: 'No verified inspection feedback has been recorded yet.',
  },
};

const dimensionNames: Record<string, string> = {
  paymentReliability: 'Payment reliability',
  propertyCare: 'Property care',
  communication: 'Communication',
  tenancyObligations: 'Tenancy obligations',
  attendance: 'Attendance',
  punctuality: 'Punctuality',
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en-NG', { month: 'short', year: 'numeric' }).format(new Date(value));
}

function Stars({ score }: { score: number }) {
  return <span className="tenant-record-stars" aria-label={`${score.toFixed(1)} out of 5 stars`} role="img">
    {Array.from({ length: 5 }, (_, index) => <Star key={index} size={13} fill={index < Math.round(score) ? 'currentColor' : 'none'} />)}
  </span>;
}

function reviewAuthor(review: ApiReview) {
  return `${review.author.firstName} ${review.author.lastName.charAt(0)}.`;
}

function SourcePanel({
  source,
  record,
  loading,
  onMore,
  loadingMore,
}: {
  source: RecordSource;
  record: ApiTenantReviewRecord | undefined;
  loading: boolean;
  onMore: () => void;
  loadingMore: boolean;
}) {
  const summary = record?.summary;
  const reliabilityEstablished = source === 'TENANCY' && (summary?.count ?? 0) >= 2;
  const hasMore = Boolean(record && record.reviews.meta.page < record.reviews.meta.totalPages);
  return <section className="tenant-record-source">
    <header>
      <span><small>{source === 'TENANCY' ? 'Rental reliability' : 'Inspection-only signal'}</small><h3>{sourceCopy[source].title}</h3><p>{sourceCopy[source].subtitle}</p></span>
      {loading ? <LoaderCircle className="spin" size={20} /> : source === 'TENANCY' && reliabilityEstablished && summary?.averageScore !== null && summary?.averageScore !== undefined ? <span className="tenant-record-score"><Stars score={summary.averageScore} /><b>{summary.averageScore.toFixed(1)}</b><small>from {summary.count} tenancies</small></span> : <span className="tenant-record-neutral"><Clock3 size={15} /> {summary?.count ? source === 'TENANCY' ? 'Limited history' : `${summary.count} inspection ${summary.count === 1 ? 'record' : 'records'}` : 'No history yet'}</span>}
    </header>
    {summary && Object.keys(summary.dimensions).length > 0 && <div className="tenant-record-dimensions">{Object.entries(summary.dimensions).map(([name, value]) => <span key={name}><b>{dimensionNames[name] ?? name}</b><Stars score={value.average} /><small>{value.average.toFixed(1)} / 5 · {value.count}</small></span>)}</div>}
    {loading ? <div className="tenant-record-loading"><LoaderCircle className="spin" size={16} /> Loading private record…</div> : record?.reviews.items.length ? <div className="tenant-record-list">{record.reviews.items.map((review) => <article key={review.id}>
      <header><span><b>{reviewAuthor(review)}</b><small><BadgeCheck size={12} /> Verified {source === 'TENANCY' ? 'tenancy' : 'inspection'} · {dateLabel(review.createdAt)} · {review.listing?.title ?? 'Previous property'}</small></span><span><Stars score={review.score} /><b>{review.score.toFixed(1)}</b></span></header>
      <p>{review.body}</p>
    </article>)}</div> : <div className="tenant-record-empty"><Star size={18} /><span><b>{sourceCopy[source].empty}</b><small>No history is neutral—it is not a negative signal.</small></span></div>}
    {hasMore && <div className="tenant-record-more"><small>Showing {record.reviews.items.length} of {record.reviews.meta.total} verified records</small><Button size="sm" variant="outline" disabled={loadingMore} onClick={onMore}>{loadingMore ? <><LoaderCircle className="spin" size={13} /> Loading…</> : 'Show more'}</Button></div>}
  </section>;
}

export function TenantRentalRecord({ applicationId, token }: { applicationId: string; token: string }) {
  const [records, setRecords] = useState<Records>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState<Record<RecordSource, boolean>>({ TENANCY: false, INSPECTION: false });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setRecords({});
    setLoading(true);
    setError(null);
    Promise.all([
      api.reviews.tenantRecord(token, applicationId, { source: 'TENANCY', page: 1, pageSize: 4 }),
      api.reviews.tenantRecord(token, applicationId, { source: 'INSPECTION', page: 1, pageSize: 4 }),
    ]).then(([tenancy, inspection]) => {
      if (active) setRecords({ TENANCY: tenancy, INSPECTION: inspection });
    }).catch(() => {
      if (active) setError('The private tenant record could not be loaded right now.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [applicationId, token]);

  const loadMore = async (source: RecordSource) => {
    const current = records[source];
    if (!current || loadingMore[source] || current.reviews.meta.page >= current.reviews.meta.totalPages) return;
    setLoadingMore((value) => ({ ...value, [source]: true }));
    try {
      const next = await api.reviews.tenantRecord(token, applicationId, { source, page: current.reviews.meta.page + 1, pageSize: current.reviews.meta.pageSize });
      setRecords((value) => ({ ...value, [source]: { ...next, reviews: { ...next.reviews, items: [...current.reviews.items, ...next.reviews.items] } } }));
    } catch {
      setError('More tenant feedback could not be loaded right now.');
    } finally {
      setLoadingMore((value) => ({ ...value, [source]: false }));
    }
  };

  const tenant = records.TENANCY?.tenant ?? records.INSPECTION?.tenant;
  return <section className="tenant-rental-record" aria-labelledby={`tenant-rental-record-${applicationId}`}>
    <header className="tenant-rental-record-heading"><span><small><LockKeyhole size={13} /> Private application record</small><h2 id={`tenant-rental-record-${applicationId}`}>{tenant ? `${tenant.firstName}'s rental record` : 'Tenant rental record'}</h2><p>Visible only while you are handling this application. It is not public and it is not a tenant directory.</p></span><span className="tenant-rental-record-badge"><BadgeCheck size={14} /> Verified interactions only</span></header>
    {error && <p className="tenant-rental-record-error"><CircleAlert size={15} /> {error}</p>}
    <div className="tenant-rental-record-grid">
      <SourcePanel source="TENANCY" record={records.TENANCY} loading={loading} loadingMore={loadingMore.TENANCY} onMore={() => void loadMore('TENANCY')} />
      <SourcePanel source="INSPECTION" record={records.INSPECTION} loading={loading} loadingMore={loadingMore.INSPECTION} onMore={() => void loadMore('INSPECTION')} />
    </div>
  </section>;
}
