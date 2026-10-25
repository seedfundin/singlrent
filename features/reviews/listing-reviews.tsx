'use client';

import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CircleAlert, LoaderCircle, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type ApiListing, type ApiReview, type PaginatedResponse } from '@/lib/api';
import './listing-reviews.css';

type PublicReviewTarget = Exclude<ApiReview['targetType'], 'TENANT'>;
type ReviewSubjectId = 'listing' | 'landlord' | 'agent';

type ReviewSubject = {
  id: ReviewSubjectId;
  label: string;
  description: string;
  query: { listingId?: string; targetUserId?: string; targetType: PublicReviewTarget };
};

type ReviewSummary = {
  count: number;
  averageScore: number | null;
  dimensions: Record<string, { average: number; count: number }>;
};

function starsLabel(score: number | null) {
  return score === null ? 'No rating yet' : `${score.toFixed(1)} out of 5 stars`;
}

function StarRating({ score, size = 15 }: { score: number | null; size?: number }) {
  const filled = score === null ? 0 : Math.round(score);
  return <span className="public-star-rating" aria-label={starsLabel(score)} role="img">
    {Array.from({ length: 5 }, (_, index) => <Star key={index} size={size} fill={index < filled ? 'currentColor' : 'none'} strokeWidth={index < filled ? 2.2 : 1.8} />)}
  </span>;
}

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || 'SR';
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en-NG', { month: 'short', year: 'numeric' }).format(new Date(value));
}

function dimensionLabel(value: string) {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

export function ListingReviews({ listing }: { listing: ApiListing }) {
  const subjects = useMemo<ReviewSubject[]>(() => {
    const next: ReviewSubject[] = [
      {
        id: 'listing',
        label: 'Property',
        description: 'Feedback about this home',
        query: { listingId: listing.id, targetType: 'LISTING' },
      },
      {
        id: 'landlord',
        label: 'Landlord',
        description: `${listing.landlord.firstName} ${listing.landlord.lastName}`,
        query: { targetUserId: listing.landlord.id, targetType: 'LANDLORD' },
      },
    ];
    if (listing.managingAgent) {
      next.push({
        id: 'agent',
        label: 'Agent',
        description: `${listing.managingAgent.firstName} ${listing.managingAgent.lastName}`,
        query: { targetUserId: listing.managingAgent.id, targetType: 'AGENT' },
      });
    }
    return next;
  }, [listing.id, listing.landlord.firstName, listing.landlord.id, listing.landlord.lastName, listing.managingAgent]);
  const [activeSubjectId, setActiveSubjectId] = useState<ReviewSubjectId>('listing');
  const [summaries, setSummaries] = useState<Partial<Record<ReviewSubjectId, ReviewSummary>>>({});
  const [reviews, setReviews] = useState<ApiReview[]>([]);
  const [pageMeta, setPageMeta] = useState<PaginatedResponse<ApiReview>['meta'] | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!subjects.some((subject) => subject.id === activeSubjectId)) setActiveSubjectId('listing');
  }, [activeSubjectId, subjects]);

  const activeSubject = subjects.find((subject) => subject.id === activeSubjectId) ?? subjects[0];
  const activeSummary = summaries[activeSubject.id];

  useEffect(() => {
    let mounted = true;
    setLoadingSummary(true);
    Promise.allSettled(subjects.map(async (subject) => [subject.id, await api.reviews.summary(subject.query)] as const))
      .then((results) => {
        if (!mounted) return;
        const next: Partial<Record<ReviewSubjectId, ReviewSummary>> = {};
        results.forEach((result) => {
          if (result.status === 'fulfilled') next[result.value[0]] = result.value[1];
        });
        setSummaries(next);
      })
      .finally(() => mounted && setLoadingSummary(false));
    return () => { mounted = false; };
  }, [subjects]);

  useEffect(() => {
    let mounted = true;
    setLoadingReviews(true);
    setError(null);
    setExpanded(new Set());
    api.reviews.publicList({ ...activeSubject.query, page: 1, pageSize: 5 })
      .then((response) => {
        if (!mounted) return;
        setReviews(response.items);
        setPageMeta(response.meta);
      })
      .catch(() => mounted && setError('Verified feedback is temporarily unavailable. Please try again shortly.'))
      .finally(() => mounted && setLoadingReviews(false));
    return () => { mounted = false; };
  }, [activeSubject]);

  const loadMore = async () => {
    if (!pageMeta || loadingMore || pageMeta.page >= pageMeta.totalPages) return;
    setLoadingMore(true);
    try {
      const response = await api.reviews.publicList({ ...activeSubject.query, page: pageMeta.page + 1, pageSize: pageMeta.pageSize });
      setReviews((current) => [...current, ...response.items]);
      setPageMeta(response.meta);
    } catch {
      setError('More reviews could not be loaded. Please try again shortly.');
    } finally {
      setLoadingMore(false);
    }
  };

  return <section className="listing-reviews" aria-labelledby="listing-reviews-title">
    <header className="listing-reviews-heading">
      <span><small><BadgeCheck size={13} /> Verified feedback</small><h2 id="listing-reviews-title">See the experience before you move</h2><p>Ratings come only from completed tenancies or inspections confirmed by both sides.</p></span>
      {activeSummary?.count ? <b className="listing-review-count">{activeSummary.count} {activeSummary.count === 1 ? 'review' : 'reviews'}</b> : null}
    </header>

    <div className="listing-rating-cards" role="tablist" aria-label="Review subject">
      {subjects.map((subject) => {
        const summary = summaries[subject.id];
        const selected = subject.id === activeSubject.id;
        return <button key={subject.id} type="button" role="tab" aria-selected={selected} className={selected ? 'active' : ''} onClick={() => setActiveSubjectId(subject.id)}>
          <span><b>{subject.label}</b><small>{subject.description}</small></span>
          <strong>{loadingSummary ? '—' : summary?.averageScore?.toFixed(1) ?? 'New'}</strong>
          <StarRating score={summary?.averageScore ?? null} />
          <small>{loadingSummary ? 'Loading feedback' : summary?.count ? `${summary.count} verified ${summary.count === 1 ? 'review' : 'reviews'}` : 'No reviews yet'}</small>
        </button>;
      })}
    </div>

    <div className="listing-review-feed" aria-live="polite">
      <div className="listing-review-feed-heading"><span><h3>{activeSubject.label} reviews</h3><p>{activeSubject.description}</p></span>{activeSummary?.averageScore !== null && activeSummary?.averageScore !== undefined && <span className="listing-review-score"><StarRating score={activeSummary.averageScore} /><b>{activeSummary.averageScore.toFixed(1)}</b></span>}</div>
      {loadingReviews ? <div className="listing-review-state"><LoaderCircle className="spin" size={18} /> Loading verified feedback…</div> : error ? <div className="listing-review-state error"><CircleAlert size={18} /> {error}</div> : reviews.length ? <div className="listing-review-list">
        {reviews.map((review) => {
          const isExpanded = expanded.has(review.id);
          const canExpand = review.body.length > 280;
          return <article key={review.id} className="listing-review-card">
            <header><span className="listing-review-avatar">{review.author.profileImageUrl ? <img src={review.author.profileImageUrl} alt="" /> : initials(review.author.firstName, review.author.lastName)}</span><span><b>{review.author.firstName} {review.author.lastName.charAt(0)}.</b><small><BadgeCheck size={12} /> Verified {review.inspectionId ? 'inspection' : 'tenancy'} · {dateLabel(review.createdAt)}</small></span><span className="listing-review-card-score"><StarRating score={review.score} size={13} /><b>{review.score.toFixed(1)}</b></span></header>
            <p className={isExpanded ? 'expanded' : ''}>{review.body}</p>
            {canExpand && <button type="button" className="listing-review-expand" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(review.id)) next.delete(review.id); else next.add(review.id); return next; })}>{isExpanded ? 'Show less' : 'Read full review'}</button>}
            {review.ratingDimensions && Object.keys(review.ratingDimensions).length > 0 && <div className="listing-review-dimensions">{Object.entries(review.ratingDimensions).map(([name, value]) => typeof value === 'number' && <span key={name}><Star size={11} fill="currentColor" /> {dimensionLabel(name)} {value}/5</span>)}</div>}
          </article>;
        })}
      </div> : <div className="listing-review-empty"><Star size={20} /><span><b>No verified {activeSubject.label.toLowerCase()} reviews yet</b><small>Reviews will appear here after a completed tenancy or mutually confirmed inspection.</small></span></div>}
      {pageMeta && pageMeta.page < pageMeta.totalPages && <div className="listing-review-more"><small>Showing {reviews.length} of {pageMeta.total} verified reviews</small><Button type="button" variant="outline" size="sm" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <><LoaderCircle className="spin" size={13} /> Loading…</> : 'Show more reviews'}</Button></div>}
    </div>
  </section>;
}
