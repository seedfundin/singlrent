'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  CreditCard,
  Landmark,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppSession } from '@/features/app/app-provider';
import {
  PublicHeader,
  Shell,
  Status,
  type Navigate,
} from '@/features/app/shell';
import { ApiFieldError } from '@/features/forms/api-field-error';
import {
  api,
  apiFieldErrors,
  apiFormError,
  type ApiFieldErrors,
  type ApiListing,
  type ApiPayment,
  type ApiRentalPricing,
  type ApiRentalApplication,
  type PublisherVerificationMethod,
} from '@/lib/api';
import { formatNaira } from '@/lib/pricing';
import { ApplicationStatusBadge } from '@/features/rentals/rental-status';
import { requestPushPermissionPrompt } from '@/features/notifications/push-client';
import './rental-flow.css';

const pendingPaymentStorageKey = 'singlerent.pending-payment';

type PendingPayment =
  | { kind: 'kyc'; chargeId: string; applicationId: string; listingId: string }
  | {
      kind: 'rent';
      paymentId: string;
      applicationId: string;
      listingId: string;
    };

function dateInputValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

function displayDate(iso: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

function naira(kobo: string) {
  return formatNaira(Number(kobo) / 100);
}

function RentalSummary({
  listing,
  quote,
  action,
  disabled = false,
}: {
  listing: ApiListing;
  quote: ApiRentalPricing;
  action?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <aside className="rental-summary">
      <h2>Rental summary</h2>
      <div>
        <span>
          Annual rent <b>{naira(quote.rentAmountKobo)}</b>
        </span>
        <span>
          SingleRent platform fee <b>{naira(quote.platformFeeKobo)}</b>
        </span>
        {Number(quote.agentFeeKobo) > 0 && (
          <span>
            Agent fee <b>{naira(quote.agentFeeKobo)}</b>
          </span>
        )}
        <span>
          Legal fee (10%) <b>{naira(quote.legalFeeKobo)}</b>
        </span>
        <span>
          Refundable caution fee <b>{naira(quote.cautionFeeKobo)}</b>
        </span>
      </div>
      <strong>
        Total to pay <b>{naira(quote.totalAmountKobo)}</b>
      </strong>
      <p>
        <ShieldCheck size={17} />
        <span>
          <b>Your payment is protected</b> After your application is accepted,
          the funds are held securely until the required move-in steps are
          complete.
        </span>
      </p>
      {action && (
        <div className={disabled ? 'disabled-action' : undefined}>{action}</div>
      )}
      <small className="rental-summary-note">For {listing.title}</small>
    </aside>
  );
}

function ListingSummary({ listing }: { listing: ApiListing }) {
  const primaryImage = listing.media.find(
    (media) => media.mediaType === 'IMAGE',
  );
  return (
    <section className="rental-listing-summary">
      {primaryImage ? (
        <img
          src={primaryImage.url}
          alt={primaryImage.altText ?? listing.title}
        />
      ) : (
        <i>
          <Landmark size={22} />
        </i>
      )}
      <span>
        <h2>{listing.title}</h2>
        <p>
          <MapPin size={14} /> {listing.area}, {listing.state}
        </p>
        <small>
          {listing.bedrooms} bedroom{listing.bedrooms === 1 ? '' : 's'} ·{' '}
          {listing.bathrooms} bathroom{listing.bathrooms === 1 ? '' : 's'} ·{' '}
          {listing.propertyType.toLowerCase()}
        </small>
      </span>
    </section>
  );
}

function SignInRequired({ go }: { go: Navigate }) {
  return (
    <>
      <PublicHeader go={go} />
      <main className="public">
        <section className="rental-empty">
          <UserRound size={24} />
          <h1>Sign in to rent a home</h1>
          <p>
            Sign in to submit an application. NIN verification is only needed
            later, when an approved application is ready for payment.
          </p>
          <Button onClick={() => go('sign-in')}>
            Sign in <ArrowRight size={14} />
          </Button>
        </section>
      </main>
    </>
  );
}

type ApplicationForm = {
  moveInDate: string;
  leaseMonths: number;
  occupation: string;
  occupantsCount: number;
  messageToLandlord: string;
  employmentStatus: NonNullable<
    ApiRentalApplication['tenantQuestionnaire']
  >['employmentStatus'];
  incomeRange: NonNullable<
    ApiRentalApplication['tenantQuestionnaire']
  >['incomeRange'];
  moveReason: NonNullable<
    ApiRentalApplication['tenantQuestionnaire']
  >['moveReason'];
  preferredContact: NonNullable<
    ApiRentalApplication['tenantQuestionnaire']
  >['preferredContact'];
  pets: NonNullable<ApiRentalApplication['tenantQuestionnaire']>['pets'];
  smoking: NonNullable<ApiRentalApplication['tenantQuestionnaire']>['smoking'];
  intendedBusinessUse: NonNullable<
    ApiRentalApplication['tenantQuestionnaire']
  >['intendedBusinessUse'];
  confirmsInformationIsAccurate: boolean;
};

export function RentalApplicationFlow({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const searchParams = useSearchParams();
  const listingId = searchParams.get('listing');
  const [listing, setListing] = useState<ApiListing | null>(null);
  const [quote, setQuote] = useState<ApiRentalPricing | null>(null);
  const [application, setApplication] = useState<ApiRentalApplication | null>(
    null,
  );
  const [form, setForm] = useState<ApplicationForm>({
    moveInDate: '',
    leaseMonths: 12,
    occupation: '',
    occupantsCount: 1,
    messageToLandlord: '',
    employmentStatus: 'EMPLOYED',
    incomeRange: 'PREFER_NOT_TO_SAY',
    moveReason: 'OTHER',
    preferredContact: 'IN_APP',
    pets: 'PREFER_NOT_TO_SAY',
    smoking: 'PREFER_NOT_TO_SAY',
    intendedBusinessUse: 'NO',
    confirmsInformationIsAccurate: false,
  });
  const [loading, setLoading] = useState(Boolean(session && listingId));
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});

  useEffect(() => {
    if (!session || !listingId) return;
    let active = true;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      api.listings.detail(listingId, session.accessToken),
      api.listings.pricing(listingId, session.accessToken),
      api.applications.mine(session.accessToken, { pageSize: 100 }),
    ])
      .then(([property, pricing, applications]) => {
        if (!active) return;
        setListing(property);
        setQuote(pricing);
        const existing =
          applications.items.find((item) => item.listingId === property.id) ??
          null;
        setApplication(existing);
        setForm((current) => {
          if (current.moveInDate) return current;
          if (existing?.status === 'PENDING' && existing.tenantQuestionnaire) {
            return {
              moveInDate: dateInputValue(existing.moveInDate),
              leaseMonths: existing.leaseMonths,
              occupation: existing.occupation ?? '',
              occupantsCount: existing.occupantsCount,
              messageToLandlord: existing.messageToLandlord ?? '',
              ...existing.tenantQuestionnaire,
            };
          }
          return {
            ...current,
            moveInDate: dateInputValue(property.availableFrom),
          };
        });
      })
      .catch((cause: unknown) => {
        if (active)
          setLoadError(
            cause instanceof Error
              ? cause.message
              : 'Unable to prepare this rental application.',
          );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [listingId, session]);

  const submitApplication = async () => {
    if (!session || !listing) return;
    const localErrors: ApiFieldErrors = {};
    if (!form.moveInDate)
      localErrors.moveInDate = ['Choose your intended move-in date.'];
    if (
      !Number.isInteger(form.leaseMonths) ||
      form.leaseMonths < 1 ||
      form.leaseMonths > 36
    )
      localErrors.leaseMonths = [
        'Lease length must be between 1 and 36 months.',
      ];
    if (
      !Number.isInteger(form.occupantsCount) ||
      form.occupantsCount < 1 ||
      form.occupantsCount > 20
    )
      localErrors.occupantsCount = ['Occupants must be between 1 and 20.'];
    if (form.occupation.trim().length > 150)
      localErrors.occupation = ['Occupation cannot exceed 150 characters.'];
    if (form.messageToLandlord.trim().length > 2000)
      localErrors.messageToLandlord = [
        'Message cannot exceed 2,000 characters.',
      ];
    if (!form.confirmsInformationIsAccurate)
      localErrors.tenantQuestionnaire = [
        'Confirm that the rental-readiness information is accurate.',
      ];
    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors);
      setFormError('Please correct the highlighted fields and try again.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const input = {
        moveInDate: new Date(`${form.moveInDate}T00:00:00.000Z`).toISOString(),
        leaseMonths: form.leaseMonths,
        occupation: form.occupation.trim() || undefined,
        occupantsCount: form.occupantsCount,
        tenantQuestionnaire: {
          employmentStatus: form.employmentStatus,
          incomeRange: form.incomeRange,
          moveReason: form.moveReason,
          preferredContact: 'IN_APP' as const,
          pets: form.pets,
          smoking: form.smoking,
          intendedBusinessUse: form.intendedBusinessUse,
          confirmsInformationIsAccurate: form.confirmsInformationIsAccurate,
        },
      };
      const saved =
        application?.status === 'PENDING'
          ? await api.applications.update(
              session.accessToken,
              application.id,
              input,
            )
          : await api.applications.create(session.accessToken, {
              listingId: listing.id,
              ...input,
            });
      setApplication(saved);
    } catch (cause) {
      const nextFieldErrors = apiFieldErrors(cause);
      setFieldErrors(nextFieldErrors);
      setFormError(
        apiFormError(
          cause,
          nextFieldErrors,
          'Unable to submit your application.',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) return <SignInRequired go={go} />;
  if (!listingId)
    return (
      <Shell go={go} title="Rental application">
        <div className="page">
          <section className="rental-empty">
            <Landmark size={24} />
            <h1>Choose a home to rent</h1>
            <p>Open a published listing first, then select Rent this home.</p>
            <Button onClick={() => go('explore')}>
              Explore homes <ArrowRight size={14} />
            </Button>
          </section>
        </div>
      </Shell>
    );

  const cannotApply =
    application &&
    !['REJECTED', 'CANCELLED', 'PENDING'].includes(application.status);
  return (
    <Shell go={go} title="Rental application">
      <div className="page rental-flow">
        <button
          className="rental-back"
          onClick={() => go('listing', { listing: listingId })}
        >
          <ArrowLeft size={15} /> Back to listing
        </button>
        {loading ? (
          <section className="rental-empty">
            <LoaderCircle className="spin" size={22} />
            <h1>Loading rental details…</h1>
          </section>
        ) : loadError ? (
          <section className="rental-empty error">
            <CircleAlert size={22} />
            <h1>We could not open this application</h1>
            <p>{loadError}</p>
            <Button onClick={() => go('listing', { listing: listingId })}>
              Back to listing
            </Button>
          </section>
        ) : (
          listing &&
          quote && (
            <>
              <div className="rental-flow-heading">
                <span>
                  <small>Rental application</small>
                  <h1>
                    {cannotApply
                      ? 'Application status'
                      : application?.status === 'PENDING'
                        ? 'Update your application'
                        : 'Apply to rent this home'}
                  </h1>
                  <p>
                    {cannotApply
                      ? 'Your application is linked to this real listing and will update as the property contact reviews it.'
                      : application?.status === 'PENDING'
                        ? 'You can correct your application and rental-readiness answers until the property contact makes a decision.'
                        : 'Confirm your actual move-in details. The landlord or managing agent reviews your application before payment.'}
                  </p>
                </span>
                {application && (
                  <ApplicationStatusBadge status={application.status} />
                )}
              </div>
              <div className="rental-flow-grid">
                <section className="rental-main">
                  <ListingSummary listing={listing} />
                  {cannotApply ? (
                    <ApplicationProgress
                      application={application!}
                      listing={listing}
                      go={go}
                    />
                  ) : (
                    <>
                      {application?.status === 'REJECTED' && (
                        <p className="rental-alert error">
                          <CircleAlert size={15} />{' '}
                          {application.decisionReason ??
                            'This earlier application was not accepted. You can submit a new application if the listing is still available.'}
                        </p>
                      )}
                      <section className="rental-form-card">
                        <h2>Your rental details</h2>
                        <p>
                          Your name and email are taken from your signed-in
                          account.
                        </p>
                        <div className="rental-readonly">
                          <span>
                            <small>Applicant</small>
                            <b>
                              {session.user.firstName} {session.user.lastName}
                            </b>
                          </span>
                          <span>
                            <small>Email</small>
                            <b>{session.user.email}</b>
                          </span>
                        </div>
                        {formError && (
                          <p className="rental-alert error" role="alert">
                            <CircleAlert size={15} /> {formError}
                          </p>
                        )}
                        <div className="rental-form-grid">
                          <label>
                            Move-in date
                            <input
                              aria-invalid={Boolean(fieldErrors.moveInDate)}
                              type="date"
                              min={dateInputValue(listing.availableFrom)}
                              value={form.moveInDate}
                              onChange={(event) => {
                                setForm((current) => ({
                                  ...current,
                                  moveInDate: event.target.value,
                                }));
                                setFieldErrors((current) => {
                                  const {
                                    moveInDate: _moveInDate,
                                    ...remaining
                                  } = current;
                                  return remaining;
                                });
                                setFormError(null);
                              }}
                            />
                            <ApiFieldError
                              errors={fieldErrors}
                              field="moveInDate"
                            />
                          </label>
                          <label>
                            Lease length
                            <select
                              aria-invalid={Boolean(fieldErrors.leaseMonths)}
                              value={form.leaseMonths}
                              onChange={(event) => {
                                setForm((current) => ({
                                  ...current,
                                  leaseMonths: Number(event.target.value),
                                }));
                                setFieldErrors((current) => {
                                  const {
                                    leaseMonths: _leaseMonths,
                                    ...remaining
                                  } = current;
                                  return remaining;
                                });
                                setFormError(null);
                              }}
                            >
                              {[listing.minimumLeaseMonths, 12, 18, 24, 36]
                                .filter(
                                  (value, index, values) =>
                                    value >= listing.minimumLeaseMonths &&
                                    values.indexOf(value) === index,
                                )
                                .sort((a, b) => a - b)
                                .map((months) => (
                                  <option key={months} value={months}>
                                    {months} months
                                  </option>
                                ))}
                            </select>
                            <ApiFieldError
                              errors={fieldErrors}
                              field="leaseMonths"
                            />
                          </label>
                          <label>
                            Occupation (optional)
                            <input
                              aria-invalid={Boolean(fieldErrors.occupation)}
                              value={form.occupation}
                              maxLength={150}
                              onChange={(event) => {
                                setForm((current) => ({
                                  ...current,
                                  occupation: event.target.value,
                                }));
                                setFieldErrors((current) => {
                                  const {
                                    occupation: _occupation,
                                    ...remaining
                                  } = current;
                                  return remaining;
                                });
                                setFormError(null);
                              }}
                              placeholder="e.g. Product designer"
                            />
                            <ApiFieldError
                              errors={fieldErrors}
                              field="occupation"
                            />
                          </label>
                          <label>
                            Occupants
                            <select
                              aria-invalid={Boolean(fieldErrors.occupantsCount)}
                              value={form.occupantsCount}
                              onChange={(event) => {
                                setForm((current) => ({
                                  ...current,
                                  occupantsCount: Number(event.target.value),
                                }));
                                setFieldErrors((current) => {
                                  const {
                                    occupantsCount: _occupantsCount,
                                    ...remaining
                                  } = current;
                                  return remaining;
                                });
                                setFormError(null);
                              }}
                            >
                              {Array.from(
                                { length: 8 },
                                (_, index) => index + 1,
                              ).map((count) => (
                                <option key={count} value={count}>
                                  {count} {count === 1 ? 'person' : 'people'}
                                </option>
                              ))}
                            </select>
                            <ApiFieldError
                              errors={fieldErrors}
                              field="occupantsCount"
                            />
                          </label>
                          <label>
                            Work situation
                            <select
                              value={form.employmentStatus}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  employmentStatus: event.target
                                    .value as ApplicationForm['employmentStatus'],
                                }))
                              }
                            >
                              <option value="EMPLOYED">Employed</option>
                              <option value="SELF_EMPLOYED">
                                Self-employed
                              </option>
                              <option value="STUDENT">Student</option>
                              <option value="RETIRED">Retired</option>
                              <option value="OTHER">Other</option>
                            </select>
                          </label>
                          <label>
                            Monthly income range
                            <select
                              value={form.incomeRange}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  incomeRange: event.target
                                    .value as ApplicationForm['incomeRange'],
                                }))
                              }
                            >
                              <option value="PREFER_NOT_TO_SAY">
                                Prefer not to say
                              </option>
                              <option value="UNDER_100K">Under ₦100,000</option>
                              <option value="100K_TO_250K">
                                ₦100,000–₦250,000
                              </option>
                              <option value="250K_TO_500K">
                                ₦250,000–₦500,000
                              </option>
                              <option value="500K_TO_1M">
                                ₦500,000–₦1,000,000
                              </option>
                              <option value="OVER_1M">Over ₦1,000,000</option>
                            </select>
                          </label>
                          <label>
                            Reason for moving
                            <select
                              value={form.moveReason}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  moveReason: event.target
                                    .value as ApplicationForm['moveReason'],
                                }))
                              }
                            >
                              <option value="NEW_JOB">New job</option>
                              <option value="RELOCATION">Relocation</option>
                              <option value="FAMILY">Family</option>
                              <option value="UPGRADING">Upgrading</option>
                              <option value="FIRST_HOME">First home</option>
                              <option value="OTHER">Other</option>
                            </select>
                          </label>
                          <p>
                            Property questions are handled through the Property
                            Assistant.
                          </p>
                          <label>
                            Pets
                            <select
                              value={form.pets}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  pets: event.target
                                    .value as ApplicationForm['pets'],
                                }))
                              }
                            >
                              <option value="PREFER_NOT_TO_SAY">
                                Prefer not to say
                              </option>
                              <option value="NO">No</option>
                              <option value="YES">Yes</option>
                            </select>
                          </label>
                          <label>
                            Smoking
                            <select
                              value={form.smoking}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  smoking: event.target
                                    .value as ApplicationForm['smoking'],
                                }))
                              }
                            >
                              <option value="PREFER_NOT_TO_SAY">
                                Prefer not to say
                              </option>
                              <option value="NO">No</option>
                              <option value="YES">Yes</option>
                            </select>
                          </label>
                          <label>
                            Business use at the property
                            <select
                              value={form.intendedBusinessUse}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  intendedBusinessUse: event.target
                                    .value as ApplicationForm['intendedBusinessUse'],
                                }))
                              }
                            >
                              <option value="NO">No</option>
                              <option value="YES">Yes</option>
                              <option value="PREFER_NOT_TO_SAY">
                                Prefer not to say
                              </option>
                            </select>
                          </label>
                        </div>
                        <label className="rental-questionnaire-consent">
                          <input
                            type="checkbox"
                            checked={form.confirmsInformationIsAccurate}
                            onChange={(event) => {
                              setForm((current) => ({
                                ...current,
                                confirmsInformationIsAccurate:
                                  event.target.checked,
                              }));
                              setFormError(null);
                            }}
                          />{' '}
                          I confirm this rental-readiness information is
                          accurate. Do not include your NIN, BVN, bank details,
                          or other identity numbers here.
                        </label>
                        <ApiFieldError
                          errors={fieldErrors}
                          field="tenantQuestionnaire"
                        />
                        <p className="rental-helper">
                          <ShieldCheck size={15} /> You only complete one-time
                          NIN verification after the application is approved and
                          before payment.
                        </p>
                        <Button
                          onClick={() => void submitApplication()}
                          disabled={
                            submitting || listing.availability !== 'AVAILABLE'
                          }
                        >
                          {submitting ? (
                            <>
                              <LoaderCircle className="spin" size={15} />{' '}
                              {application?.status === 'PENDING'
                                ? 'Saving…'
                                : 'Submitting…'}
                            </>
                          ) : (
                            <>
                              {application?.status === 'PENDING'
                                ? 'Save application changes'
                                : 'Submit application'}{' '}
                              <ArrowRight size={15} />
                            </>
                          )}
                        </Button>
                      </section>
                    </>
                  )}
                </section>
                <RentalSummary listing={listing} quote={quote} />
              </div>
            </>
          )
        )}
      </div>
    </Shell>
  );
}

function ApplicationProgress({
  application,
  listing,
  go,
}: {
  application: ApiRentalApplication;
  listing: ApiListing;
  go: Navigate;
}) {
  const title =
    application.status === 'PENDING'
      ? 'Application sent'
      : application.status === 'AWAITING_PAYMENT'
        ? 'Your application was accepted'
        : application.status === 'PAYMENT_HELD'
          ? 'Rent payment is protected'
          : application.status === 'ACTIVE'
            ? 'Your tenancy is active'
            : 'Application update';
  const copy =
    application.status === 'PENDING'
      ? `Your application was sent to ${application.agent ? `${application.agent.firstName} ${application.agent.lastName}` : `${application.landlord.firstName} ${application.landlord.lastName}`}. Payment becomes available only if they accept it.`
      : application.status === 'AWAITING_PAYMENT'
        ? 'Your property contact has accepted the application. Complete payment to reserve this home.'
        : application.status === 'PAYMENT_HELD'
          ? 'Your payment has been verified and is held securely while the required move-in steps are completed.'
          : 'Your application has already progressed beyond the submission stage.';
  return (
    <section className="rental-status-card">
      <CheckCircle2 size={24} />
      <div>
        <ApplicationStatusBadge status={application.status} />
        <h2>{title}</h2>
        <p>{copy}</p>
        <dl>
          <div>
            <dt>Move-in</dt>
            <dd>{displayDate(application.moveInDate)}</dd>
          </div>
          <div>
            <dt>Lease</dt>
            <dd>{application.leaseMonths} months</dd>
          </div>
          <div>
            <dt>Occupants</dt>
            <dd>{application.occupantsCount}</dd>
          </div>
        </dl>
        {application.status === 'AWAITING_PAYMENT' && (
          <Button
            onClick={() =>
              go('payment', {
                application: application.id,
                listing: listing.id,
              })
            }
          >
            Continue to payment <ArrowRight size={15} />
          </Button>
        )}
      </div>
    </section>
  );
}

export function TenantApplications({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const [applications, setApplications] = useState<ApiRentalApplication[]>([]);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return;
    api.applications
      .mine(session.accessToken, { pageSize: 100 })
      .then((response) => setApplications(response.items))
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load applications.',
        ),
      )
      .finally(() => setLoading(false));
  }, [session]);
  const cancel = async (applicationId: string) => {
    if (!session) return;
    setCancellingId(applicationId);
    setError(null);
    try {
      await api.applications.cancel(session.accessToken, applicationId);
      setApplications((current) =>
        current.map((application) =>
          application.id === applicationId
            ? { ...application, status: 'CANCELLED' }
            : application,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to cancel this application.',
      );
    } finally {
      setCancellingId(null);
    }
  };
  if (!session) return <SignInRequired go={go} />;
  return (
    <Shell go={go} title="Applications">
      <div className="page rental-flow">
        <div className="rental-flow-heading">
          <span>
            <small>Your renting journey</small>
            <h1>Applications</h1>
            <p>
              Track submitted applications and continue to payment only after
              acceptance.
            </p>
          </span>
          <Button onClick={() => go('explore')}>
            Explore homes <ArrowRight size={14} />
          </Button>
        </div>
        {error && (
          <p className="rental-alert error">
            <CircleAlert size={15} /> {error}
          </p>
        )}
        {loading ? (
          <section className="rental-empty">
            <LoaderCircle className="spin" size={22} />
            <h1>Loading applications…</h1>
          </section>
        ) : applications.length ? (
          <div className="application-list">
            {applications.map((application) => (
              <article key={application.id}>
                <span>
                  <ApplicationStatusBadge status={application.status} />
                  <h2>{application.listing.title}</h2>
                  <p>
                    <CalendarDays size={14} /> Move-in{' '}
                    {displayDate(application.moveInDate)} ·{' '}
                    {application.leaseMonths} months
                  </p>
                </span>
                <div className="application-row-actions">
                  {application.status === 'AWAITING_PAYMENT' ? (
                    <Button
                      onClick={() =>
                        go('payment', {
                          application: application.id,
                          listing: application.listingId,
                        })
                      }
                    >
                      Pay now <ArrowRight size={14} />
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() =>
                        go('apply', { listing: application.listingId })
                      }
                    >
                      View application
                    </Button>
                  )}
                  {['PENDING', 'AWAITING_PAYMENT'].includes(
                    application.status,
                  ) && (
                    <Button
                      variant="ghost"
                      disabled={cancellingId === application.id}
                      onClick={() => void cancel(application.id)}
                    >
                      {cancellingId === application.id
                        ? 'Cancelling…'
                        : 'Cancel'}
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <section className="rental-empty">
            <Landmark size={24} />
            <h1>No applications yet</h1>
            <p>When you apply for a home, its status will appear here.</p>
            <Button onClick={() => go('explore')}>Explore homes</Button>
          </section>
        )}
      </div>
    </Shell>
  );
}

export function RentalPaymentFlow({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get('application');
  const [application, setApplication] = useState<ApiRentalApplication | null>(
    null,
  );
  const [listing, setListing] = useState<ApiListing | null>(null);
  const [quote, setQuote] = useState<ApiRentalPricing | null>(null);
  const [kycVerified, setKycVerified] = useState(false);
  const [kycUnderReview, setKycUnderReview] = useState(false);
  const [identityMethod, setIdentityMethod] = useState<PublisherVerificationMethod>('NIN');
  const [identityNumber, setIdentityNumber] = useState('');
  const [loading, setLoading] = useState(Boolean(session && applicationId));
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  useEffect(() => {
    if (!session || !applicationId) return;
    let active = true;
    setLoading(true);
    Promise.all([
      api.applications.mine(session.accessToken, { pageSize: 100 }),
      api.users.getKycStatus(session.accessToken),
    ])
      .then(async ([applications, kyc]) => {
        const current =
          applications.items.find((item) => item.id === applicationId) ?? null;
        if (!current)
          throw new Error('This application is not available in your account.');
        const [property, pricing] = await Promise.all([
          api.listings.detail(current.listingId, session.accessToken),
          api.listings.pricing(current.listingId, session.accessToken),
        ]);
        if (!active) return;
        setApplication(current);
        setListing(property);
        setQuote(pricing);
        setKycVerified(kyc.verified);
        setKycUnderReview(kyc.underReview);
      })
      .catch(
        (cause: unknown) =>
          active &&
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to prepare payment.',
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [applicationId, session]);

  const continueToSecurePayment = (
    pending: PendingPayment,
    authorizationUrl: string,
  ) => {
    window.sessionStorage.setItem(
      pendingPaymentStorageKey,
      JSON.stringify(pending),
    );
    window.location.assign(authorizationUrl);
  };
  const startKyc = async () => {
    if (!session || !application || !listing) return;
    if (!/^\d{11}$/.test(identityNumber)) {
      setError(`Enter your 11-digit ${identityMethod} to continue.`);
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      const charge = await api.users.initializeTransactionalKyc(
        session.accessToken,
        { method: identityMethod, identifier: identityNumber },
      );
      continueToSecurePayment(
        {
          kind: 'kyc',
          chargeId: charge.chargeId,
          applicationId: application.id,
          listingId: listing.id,
        },
        charge.authorizationUrl,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to start the verification service charge.',
      );
      setProcessing(false);
    }
  };
  const startPayment = async () => {
    if (!session || !application || !listing) return;
    if (!policyAccepted) {
      setPolicyOpen(true);
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      const initialized = await api.payments.initialize(
        session.accessToken,
        application.id,
        true,
      );
      continueToSecurePayment(
        {
          kind: 'rent',
          paymentId: initialized.paymentId,
          applicationId: application.id,
          listingId: listing.id,
        },
        initialized.authorizationUrl,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to start your rent payment.',
      );
      setProcessing(false);
    }
  };
  const closePolicy = () => {
    if (processing) return;
    setPolicyOpen(false);
    setPolicyAccepted(false);
  };
  if (!session) return <SignInRequired go={go} />;
  if (!applicationId)
    return (
      <Shell go={go} title="Secure payment">
        <div className="page">
          <section className="rental-empty">
            <CreditCard size={24} />
            <h1>Select an approved application</h1>
            <p>
              Payment is available only after a landlord or managing agent
              accepts an application.
            </p>
            <Button onClick={() => go('tenant-applications')}>
              View applications
            </Button>
          </section>
        </div>
      </Shell>
    );

  return (
    <Shell go={go} title="Secure payment">
      <div className="page rental-flow">
        <button
          className="rental-back"
          onClick={() =>
            go('apply', { listing: searchParams.get('listing') ?? '' })
          }
        >
          <ArrowLeft size={15} /> Back to application
        </button>
        {loading ? (
          <section className="rental-empty">
            <LoaderCircle className="spin" size={22} />
            <h1>Loading payment details…</h1>
          </section>
        ) : error ? (
          <section className="rental-empty error">
            <CircleAlert size={22} />
            <h1>Payment needs attention</h1>
            <p>{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </section>
        ) : (
          application &&
          listing &&
          quote && (
            <>
              <div className="rental-flow-heading">
                <span>
                  <small>Secure payment</small>
                  <h1>
                    {kycVerified
                      ? 'Pay your approved rent'
                      : 'Verify identity before payment'}
                  </h1>
                  <p>
                    {kycVerified
                      ? 'Your payment is handled securely. Once confirmed, SingleRent holds the funds securely until the required move-in steps are complete.'
                      : 'One-time Dojah NIN or BVN verification is required before this first rent payment. The ₦100 service fee applies even if verification is unsuccessful.'}
                  </p>
                </span>
                <ApplicationStatusBadge status={application.status} />
              </div>
              <div className="rental-flow-grid">
                <section className="rental-main">
                  <ListingSummary listing={listing} />
                  {application.status !== 'AWAITING_PAYMENT' ? (
                    <section className="rental-status-card">
                      <Clock3 size={24} />
                      <div>
                        <h2>Payment is not available yet</h2>
                        <p>
                          This application must be accepted by the landlord or
                          managing agent before rent can be paid.
                        </p>
                        <Button onClick={() => go('tenant-applications')}>
                          View applications
                        </Button>
                      </div>
                    </section>
                  ) : kycUnderReview ? (
                    <section className="rental-status-card">
                      <Clock3 size={24} />
                      <div>
                        <Status tone="gold">Identity review in progress</Status>
                        <h2>Payment will unlock after review</h2>
                        <p>Dojah confirmed the identity record, but its legal name differs from your SingleRent account. An administrator must review it before you can pay rent. Do not start another paid verification attempt.</p>
                      </div>
                    </section>
                  ) : !kycVerified ? (
                    <section className="rental-form-card">
                      <h2>One-time identity verification</h2>
                      <p>
                        We charge ₦100 for the Dojah NIN or BVN check.
                        The fee is charged for every attempt, including an
                        unsuccessful verification.
                      </p>
                      <label className="single-field">
                        Identity method
                        <select value={identityMethod} onChange={(event) => setIdentityMethod(event.target.value as PublisherVerificationMethod)}>
                          <option value="NIN">NIN — National Identity Number</option>
                          <option value="BVN">BVN — Bank Verification Number</option>
                        </select>
                      </label>
                      <label className="single-field">
                        {identityMethod}
                        <input
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={11}
                          value={identityNumber}
                          onChange={(event) =>
                            setIdentityNumber(
                              event.target.value
                                .replace(/\D/g, '')
                                .slice(0, 11),
                            )
                          }
                          placeholder={`Enter 11-digit ${identityMethod}`}
                        />
                      </label>
                      <p className="rental-helper">
                        <ShieldCheck size={15} /> Your {identityMethod} is sent only to the
                        verification service and is not displayed in the
                        application. The legal first and last name on the Dojah record must match your SingleRent account.
                      </p>
                      <Button
                        onClick={() => void startKyc()}
                        disabled={processing || identityNumber.length !== 11}
                      >
                        {processing ? (
                          <>
                            <LoaderCircle className="spin" size={15} /> Opening
                            secure verification…
                          </>
                        ) : (
                          <>
                            Pay ₦100 and verify {identityMethod} <ArrowRight size={15} />
                          </>
                        )}
                      </Button>
                    </section>
                  ) : (
                    <section className="rental-status-card">
                      <ShieldCheck size={24} />
                      <div>
                        <Status>Identity verified</Status>
                        <h2>Ready for secure payment</h2>
                        <p>
                          You will continue to our secure payment page to pay
                          the total shown. When payment is confirmed,
                          SingleRent holds the rent and caution fee securely.
                        </p>
                        <Button
                          onClick={() => setPolicyOpen(true)}
                          disabled={processing}
                        >
                          {processing ? (
                            <>
                              <LoaderCircle className="spin" size={15} />{' '}
                              Opening secure payment…
                            </>
                          ) : (
                            <>
                              Pay {naira(quote.totalAmountKobo)}{' '}
                              <ArrowRight size={15} />
                            </>
                          )}
                        </Button>
                      </div>
                    </section>
                  )}
                </section>
                <RentalSummary listing={listing} quote={quote} />
              </div>
              {policyOpen && (
                <div
                  className="rental-policy-backdrop"
                  role="presentation"
                  onMouseDown={closePolicy}
                >
                  <section
                    className="rental-policy-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="cancellation-policy-title"
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <header>
                      <small>Before payment</small>
                      <h2 id="cancellation-policy-title">Cancellation and refund policy</h2>
                      <p>Please read and accept this policy before continuing to secure payment.</p>
                    </header>
                    <div className="rental-policy-copy">
                      <section>
                        <h3>If you change your mind</h3>
                        <p>You can request cancellation before your tenancy starts. If approved, 97% of the rent is refunded and 3% of the rent is retained as a cancellation charge. The caution deposit, platform fee, agent fee and legal fee are not refunded, subject to applicable law.</p>
                      </section>
                      <section>
                        <h3>If the property fails to meet the listing promise</h3>
                        <p>For a verified material defect, misrepresentation, unavailability, or landlord failure, SingleRent refunds 100% of the rent, caution deposit, platform fee, agent fee and legal fee. No cancellation charge applies.</p>
                      </section>
                      <p className="rental-policy-note">SingleRent may request evidence and review the circumstances before a refund is approved. This policy applies before tenancy starts; tenancy termination after signing is governed by the tenancy agreement and applicable law.</p>
                    </div>
                    <label className="rental-policy-consent">
                      <input
                        type="checkbox"
                        checked={policyAccepted}
                        onChange={(event) => setPolicyAccepted(event.target.checked)}
                      />
                      <span>I have read and agree to the Cancellation and Refund Policy.</span>
                    </label>
                    <footer>
                      <Button variant="outline" onClick={closePolicy} disabled={processing}>Cancel</Button>
                      <Button onClick={() => void startPayment()} disabled={!policyAccepted || processing}>
                        {processing ? <><LoaderCircle className="spin" size={15} /> Opening secure payment…</> : <>Agree and continue to payment <ArrowRight size={15} /></>}
                      </Button>
                    </footer>
                  </section>
                </div>
              )}
            </>
          )
        )}
      </div>
    </Shell>
  );
}

export function PaymentCallback({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading',
  );
  const [message, setMessage] = useState('Confirming your secure payment…');
  const pendingRef = useRef<PendingPayment | null>(null);
  useEffect(() => {
    if (!session || pendingRef.current) return;
    const raw = window.sessionStorage.getItem(pendingPaymentStorageKey);
    if (!raw) {
      setState('error');
      setMessage(
        'We could not find the payment you returned from. Open your applications and try again.',
      );
      return;
    }
    let pending: PendingPayment;
    try {
      pending = JSON.parse(raw) as PendingPayment;
    } catch {
      setState('error');
      setMessage(
        'Your payment session could not be read. Please try again from your application.',
      );
      return;
    }
    pendingRef.current = pending;
    const verify = async () => {
      try {
        if (pending.kind === 'kyc') {
          const result = await api.users.verifyTransactionalKycCharge(
            session.accessToken,
            pending.chargeId,
          );
          if (result.underReview) {
            window.sessionStorage.removeItem(pendingPaymentStorageKey);
            setState('success');
            setMessage('Dojah confirmed the identity record, but its name differs from your SingleRent account. An administrator will review it before payment can continue.');
            return;
          }
          if (!result.verified) throw new Error('Dojah could not verify this identity number. The ₦100 verification service fee has been charged; you can try again with a correct NIN or BVN.');
          window.sessionStorage.removeItem(pendingPaymentStorageKey);
          setState('success');
          setMessage(
            'Identity verified. Returning you to your approved rent payment…',
          );
          go('payment', {
            application: pending.applicationId,
            listing: pending.listingId,
          });
        } else {
          await api.payments.verify(session.accessToken, pending.paymentId);
          window.sessionStorage.removeItem(pendingPaymentStorageKey);
          setState('success');
          setMessage('Payment confirmed and held securely.');
          requestPushPermissionPrompt('payment');
          go('confirmation', { payment: pending.paymentId });
        }
      } catch (cause) {
        setState('error');
        setMessage(
          cause instanceof Error
            ? cause.message
            : 'We could not confirm this payment yet.',
        );
      }
    };
    void verify();
  }, [go, session]);
  if (!session) return <SignInRequired go={go} />;
  return (
    <Shell go={go} title="Confirming payment">
      <div className="page">
        <section className={`rental-empty ${state === 'error' ? 'error' : ''}`}>
          {state === 'loading' ? (
            <LoaderCircle className="spin" size={26} />
          ) : state === 'success' ? (
            <CheckCircle2 size={26} />
          ) : (
            <CircleAlert size={26} />
          )}
          <h1>
            {state === 'loading'
              ? 'Confirming payment'
              : state === 'success'
                ? 'Payment confirmed'
                : 'Payment needs attention'}
          </h1>
          <p>{message}</p>
          {state === 'error' && (
            <Button onClick={() => go('tenant-applications')}>
              Back to applications
            </Button>
          )}
        </section>
      </div>
    </Shell>
  );
}

export function RentalConfirmation({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const searchParams = useSearchParams();
  const paymentId = searchParams.get('payment');
  const [payment, setPayment] = useState<ApiPayment | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!session || !paymentId) return;
    api.payments
      .get(session.accessToken, paymentId)
      .then(setPayment)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load this payment.',
        ),
      );
  }, [paymentId, session]);
  if (!session) return <SignInRequired go={go} />;
  return (
    <Shell go={go} title="Payment confirmed">
      <div className="page">
        <section className="rental-confirmation">
          {error ? (
            <>
              <CircleAlert size={28} />
              <h1>We could not load the payment</h1>
              <p>{error}</p>
            </>
          ) : !payment ? (
            <>
              <LoaderCircle className="spin" size={28} />
              <h1>Loading payment confirmation…</h1>
            </>
          ) : (
            <>
              <CheckCircle2 size={32} />
              <Status>Payment {payment.status.toLowerCase()}</Status>
              <h1>Your rent payment is protected.</h1>
              <p>
                {payment.listing.title} has been paid through the secured
                SingleRent flow. The property contact has been notified and the
                release remains auditable.
              </p>
              <dl>
                <div>
                  <dt>Payment reference</dt>
                  <dd>{payment.reference}</dd>
                </div>
                <div>
                  <dt>Total paid</dt>
                  <dd>{formatNaira(Number(payment.totalAmountKobo) / 100)}</dd>
                </div>
                <div>
                  <dt>Payment protection status</dt>
                  <dd>
                    {payment.escrow?.status.replace(/_/g, ' ').toLowerCase() ??
                      'processing'}
                  </dd>
                </div>
              </dl>
              <Button onClick={() => go('tenant-applications')}>
                View applications <ArrowRight size={14} />
              </Button>
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}
