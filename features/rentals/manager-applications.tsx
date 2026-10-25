"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  FileText,
  LoaderCircle,
  MapPin,
  UsersRound,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/features/app/app-provider";
import { Shell, Status, type Navigate } from "@/features/app/shell";
import { api, type ApiRentalApplication } from "@/lib/api";
import { formatNaira } from "@/lib/pricing";
import { ApplicationStatusBadge } from "@/features/rentals/rental-status";
import { TenantRentalRecord } from "@/features/reviews/tenant-rental-record";
import "./rental-flow.css";

export function ManagerApplications({
  go,
  role,
}: {
  go: Navigate;
  role: "landlord" | "agent";
}) {
  const { session } = useAppSession();
  const [applications, setApplications] = useState<ApiRentalApplication[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [loading, setLoading] = useState(Boolean(session));
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(
    () =>
      applications.find((application) => application.id === selectedId) ??
      applications[0] ??
      null,
    [applications, selectedId],
  );

  const load = async () => {
    if (!session) return;
    const response = await api.applications.received(session.accessToken, {
      pageSize: 100,
    });
    setApplications(response.items);
    setSelectedId((current) =>
      current &&
      response.items.some((application) => application.id === current)
        ? current
        : (response.items[0]?.id ?? null),
    );
  };

  useEffect(() => {
    if (!session) return;
    load()
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load applications.",
        ),
      )
      .finally(() => setLoading(false));
    // The API request is tied to the signed-in manager.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const approve = async () => {
    if (!session || !selected) return;
    setActing(true);
    setError(null);
    try {
      await api.applications.approve(session.accessToken, selected.id);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to approve this application.",
      );
    } finally {
      setActing(false);
    }
  };
  const reject = async () => {
    if (!session || !selected) return;
    if (rejectReason.trim().length < 3) {
      setError("Add a short reason before rejecting this application.");
      return;
    }
    setActing(true);
    setError(null);
    try {
      await api.applications.reject(
        session.accessToken,
        selected.id,
        rejectReason.trim(),
      );
      setRejectReason("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to reject this application.",
      );
    } finally {
      setActing(false);
    }
  };

  if (!session) return null;
  const roleCopy = role === "agent" ? "managed listings" : "your listings";
  return (
    <Shell go={go} role={role} title="Applications">
      <div className="page rental-flow manager-applications">
        <div className="rental-flow-heading">
          <span>
            <small>Tenant applications</small>
            <h1>Review applications</h1>
            <p>
              Approve an applicant before they can pay. A successful rent
              payment is then held securely while the required move-in steps
              are completed.
            </p>
          </span>
          <Status tone="gold">
            {
              applications.filter(
                (application) => application.status === "PENDING",
              ).length
            }{" "}
            awaiting review
          </Status>
        </div>
        {loading ? (
          <section className="rental-empty">
            <LoaderCircle className="spin" size={22} />
            <h1>Loading applications…</h1>
          </section>
        ) : error ? (
          <p className="rental-alert error">
            <CircleAlert size={15} /> {error}
          </p>
        ) : applications.length ? (
          <div className="manager-application-grid">
            <aside className="manager-application-list">
              {applications.map((application) => (
                <button
                  key={application.id}
                  className={application.id === selected?.id ? "active" : ""}
                  onClick={() => setSelectedId(application.id)}
                >
                  <span>
                    <ApplicationStatusBadge status={application.status} />
                    <b>
                      {application.tenant.firstName}{" "}
                      {application.tenant.lastName}
                    </b>
                    <small>{application.listing.title}</small>
                  </span>
                  <small>
                    {new Intl.DateTimeFormat("en-NG", {
                      day: "numeric",
                      month: "short",
                    }).format(new Date(application.createdAt))}
                  </small>
                </button>
              ))}
            </aside>
            {selected && (
              <section className="manager-application-detail">
                <div>
                  <ApplicationStatusBadge status={selected.status} />
                  <h2>{selected.listing.title}</h2>
                  <p>
                    <MapPin size={14} /> Application for one of {roleCopy}
                  </p>
                </div>
                <dl>
                  <div>
                    <dt>Tenant</dt>
                    <dd>
                      {selected.tenant.firstName} {selected.tenant.lastName}
                    </dd>
                  </div>
                  <div>
                    <dt>Move-in date</dt>
                    <dd>
                      {new Intl.DateTimeFormat("en-NG", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      }).format(new Date(selected.moveInDate))}
                    </dd>
                  </div>
                  <div>
                    <dt>Lease</dt>
                    <dd>{selected.leaseMonths} months</dd>
                  </div>
                  <div>
                    <dt>Occupants</dt>
                    <dd>{selected.occupantsCount}</dd>
                  </div>
                  <div>
                    <dt>Annual rent</dt>
                    <dd>
                      {formatNaira(
                        Number(selected.listing.annualRentKobo) / 100,
                      )}
                    </dd>
                  </div>
                </dl>
                {(selected.status === "PENDING" || selected.status === "AWAITING_PAYMENT") && <TenantRentalRecord applicationId={selected.id} token={session.accessToken} />}
                {selected.occupation && (
                  <p className="manager-note">
                    <b>Occupation</b>
                    {selected.occupation}
                  </p>
                )}
                {selected.tenantQuestionnaire && (
                  <>
                    <p className="manager-note">
                      <b>Rental readiness</b>
                      {selected.tenantQuestionnaire.employmentStatus
                        .replaceAll("_", " ")
                        .toLowerCase()}{" "}
                      ·{" "}
                      {selected.tenantQuestionnaire.incomeRange
                        .replaceAll("_", " ")
                        .toLowerCase()}{" "}
                      · moving for{" "}
                      {selected.tenantQuestionnaire.moveReason
                        .replaceAll("_", " ")
                        .toLowerCase()}{" "}
                    </p>
                    <p className="manager-note">
                      <b>Property-fit answers</b>Pets:{" "}
                      {selected.tenantQuestionnaire.pets
                        .toLowerCase()
                        .replaceAll("_", " ")}{" "}
                      · Smoking:{" "}
                      {selected.tenantQuestionnaire.smoking
                        .toLowerCase()
                        .replaceAll("_", " ")}{" "}
                      · Business use:{" "}
                      {selected.tenantQuestionnaire.intendedBusinessUse
                        .toLowerCase()
                        .replaceAll("_", " ")}
                    </p>
                  </>
                )}
                {selected.messageToLandlord && (
                  <p className="manager-note">
                    <b>Tenant message</b>
                    {selected.messageToLandlord}
                  </p>
                )}
                {selected.status === "PENDING" ? (
                  <div className="manager-actions">
                    <Button onClick={() => void approve()} disabled={acting}>
                      {acting ? (
                        <LoaderCircle className="spin" size={15} />
                      ) : (
                        <CheckCircle2 size={15} />
                      )}{" "}
                      Approve for payment
                    </Button>
                    <label>
                      Reason if declining
                      <textarea
                        value={rejectReason}
                        onChange={(event) =>
                          setRejectReason(event.target.value)
                        }
                        maxLength={1000}
                        placeholder="A brief, clear reason for the tenant."
                      />
                    </label>
                    <Button
                      variant="outline"
                      onClick={() => void reject()}
                      disabled={acting}
                    >
                      <XCircle size={15} /> Decline application
                    </Button>
                  </div>
                ) : (
                  <p className="rental-helper">
                    <FileText size={15} />{" "}
                    {selected.status === "AWAITING_PAYMENT"
                      ? "The tenant has been notified that payment is available."
                      : "This application already has a recorded decision."}
                  </p>
                )}
              </section>
            )}
          </div>
        ) : (
          <section className="rental-empty">
            <UsersRound size={24} />
            <h1>No tenant applications yet</h1>
            <p>Applications for {roleCopy} will appear here for review.</p>
          </section>
        )}
      </div>
    </Shell>
  );
}
