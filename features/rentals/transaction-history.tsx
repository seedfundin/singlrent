"use client";

import { useEffect, useState } from "react";
import { CircleAlert, Download, FileSignature, Landmark, LoaderCircle, ReceiptText, Upload, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Shell, Status, type Navigate } from "@/features/app/shell";
import { useAppSession } from "@/features/app/app-provider";
import { ApiFieldError } from "@/features/forms/api-field-error";
import { EscrowSettlement } from "./escrow-settlement";
import { api, apiFieldErrors, apiFormError, type ApiAgreement, type ApiFieldErrors, type ApiGuarantorForm, type ApiPayment, type ApiPayoutAudit, type ApiReceipt, type ApiTenancy } from "@/lib/api";
import { formatNaira } from "@/lib/pricing";
import { PayoutCenter } from "./payout-center";
import { MoveInVerification } from "./move-in-verification";
import "./rental-flow.css";

type WorkspaceRole = "tenant" | "landlord" | "agent";

function statusTone(status: string) {
  if (status === "SUCCESS" || status === "PAID" || status === "RELEASED") return "green" as const;
  if (status === "FAILED" || status === "REVERSED" || status === "REFUNDED" || status === "CANCELLED") return "red" as const;
  if (status === "PENDING" || status === "INITIALIZED" || status === "SCHEDULED" || status === "PROCESSING") return "gold" as const;
  return "slate" as const;
}

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function PayoutAudit({ payout }: { payout: ApiPayoutAudit }) {
  return <li>
    <span>
      <b>{label(payout.kind)} payout</b>
      <small>{payout.paidAt ? `Paid ${displayDate(payout.paidAt)}` : payout.scheduledAt ? `Scheduled ${displayDate(payout.scheduledAt)}` : "Awaiting release"}</small>
    </span>
    <span className="transaction-payout-amount"><Status tone={statusTone(payout.status)}>{label(payout.status)}</Status><b>{formatNaira(Number(payout.amountKobo) / 100)}</b></span>
    {payout.providerReference && <code>Bank transfer ref: {payout.providerReference}</code>}
  </li>;
}

function savePdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

type AgreementSection = { heading: string; clauses: string[] };

type GuarantorFormDraft = {
  guarantorName: string;
  knownForYears: string;
  homeAddress: string;
  businessAddress: string;
  telephone: string;
  profession: string;
  qualification: string;
};

const emptyGuarantorForm: GuarantorFormDraft = {
  guarantorName: "",
  knownForYears: "",
  homeAddress: "",
  businessAddress: "",
  telephone: "",
  profession: "",
  qualification: "",
};

function validateGuarantorForm(draft: GuarantorFormDraft, hasPassport: boolean): ApiFieldErrors {
  const errors: ApiFieldErrors = {};
  const add = (field: keyof GuarantorFormDraft | "passport", message: string) => {
    errors[field] = [message];
  };

  if (draft.guarantorName.trim().length < 2) add("guarantorName", "Enter the guarantor's full legal name.");
  const years = Number(draft.knownForYears);
  if (draft.knownForYears === "" || !Number.isInteger(years) || years < 0 || years > 100) add("knownForYears", "Enter the number of whole years, from 0 to 100.");
  if (draft.homeAddress.trim().length < 5) add("homeAddress", "Enter a home address with at least 5 characters.");
  if (draft.businessAddress.trim().length < 5) add("businessAddress", "Enter a business or office address with at least 5 characters.");
  if (draft.telephone.trim().length < 7) add("telephone", "Enter a telephone number with at least 7 characters.");
  if (draft.profession.trim().length < 2) add("profession", "Enter the guarantor's profession.");
  if (draft.qualification.trim().length < 2) add("qualification", "Enter the guarantor's qualification.");
  if (!hasPassport) add("passport", "Upload the guarantor's passport photograph.");

  return errors;
}

function guarantorDraftFrom(form: ApiGuarantorForm | null): GuarantorFormDraft {
  if (!form) return emptyGuarantorForm;
  return {
    guarantorName: form.guarantorName,
    knownForYears: String(form.knownForYears),
    homeAddress: form.homeAddress,
    businessAddress: form.businessAddress,
    telephone: form.telephone,
    profession: form.profession,
    qualification: form.qualification,
  };
}

function agreementSections(value: unknown): AgreementSection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((section) => {
    if (!section || typeof section !== "object") return [];
    const valueAsRecord = section as Record<string, unknown>;
    if (typeof valueAsRecord.heading !== "string" || !Array.isArray(valueAsRecord.clauses)) return [];
    return [{ heading: valueAsRecord.heading, clauses: valueAsRecord.clauses.filter((clause): clause is string => typeof clause === "string") }];
  });
}

function legalParagraphs(clauses: string[]): string[] {
  return clauses.flatMap((clause) => clause
    // Agreement templates can contain several numbered subclauses in one
    // stored string. Show each of those as a real reading paragraph.
    .split(/(?=\s\d+(?:\.\d+)+\.\s)/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean));
}

function AgreementPreview({ agreement }: { agreement: ApiAgreement }) {
  const terms = agreement.renderedTerms;
  const introductoryParagraphs = Array.isArray(terms.introductoryParagraphs)
    ? terms.introductoryParagraphs.filter((paragraph): paragraph is string => typeof paragraph === "string")
    : [];
  const sections = agreementSections(terms.sections);
  const schedules = agreementSections(terms.schedules);
  const documentId = `agreement-${agreement.id}`;
  const agreementSectionsWithIds = sections.map((section, index) => ({ ...section, id: `${documentId}-clause-${index + 1}` }));
  const agreementSchedulesWithIds = schedules.map((section, index) => ({ ...section, id: `${documentId}-schedule-${index + 1}` }));
  const createdOn = agreement.generatedAt ? new Intl.DateTimeFormat("en-NG", { dateStyle: "long" }).format(new Date(agreement.generatedAt)) : null;
  if (!introductoryParagraphs.length && !sections.length) return <p>The signed agreement record is available to download below.</p>;
  return <article className="agreement-preview" aria-label="Tenancy agreement terms">
    <div className="agreement-preview-layout">
      <nav className="agreement-preview-contents" aria-label="Agreement contents">
        <p>In this agreement</p>
        <a href={`#${documentId}-overview`}>Agreement overview</a>
        {agreementSectionsWithIds.map((section) => <a href={`#${section.id}`} key={section.id}>{section.heading}</a>)}
        {agreementSchedulesWithIds.map((section) => <a href={`#${section.id}`} key={section.id}>{section.heading}</a>)}
      </nav>
      <div className="agreement-paper">
        <header className="agreement-preview-cover" id={`${documentId}-overview`}>
          <p>SingleRent · tenancy record</p>
          <h3>{typeof terms.title === "string" ? terms.title : "Tenancy Agreement"}</h3>
          <dl>
            <div><dt>Agreement reference</dt><dd>{agreement.reference}</dd></div>
            {createdOn && <div><dt>Prepared on</dt><dd>{createdOn}</dd></div>}
          </dl>
        </header>
        <div className="agreement-preview-body">
          {introductoryParagraphs.length > 0 && <div className="agreement-introduction">
            {introductoryParagraphs.map((paragraph, index) => <p key={`intro-${index}`}>{paragraph}</p>)}
          </div>}
          {agreementSectionsWithIds.map((section) => <div className="agreement-section" id={section.id} key={section.id}>
            <h4>{section.heading}</h4>
            {legalParagraphs(section.clauses).map((clause, index) => <p key={`${section.id}-${index}`}>{clause}</p>)}
          </div>)}
          {agreementSchedulesWithIds.map((section) => <div className="agreement-section agreement-schedule" id={section.id} key={section.id}>
            <h4>{section.heading}</h4>
            {legalParagraphs(section.clauses).map((clause, index) => <p key={`${section.id}-${index}`}>{clause}</p>)}
          </div>)}
        </div>
      </div>
    </div>
  </article>;
}

function GuarantorUndertaking({ tenantName, property, knownForYears }: { tenantName: string; property: string; knownForYears: string }) {
  const years = knownForYears === "" ? "the stated period" : `${knownForYears} year${Number(knownForYears) === 1 ? "" : "s"}`;
  return <section className="guarantor-undertaking" aria-label="Guarantor undertaking">
    <p>Dear Sir,</p>
    <p><strong>Name of prospective tenant:</strong> {tenantName}</p>
    <p>I understand that the above named person wishes to rent a property at <strong>{property}</strong> through SingleRent.</p>
    <p>I have known him/her for <strong>{years}</strong> and I comment on his/her reputation. I therefore stand him/her as a guarantor. In case there is any misconduct, I understand that I may be called upon in line with the final tenancy agreement and applicable law.</p>
    <aside><strong>Caution</strong><span>It is dangerous to introduce a person who is not well known to you.</span></aside>
  </section>;
}

function TenancyDocuments({ tenancies, token, userId, userName, onRefresh }: { tenancies: ApiTenancy[]; token: string; userId: string; userName: string; onRefresh: () => Promise<void> }) {
  const [receipts, setReceipts] = useState<ApiReceipt[]>([]);
  const [agreements, setAgreements] = useState<Record<string, ApiAgreement | undefined>>({});
  const [guarantorForms, setGuarantorForms] = useState<Record<string, ApiGuarantorForm | null | undefined>>({});
  const [selectedTenancyId, setSelectedTenancyId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [signerName, setSignerName] = useState(userName);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [guarantorDraft, setGuarantorDraft] = useState<GuarantorFormDraft>(emptyGuarantorForm);
  const [guarantorSignerName, setGuarantorSignerName] = useState("");
  const [guarantorAccepted, setGuarantorAccepted] = useState(false);
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [guarantorFieldErrors, setGuarantorFieldErrors] = useState<ApiFieldErrors>({});

  useEffect(() => {
    let active = true;
    api.documents.receipts(token).then((items) => active && setReceipts(items)).catch(() => active && setMessage("Receipts will appear here after a verified payment or completed landlord disbursement."));
    return () => { active = false; };
  }, [token]);

  const openAgreement = async (tenancyId: string) => {
    setLoadingId(tenancyId);
    setMessage(null);
    try {
      const [agreement, guarantorForm] = await Promise.all([
        api.documents.agreement(token, tenancyId),
        api.documents.guarantorForm(token, tenancyId),
      ]);
      setAgreements((current) => ({ ...current, [tenancyId]: agreement }));
      setGuarantorForms((current) => ({ ...current, [tenancyId]: guarantorForm }));
      setGuarantorDraft(guarantorDraftFrom(guarantorForm));
      setGuarantorSignerName(guarantorForm?.guarantorName ?? "");
      setGuarantorAccepted(false);
      setPassportFile(null);
      setGuarantorFieldErrors({});
      setSelectedTenancyId(tenancyId);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The tenancy agreement is not ready yet.");
    } finally {
      setLoadingId(null);
    }
  };

  const selected = selectedTenancyId ? agreements[selectedTenancyId] : undefined;
  const selectedTenancy = selectedTenancyId ? tenancies.find((tenancy) => tenancy.id === selectedTenancyId) : undefined;
  const canTenantSign = selectedTenancy?.tenantId === userId;
  const selectedGuarantorForm = selectedTenancyId ? guarantorForms[selectedTenancyId] : undefined;
  const prospectiveTenantName = selectedGuarantorForm?.prospectiveTenantName
    ?? (selectedTenancy ? `${selectedTenancy.tenant.firstName} ${selectedTenancy.tenant.lastName}`.trim() : "the prospective tenant");
  const guarantorProperty = selectedTenancy
    ? [selectedTenancy.listing.title, selectedTenancy.listing.address].filter(Boolean).join(" · ")
    : "the property recorded in the SingleRent booking";
  const guarantorFormComplete = Boolean(
    guarantorDraft.guarantorName.trim()
    && guarantorDraft.knownForYears !== ""
    && Number.isInteger(Number(guarantorDraft.knownForYears))
    && Number(guarantorDraft.knownForYears) >= 0
    && guarantorDraft.homeAddress.trim()
    && guarantorDraft.businessAddress.trim()
    && guarantorDraft.telephone.trim()
    && guarantorDraft.profession.trim()
    && guarantorDraft.qualification.trim()
    && (selectedGuarantorForm?.passportUploaded || passportFile),
  );
  const updateGuarantorField = (field: keyof GuarantorFormDraft, value: string) => {
    setGuarantorDraft((current) => ({ ...current, [field]: value }));
    setGuarantorFieldErrors((current) => {
      const { [field]: _resolved, ...remaining } = current;
      return remaining;
    });
  };
  const sign = async () => {
    if (!selected || !selectedTenancyId) return;
    if (!acceptedTerms) {
      setMessage("Read the agreement and confirm your acceptance before signing.");
      return;
    }
    setLoadingId(selectedTenancyId);
    try {
      const agreement = await api.documents.signAgreement(token, selectedTenancyId, signerName.trim());
      setAgreements((current) => ({ ...current, [selectedTenancyId]: agreement }));
      setMessage("Your tenancy agreement signature has been recorded. The guarantor form must also be completed before tenancy starts.");
      await onRefresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to sign the agreement.");
    } finally {
      setLoadingId(null);
    }
  };

  const uploadSignedCopy = async (file: File) => {
    if (!selectedTenancyId || file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) {
      setMessage("Choose a PDF signed copy no larger than 10 MB.");
      return;
    }
    setLoadingId(selectedTenancyId);
    try {
      const upload = await api.media.createPresignedUpload(token, { kind: "agreement", tenancyId: selectedTenancyId, mediaType: "DOCUMENT", mimeType: file.type, size: file.size });
      const storageResponse = await fetch(upload.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!storageResponse.ok) throw new Error("The signed agreement could not be uploaded to secure storage.");
      const agreement = await api.documents.attachSignedCopy(token, selectedTenancyId, { signerName: userName, objectKey: upload.objectKey });
      setAgreements((current) => ({ ...current, [selectedTenancyId]: agreement }));
      setMessage("Signed agreement copy attached. The guarantor form must also be completed before tenancy starts.");
      await onRefresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to attach the signed agreement.");
    } finally {
      setLoadingId(null);
    }
  };

  const downloadAgreement = async () => {
    if (!selectedTenancyId || !selected) return;
    try {
      savePdf(await api.documents.agreementPdf(token, selectedTenancyId), `${selected.reference}.pdf`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to download the agreement.");
    }
  };

  const saveGuarantorForm = async () => {
    if (!selectedTenancyId || !canTenantSign) return;
    const clientErrors = validateGuarantorForm(guarantorDraft, Boolean(selectedGuarantorForm?.passportUploaded || passportFile));
    if (Object.keys(clientErrors).length > 0) {
      setGuarantorFieldErrors(clientErrors);
      setMessage("Please correct the highlighted guarantor details and try again.");
      return;
    }
    setLoadingId(selectedTenancyId);
    setMessage(null);
    setGuarantorFieldErrors({});
    try {
      let passportObjectKey: string | undefined;
      if (passportFile) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(passportFile.type) || passportFile.size > 5 * 1024 * 1024) {
          throw new Error("Use a JPEG, PNG or WebP passport photograph no larger than 5 MB.");
        }
        const upload = await api.media.createPresignedUpload(token, { kind: "guarantor", tenancyId: selectedTenancyId, mediaType: "IMAGE", mimeType: passportFile.type, size: passportFile.size });
        const storageResponse = await fetch(upload.uploadUrl, { method: "PUT", headers: { "content-type": passportFile.type }, body: passportFile });
        if (!storageResponse.ok) throw new Error("The guarantor passport photograph could not be uploaded securely.");
        passportObjectKey = upload.objectKey;
      }
      const form = await api.documents.saveGuarantorForm(token, selectedTenancyId, {
        guarantorName: guarantorDraft.guarantorName.trim(),
        knownForYears: Number(guarantorDraft.knownForYears),
        homeAddress: guarantorDraft.homeAddress.trim(),
        businessAddress: guarantorDraft.businessAddress.trim(),
        telephone: guarantorDraft.telephone.trim(),
        profession: guarantorDraft.profession.trim(),
        qualification: guarantorDraft.qualification.trim(),
        ...(passportObjectKey ? { passportObjectKey } : {}),
      });
      setGuarantorForms((current) => ({ ...current, [selectedTenancyId]: form }));
      setGuarantorDraft(guarantorDraftFrom(form));
      setGuarantorSignerName(form.guarantorName);
      setPassportFile(null);
      setMessage("Guarantor details and passport photograph saved. Download the form to sign manually, or record the electronic signature below.");
    } catch (cause) {
      const nextFieldErrors = apiFieldErrors(cause);
      setGuarantorFieldErrors(nextFieldErrors);
      setMessage(apiFormError(cause, nextFieldErrors, "Unable to save the guarantor form."));
    } finally {
      setLoadingId(null);
    }
  };

  const downloadGuarantorForm = async () => {
    if (!selectedTenancyId || !selectedGuarantorForm) return;
    try {
      savePdf(await api.documents.guarantorFormPdf(token, selectedTenancyId), `${selectedGuarantorForm.reference}.pdf`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to download the guarantor form.");
    }
  };

  const signGuarantorForm = async () => {
    if (!selectedTenancyId || !selectedGuarantorForm || !guarantorAccepted) {
      setMessage("Confirm the guarantor's acceptance before recording an electronic signature.");
      return;
    }
    setLoadingId(selectedTenancyId);
    try {
      const form = await api.documents.signGuarantorForm(token, selectedTenancyId, guarantorSignerName.trim());
      setGuarantorForms((current) => ({ ...current, [selectedTenancyId]: form }));
      setMessage("The electronic guarantor signature has been recorded. Your tenancy activates once both required documents are complete.");
      await onRefresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to sign the guarantor form.");
    } finally {
      setLoadingId(null);
    }
  };

  const uploadGuarantorSignedCopy = async (file: File) => {
    if (!selectedTenancyId || !selectedGuarantorForm || file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) {
      setMessage("Choose the manually signed guarantor form as a PDF no larger than 10 MB.");
      return;
    }
    setLoadingId(selectedTenancyId);
    try {
      const upload = await api.media.createPresignedUpload(token, { kind: "guarantor", tenancyId: selectedTenancyId, mediaType: "DOCUMENT", mimeType: file.type, size: file.size });
      const storageResponse = await fetch(upload.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!storageResponse.ok) throw new Error("The manually signed guarantor form could not be uploaded securely.");
      const form = await api.documents.attachGuarantorSignedCopy(token, selectedTenancyId, { signerName: guarantorSignerName.trim(), objectKey: upload.objectKey });
      setGuarantorForms((current) => ({ ...current, [selectedTenancyId]: form }));
      setMessage("Manually signed guarantor form attached. Your tenancy activates once both required documents are complete.");
      await onRefresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to attach the signed guarantor form.");
    } finally {
      setLoadingId(null);
    }
  };

  const downloadReceipt = async (receipt: ApiReceipt) => {
    try {
      savePdf(await api.documents.receiptPdf(token, receipt.id), `${receipt.receiptNumber}.pdf`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to download the receipt.");
    }
  };

  const alreadySigned = Boolean(selected?.signatures.some((signature) => signature.signerUserId === userId));

  return <section className="panel live-dashboard-panel tenancy-documents"><div className="subhead"><span><small>Secure records</small><h2>Agreements and receipts</h2></span></div>
    {message && <p className="rental-alert error"><CircleAlert size={15} /> {message}</p>}
    {tenancies.length ? <div className="document-tenancy-list">{tenancies.map((tenancy) => {
      const agreementReady = !tenancy.moveInVerification || tenancy.moveInVerification.status === "VERIFIED" || tenancy.status === "ACTIVE";
      return <article id={`agreement-${tenancy.id}`} key={tenancy.id}><span><b>{tenancy.listing.title}</b><small>{agreementReady ? `Tenancy ${tenancy.status.toLowerCase().replaceAll("_", " ")}` : "Complete move-in inspection first"}</small></span><Button size="sm" variant="outline" disabled={loadingId === tenancy.id || !agreementReady} onClick={() => void openAgreement(tenancy.id)}>{loadingId === tenancy.id ? <LoaderCircle className="spin" size={13} /> : <FileSignature size={13} />} {agreementReady ? "View agreement" : "Available after inspection"}</Button></article>;
    })}</div> : <p className="operations-empty">Your agreement becomes available when an eligible tenancy is created from a verified payment.</p>}
    {selected && selectedTenancyId && <>
      <section className="document-detail"><div className="document-detail-header"><small>Agreement {selected.reference}</small><Status tone={selected.status === "EXECUTED" ? "green" : "gold"}>{selected.status.toLowerCase().replaceAll("_", " ")}</Status></div>
        <p>Review the full agreement below. It becomes available only after the property-condition checklist has been approved. The tenant can sign electronically or attach a manually signed PDF. The tenancy starts only after this agreement and the required guarantor form are both complete.</p>
        <AgreementPreview agreement={selected} />
        <div className="document-actions"><Button size="sm" variant="outline" onClick={() => void downloadAgreement()}><Download size={13} /> Download PDF</Button></div>
        {canTenantSign && !alreadySigned && <div className="agreement-signing-actions"><label>Full legal name<input value={signerName} onChange={(event) => setSignerName(event.target.value)} autoComplete="name" /></label><label className="agreement-consent"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /> I have read the agreement and accept these tenancy terms.</label><div className="document-actions"><Button size="sm" disabled={loadingId === selectedTenancyId || !acceptedTerms || !signerName.trim()} onClick={() => void sign()}><FileSignature size={13} /> Sign electronically</Button><label className="document-upload"><Upload size={13} /> Attach manually signed PDF<input type="file" accept="application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadSignedCopy(file); event.currentTarget.value = ""; }} /></label></div></div>}
        <ul>{selected.signatures.map((signature) => <li key={`${signature.signerUserId}-${signature.signedAt}`}><b>{signature.signerRole.toLowerCase()}</b> · {signature.signerName} · {signature.method === "ELECTRONIC_CONSENT" ? "electronic consent" : "signed PDF"}</li>)}</ul>
      </section>

      <section className="document-detail guarantor-document"><div className="document-detail-header"><small>Required guarantor form{selectedGuarantorForm ? ` · ${selectedGuarantorForm.reference}` : ""}</small><Status tone={selectedGuarantorForm?.status === "EXECUTED" ? "green" : "gold"}>{selectedGuarantorForm?.status === "EXECUTED" ? "completed" : "required"}</Status></div>
        <p>This SingleRent guarantor form replaces the supplied Winfoods Limited form. Every field and the guarantor’s passport photograph are compulsory. Save the form first, then sign electronically or download it for a manual signature and upload the signed PDF.</p>
        <GuarantorUndertaking tenantName={prospectiveTenantName} property={guarantorProperty} knownForYears={selectedGuarantorForm ? String(selectedGuarantorForm.knownForYears) : guarantorDraft.knownForYears} />
        {selectedGuarantorForm?.status === "EXECUTED" ? <div className="guarantor-summary"><p><b>{selectedGuarantorForm.guarantorName}</b> signed by {selectedGuarantorForm.signatureMethod === "ELECTRONIC_CONSENT" ? "electronic consent" : "manual signed PDF"} on {selectedGuarantorForm.signedAt ? displayDate(selectedGuarantorForm.signedAt) : "the recorded date"}.</p><div className="document-actions"><Button size="sm" variant="outline" onClick={() => void downloadGuarantorForm()}><Download size={13} /> Download completed form</Button></div></div> : canTenantSign ? <div className="agreement-signing-actions guarantor-form-actions">
          <h3 className="guarantor-personal-data">Personal data of the guarantor</h3>
          <div className="guarantor-form-grid">
            <label className="full">Guarantor’s full legal name<input required aria-invalid={Boolean(guarantorFieldErrors.guarantorName)} value={guarantorDraft.guarantorName} onChange={(event) => updateGuarantorField("guarantorName", event.target.value)} autoComplete="name" /><ApiFieldError errors={guarantorFieldErrors} field="guarantorName" /></label>
            <label>Years known<input required aria-invalid={Boolean(guarantorFieldErrors.knownForYears)} type="number" min="0" max="100" value={guarantorDraft.knownForYears} onChange={(event) => updateGuarantorField("knownForYears", event.target.value)} /><ApiFieldError errors={guarantorFieldErrors} field="knownForYears" /></label>
            <label>Telephone<input required aria-invalid={Boolean(guarantorFieldErrors.telephone)} type="tel" minLength={7} value={guarantorDraft.telephone} onChange={(event) => updateGuarantorField("telephone", event.target.value)} autoComplete="tel" /><ApiFieldError errors={guarantorFieldErrors} field="telephone" /></label>
            <label className="full">Home address<textarea required aria-invalid={Boolean(guarantorFieldErrors.homeAddress)} minLength={5} value={guarantorDraft.homeAddress} onChange={(event) => updateGuarantorField("homeAddress", event.target.value)} /><ApiFieldError errors={guarantorFieldErrors} field="homeAddress" /></label>
            <label className="full">Business / office address<textarea required aria-invalid={Boolean(guarantorFieldErrors.businessAddress)} minLength={5} value={guarantorDraft.businessAddress} onChange={(event) => updateGuarantorField("businessAddress", event.target.value)} /><ApiFieldError errors={guarantorFieldErrors} field="businessAddress" /></label>
            <label>Profession<input required aria-invalid={Boolean(guarantorFieldErrors.profession)} value={guarantorDraft.profession} onChange={(event) => updateGuarantorField("profession", event.target.value)} /><ApiFieldError errors={guarantorFieldErrors} field="profession" /></label>
            <label>Qualification<input required aria-invalid={Boolean(guarantorFieldErrors.qualification)} value={guarantorDraft.qualification} onChange={(event) => updateGuarantorField("qualification", event.target.value)} /><ApiFieldError errors={guarantorFieldErrors} field="qualification" /></label>
            <label className={`full document-upload guarantor-passport${guarantorFieldErrors.passport ? " has-error" : ""}`}><Upload size={13} /> {passportFile ? passportFile.name : selectedGuarantorForm?.passportUploaded ? "Passport photograph already uploaded — replace" : "Upload guarantor passport photograph"}<input required type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setPassportFile(event.target.files?.[0] ?? null); setGuarantorFieldErrors((current) => { const { passport: _resolved, ...remaining } = current; return remaining; }); }} /></label>
            <div className="full"><ApiFieldError errors={guarantorFieldErrors} field="passport" /></div>
          </div>
          <div className="guarantor-save-action"><span><b>Ready to continue?</b><small>Save the guarantor’s details and passport photograph before choosing how to sign.</small></span><Button disabled={loadingId === selectedTenancyId} onClick={() => void saveGuarantorForm()}>{loadingId === selectedTenancyId ? <><LoaderCircle className="spin" size={15} /> Saving guarantor form…</> : <><FileSignature size={15} /> {selectedGuarantorForm ? "Save form changes" : "Save guarantor form"}</>}</Button></div>
          {selectedGuarantorForm && <><div className="document-actions"><Button size="sm" variant="outline" onClick={() => void downloadGuarantorForm()}><Download size={13} /> Download form to sign manually</Button></div><label>Guarantor’s full legal name for signature<input value={guarantorSignerName} onChange={(event) => setGuarantorSignerName(event.target.value)} autoComplete="name" /></label><label className="agreement-consent"><input type="checkbox" checked={guarantorAccepted} onChange={(event) => setGuarantorAccepted(event.target.checked)} /> I confirm the guarantor has read the undertaking and caution above and authorised this electronic signature.</label><div className="document-actions"><Button size="sm" disabled={loadingId === selectedTenancyId || !guarantorAccepted || !guarantorSignerName.trim()} onClick={() => void signGuarantorForm()}><FileSignature size={13} /> Sign guarantor form electronically</Button><label className="document-upload"><Upload size={13} /> Re-upload manually signed PDF<input type="file" accept="application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadGuarantorSignedCopy(file); event.currentTarget.value = ""; }} /></label></div></>}
        </div> : <p>The tenant must complete this required guarantor form.</p>}
      </section>
    </>}
    <div className="receipt-list"><h3>Receipts and proofs of payment</h3>{receipts.length ? receipts.map((receipt) => <article key={receipt.id}><span><b>{receipt.kind === "TENANT_PAYMENT_CONFIRMED" ? "Payment receipt" : receipt.payout?.kind === "AGENT" ? "Agent proof of payment" : "Landlord proof of payment"}</b><small>{receipt.receiptNumber} · {receipt.payment.listing.title}</small></span><Button size="sm" variant="outline" onClick={() => void downloadReceipt(receipt)}><Download size={13} /> Download PDF</Button></article>) : <p className="operations-empty">No verified receipt or proof of payment is available yet.</p>}</div>
  </section>;
}

export function TransactionHistory({ go, role }: { go: Navigate; role: WorkspaceRole }) {
  const { session } = useAppSession();
  const [payments, setPayments] = useState<ApiPayment[]>([]);
  const [tenancies, setTenancies] = useState<ApiTenancy[]>([]);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState<string | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      api.payments.list(session.accessToken, { pageSize: 50 }),
      api.tenancies.list(session.accessToken, { pageSize: 50 }),
    ])
      .then(([paymentResponse, tenancyResponse]) => {
        if (!active) return;
        setPayments(paymentResponse.items);
        setTenancies(tenancyResponse.items);
      })
      .catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : "Unable to load your transactions."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    if (loading || typeof window === 'undefined') return;
    const anchor = window.location.hash.slice(1);
    if (/^(payment|tenancy|agreement)-[0-9a-f-]{36}$/i.test(anchor)) document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
  }, [loading, payments, tenancies]);

  const audience = role === "tenant" ? "payments" : "payouts";
  const refreshPayments = async () => {
    if (!session) return;
    const [paymentResponse, tenancyResponse] = await Promise.all([
      api.payments.list(session.accessToken, { pageSize: 50 }),
      api.tenancies.list(session.accessToken, { pageSize: 50 }),
    ]);
    setPayments(paymentResponse.items);
    setTenancies(tenancyResponse.items);
  };
  const authorizeRelease = async (paymentId: string) => {
    if (!session) return;
    setReleasingId(paymentId);
    setError(null);
    try {
      await api.payments.authorizeRelease(session.accessToken, paymentId);
      await refreshPayments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to authorize this payment release.");
    } finally {
      setReleasingId(null);
    }
  };
  if (!session) {
    return <Shell go={go} role={role} title="Transactions"><div className="page rental-flow"><section className="rental-empty"><WalletCards size={25} /><h1>Sign in to view transactions</h1><p>Your secure payment and payout records are available only to participants in the transaction.</p></section></div></Shell>;
  }

  return <Shell go={go} role={role} title="Transactions"><div className="page rental-flow transaction-history-page">
    <div className="rental-flow-heading"><span><small>Financial history</small><h1>{role === "tenant" ? "Your payments" : "Your payouts"}</h1><p>Use the SingleRent Transaction Reference when contacting support. It connects the payment, its protected-payment record and any payout related to the rental.</p></span></div>
    {error && <p className="rental-alert error"><CircleAlert size={15} /> {error}</p>}
    {tenancies.filter((tenancy) => tenancy.moveInVerification).map((tenancy) => <div id={`tenancy-${tenancy.id}`} key={tenancy.id}><MoveInVerification tenancy={tenancy} token={session.accessToken} tenant={tenancy.tenantId === session.user.id} onRefresh={refreshPayments} /></div>)}
    <TenancyDocuments tenancies={tenancies} token={session.accessToken} userId={session.user.id} userName={`${session.user.firstName} ${session.user.lastName}`.trim()} onRefresh={refreshPayments} />
    <PayoutCenter role={role} />
    {loading ? <section className="rental-empty"><LoaderCircle className="spin" size={24} /><h1>Loading transactions…</h1></section> : payments.length ? <section className="transaction-list">
      {payments.map((payment) => <article id={`payment-${payment.id}`} key={payment.id}>
        <header><span><ReceiptText size={18} /><span><small>{payment.listing.source.toLowerCase()} listing</small><h2>{payment.listing.title}</h2></span></span><Status tone={statusTone(payment.status)}>{label(payment.status)}</Status></header>
        <dl>
          <div className="transaction-reference"><dt>SingleRent Transaction Reference</dt><dd><code>{payment.transactionReference}</code></dd></div>
          <div><dt>{role === "tenant" ? "Total paid" : "Rental total"}</dt><dd>{formatNaira(Number(payment.totalAmountKobo) / 100)}</dd></div>
          <div><dt>Created</dt><dd>{displayDate(payment.createdAt)}</dd></div>
          <div><dt>Payment protection status</dt><dd>{payment.escrow ? label(payment.escrow.status) : "Not created"}</dd></div>
        </dl>
        <div className="transaction-audit">
          <b>Audit details</b>
          {payment.providerReference && <code>Payment reference: {payment.providerReference}</code>}
          <small>This payment is linked to your application and its secure payment-protection record.</small>
        </div>
        {payment.payouts.length > 0 && <section className="transaction-payouts"><h3>Related {audience}</h3><ul>{payment.payouts.map((payout) => <PayoutAudit key={payout.id} payout={payout} />)}</ul></section>}
        {role !== "tenant" && !tenancies.find((tenancy) => tenancy.applicationId === payment.applicationId)?.moveInVerification && payment.status === "SUCCESS" && payment.application.status === "PAYMENT_HELD" && payment.escrow?.status === "HELD" && <div className="transaction-actions"><Button disabled={releasingId === payment.id} onClick={() => void authorizeRelease(payment.id)}>{releasingId === payment.id ? <><LoaderCircle className="spin" size={14} /> Authorizing…</> : "Authorize payment release"}</Button><small>Creates the landlord and agent payouts; each recipient then withdraws to their saved bank account.</small></div>}
        <EscrowSettlement payment={payment} tenancy={tenancies.find((tenancy) => tenancy.applicationId === payment.applicationId)} role={role} token={session.accessToken} onRefresh={refreshPayments} />
      </article>)}
    </section> : <section className="rental-empty"><Landmark size={25} /><h1>No transactions yet</h1><p>Completed payments and payouts will appear here with their traceable SingleRent reference.</p></section>}
  </div></Shell>;
}
