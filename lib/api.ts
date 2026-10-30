export type ApiRole = 'TENANT' | 'LANDLORD' | 'AGENT' | 'ADMIN' | 'SUPER_ADMIN';
export type InspectionWindow = {
  day?: number;
  date?: string;
  start: string;
  end: string;
};
export type InspectionAvailability = {
  mode: 'WEEKLY' | 'SPECIFIC_DATES' | 'BY_REQUEST';
  timezone: string;
  durationMinutes: 30 | 60;
  automaticConfirmation: boolean;
  windows: InspectionWindow[];
};
export type InspectionSlot = { startsAt: string; endsAt: string; date: string };
export type InspectionBooking = {
  id: string;
  listingId: string;
  tenantId: string;
  hostId: string;
  landlordId: string | null;
  agentId: string | null;
  hostCompletedAt: string | null;
  tenantConfirmedAt: string | null;
  tenantDisputedAt: string | null;
  timezone: string;
  startsAt: string;
  endsAt: string;
  status:
    | 'PENDING'
    | 'CONFIRMED'
    | 'DECLINED'
    | 'CANCELLED'
    | 'COMPLETED'
    | 'EXPIRED';
  proposedStartsAt: string | null;
  proposedById: string | null;
  listing?: {
    title: string;
    landlordId: string;
    managingAgentId: string | null;
  };
  tenant?: { firstName: string; lastName: string };
  host?: { firstName: string; lastName: string };
};
export type AdminPermissionKey =
  | 'USERS_VIEW'
  | 'USERS_EDIT'
  | 'USERS_SUSPEND'
  | 'KYC_VIEW'
  | 'KYC_REVIEW'
  | 'LISTINGS_VIEW'
  | 'LISTINGS_APPROVE'
  | 'LISTINGS_REJECT'
  | 'LISTINGS_SUSPEND'
  | 'TRANSACTIONS_VIEW'
  | 'ESCROW_MANAGE'
  | 'PAYOUTS_RELEASE'
  | 'REFUNDS_PROCESS'
  | 'PLATFORM_FEES_VIEW'
  | 'AGENT_COMMISSIONS_VIEW'
  | 'REPORTS_VIEW'
  | 'REPORTS_INVESTIGATE'
  | 'REPORTS_RESOLVE'
  | 'MAINTENANCE_MANAGE'
  | 'REVIEWS_VIEW'
  | 'REVIEWS_MODERATE'
  | 'ADMINS_CREATE'
  | 'ADMIN_PERMISSIONS_EDIT'
  | 'AUDIT_LOGS_VIEW'
  | 'SYSTEM_SETTINGS_MODIFY';
export type PermissionEffect = 'ALLOW' | 'DENY';

export type ApiSession = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    firstName: string;
    lastName: string;
    roles: ApiRole[];
    phoneVerified: boolean;
  };
  phoneVerification?: {
    id: string;
    expiresAt: string;
    developmentCode?: string;
  };
};

export type ApiUserProfile = {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  phoneVerifiedAt: string | null;
  emailVerifiedAt: string | null;
  profileImageUrl: string | null;
  profileImagePublicId: string | null;
  bio: string | null;
  createdAt: string;
  tenantProfile: { occupation: string | null; defaultOccupants: number } | null;
  landlordProfile: { businessName: string | null } | null;
  agentProfile: {
    companyName: string | null;
    licenceNumber: string | null;
  } | null;
  userRoles: Array<{ role: { code: ApiRole; name: string } }>;
};

export type NinVerificationResult = {
  status: 'PENDING' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED';
  verified: boolean;
  underReview?: boolean;
  provider: 'DOJAH';
  providerReference?: string;
  superseded?: boolean;
};

export type PublisherVerificationMethod = 'NIN' | 'BVN';
export type PublisherVerificationStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'FAILED';

export type ApiPublisherVerification = {
  id: string | null;
  method: PublisherVerificationMethod | null;
  status: PublisherVerificationStatus;
  verified: boolean;
  provider: 'DOJAH';
  providerReference: string | null;
  providerMethod: PublisherVerificationMethod | null;
  providerStatus: string | null;
  livenessVerified: boolean;
  nameMatchStatus: 'NOT_CHECKED' | 'MATCHED' | 'MISMATCHED' | 'UNAVAILABLE';
  nameMatchReason: string | null;
  failureReason: string | null;
  requestedAt: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
};

export type ListingMediaType = 'IMAGE' | 'VIDEO';

export type ApiListingMedia = {
  id: string;
  url: string;
  objectKey: string;
  mediaType: ListingMediaType;
  altText: string | null;
  mimeType: string;
  bytes: number | null;
  position: number;
};

export type ApiConversationType =
  | 'LISTING_ENQUIRY'
  | 'PROPERTY_AI'
  | 'TENANCY'
  | 'SUPPORT';

export type ApiConversationMember = {
  userId: string;
  joinedAt: string;
  lastReadAt: string | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  };
};

export type ApiMessage = {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: 'USER' | 'SYSTEM' | 'AI';
  body: string;
  createdAt: string;
  editedAt: string | null;
  sender: {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  } | null;
};

export type ApiConversation = {
  id: string;
  listingId: string | null;
  type: ApiConversationType;
  subject: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  listing: { id: string; slug: string; title: string } | null;
  members: ApiConversationMember[];
  messages: ApiMessage[];
  unreadCount?: number;
};

export type ApiListing = {
  id: string;
  slug: string;
  title: string;
  description: string;
  propertyType: 'APARTMENT' | 'HOUSE' | 'DUPLEX' | 'STUDIO' | 'ROOM' | 'OTHER';
  source: 'LANDLORD' | 'AGENT';
  status:
    | 'DRAFT'
    | 'PENDING_REVIEW'
    | 'PUBLISHED'
    | 'REJECTED'
    | 'SUSPENDED'
    | 'ARCHIVED';
  moderationNote: string | null;
  availability: 'AVAILABLE' | 'RENTED' | 'UNAVAILABLE';
  annualRentKobo: string;
  serviceChargeKobo: string;
  cautionFeeKobo: string;
  bedrooms: number;
  bathrooms: number;
  state: string;
  area: string;
  address: string;
  latitude: number | string | null;
  longitude: number | string | null;
  amenities: string[];
  availableFrom: string | null;
  minimumLeaseMonths: number;
  media: ApiListingMedia[];
  landlord: {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  };
  managingAgent: {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  } | null;
  _count: {
    savedBy: number;
    applications: number;
    maintenanceRequests: number;
  };
  reputation?: {
    score: number;
    propertyReviewCount: number;
    landlordReviewCount: number;
    label: 'NEW' | 'ESTABLISHED';
  };
};

export type ApiRentalPricing = {
  listingId: string;
  rentAmountKobo: string;
  platformFeeKobo: string;
  agentFeeKobo: string;
  legalFeeKobo: string;
  cautionFeeKobo: string;
  totalAmountKobo: string;
};

export type ApiApplicationStatus =
  | 'PENDING'
  | 'AWAITING_PAYMENT'
  | 'PAYMENT_HELD'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'ACTIVE'
  | 'COMPLETED';

export type ApiRentalApplication = {
  id: string;
  listingId: string;
  tenantId: string;
  landlordId: string;
  agentId: string | null;
  moveInDate: string;
  leaseMonths: number;
  occupation: string | null;
  occupantsCount: number;
  messageToLandlord: string | null;
  tenantQuestionnaire: {
    employmentStatus:
      | 'EMPLOYED'
      | 'SELF_EMPLOYED'
      | 'STUDENT'
      | 'RETIRED'
      | 'OTHER';
    incomeRange:
      | 'UNDER_100K'
      | '100K_TO_250K'
      | '250K_TO_500K'
      | '500K_TO_1M'
      | 'OVER_1M'
      | 'PREFER_NOT_TO_SAY';
    moveReason:
      | 'NEW_JOB'
      | 'RELOCATION'
      | 'FAMILY'
      | 'UPGRADING'
      | 'FIRST_HOME'
      | 'OTHER';
    preferredContact: 'EMAIL' | 'PHONE' | 'IN_APP';
    pets: 'YES' | 'NO' | 'PREFER_NOT_TO_SAY';
    smoking: 'YES' | 'NO' | 'PREFER_NOT_TO_SAY';
    intendedBusinessUse: 'YES' | 'NO' | 'PREFER_NOT_TO_SAY';
    confirmsInformationIsAccurate: boolean;
  } | null;
  questionnaireSubmittedAt: string | null;
  status: ApiApplicationStatus;
  decisionReason: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  listing: {
    id: string;
    slug: string;
    title: string;
    annualRentKobo: string;
    cautionFeeKobo: string;
  };
  tenant: { id: string; firstName: string; lastName: string };
  landlord: { id: string; firstName: string; lastName: string };
  agent: { id: string; firstName: string; lastName: string } | null;
  payments: {
    id: string;
    reference: string;
    status: string;
    totalAmountKobo: string;
    createdAt: string;
  }[];
};

export type CreateApplicationInput = {
  listingId: string;
  moveInDate: string;
  leaseMonths: number;
  occupation?: string;
  occupantsCount: number;
  messageToLandlord?: string;
  tenantQuestionnaire: NonNullable<ApiRentalApplication['tenantQuestionnaire']>;
};

export type ApiPayment = {
  id: string;
  /** The shared reference used by SingleRent support, operations and participants. */
  transactionReference: string;
  reference: string;
  provider: string;
  providerReference: string | null;
  status:
    | 'INITIALIZED'
    | 'PENDING'
    | 'SUCCESS'
    | 'FAILED'
    | 'ABANDONED'
    | 'REVERSED'
    | 'REFUNDED';
  applicationId: string;
  listingId: string;
  tenantId: string;
  landlordId: string;
  agentId: string | null;
  rentAmountKobo: string;
  platformFeeKobo: string;
  agentFeeKobo: string;
  legalFeeKobo: string;
  cautionFeeKobo: string;
  totalAmountKobo: string;
  initializedAt: string;
  verifiedAt: string | null;
  failedAt: string | null;
  createdAt: string;
  listing: {
    id: string;
    slug: string;
    title: string;
    source: 'LANDLORD' | 'AGENT';
  };
  application: {
    id: string;
    status: ApiApplicationStatus;
    moveInDate: string;
    leaseMonths: number;
  };
  escrow: {
    id: string;
    status: string;
    cautionStatus: string;
    rentHeldKobo: string;
    cautionHeldKobo: string;
    releaseAuthorizedAt: string | null;
    releasedAt: string | null;
    cautionDeductions: ApiCautionDeduction[];
  } | null;
  payouts: ApiPayoutAudit[];
};

export type ApiCautionDeduction = {
  id: string;
  amountKobo: string;
  reason: string;
  evidence: string[] | null;
  proposedByUserId: string;
  acceptedAt: string | null;
  disputedAt: string | null;
  resolvedAt: string | null;
  resolution: 'LANDLORD_PAID' | 'TENANT_REFUND' | null;
  resolutionNote: string | null;
  createdAt: string;
};

export type ApiPayoutAudit = {
  id: string;
  recipientUserId: string;
  kind:
    | 'LANDLORD'
    | 'AGENT'
    | 'CAUTION_DEDUCTION'
    | 'CAUTION_REFUND'
    | 'REFUND';
  status:
    | 'PENDING'
    | 'SCHEDULED'
    | 'PROCESSING'
    | 'PAID'
    | 'FAILED'
    | 'CANCELLED';
  amountKobo: string;
  serviceFeeKobo: string;
  providerReference: string | null;
  scheduledAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type ApiPayout = ApiPayoutAudit & {
  failureReason: string | null;
  updatedAt: string;
  payment: {
    id: string;
    reference: string;
    listing: { title: string };
  };
};

export type ApiBank = { name: string; code: string };

export type ApiPayoutAccount = {
  bankName: string;
  accountName: string;
  accountLast4: string;
  currency: string;
  updatedAt: string;
};

export type ApiAdminPayoutAudit = ApiPayoutAudit & {
  recipient: { id: string; firstName: string; lastName: string; email: string };
};

export type ApiAdminTransaction = Omit<ApiPayment, 'payouts' | 'application'> & {
  application: ApiPayment['application'] & {
    tenancy: {
      id: string;
      status: 'PENDING_MOVE_IN' | 'ACTIVE' | 'ENDED' | 'CANCELLED';
      agreement: { status: ApiAgreement['status']; executedAt: string | null } | null;
      guarantorForm: { status: ApiGuarantorForm['status']; signedAt: string | null } | null;
    } | null;
  };
  tenant: { id: string; firstName: string; lastName: string; email: string };
  landlord: { id: string; firstName: string; lastName: string; email: string };
  agent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  escrow: ApiPayment['escrow'];
  payouts: ApiAdminPayoutAudit[];
  ledgerEntries: Array<{
    id: string;
    entryType: string;
    debitAccount: string;
    creditAccount: string;
    amountKobo: string;
    currency: string;
    createdAt: string;
  }>;
  moveInVerification: {
    status: string;
    submittedAt: string | null;
    verifiedAt: string | null;
    adminHold: boolean;
    issues: Array<{ severity: string; status: string; classificationDisputed: boolean }>;
    refundRequests: Array<{ status: string }>;
  } | null;
};

export type ApiTenancy = {
  id: string;
  applicationId: string;
  listingId: string;
  tenantId: string;
  landlordId: string;
  agentId: string | null;
  startsAt: string;
  endsAt: string;
  status: 'PENDING_MOVE_IN' | 'ACTIVE' | 'ENDED' | 'CANCELLED';
  moveInVerification?: { status: string } | null;
  listing: { id: string; slug: string; title: string; address: string | null };
  tenant: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  landlord: { id: string; firstName: string; lastName: string };
  agent: { id: string; firstName: string; lastName: string } | null;
};

export type MoveInAnswer = {
  item: string;
  result: 'SATISFACTORY' | 'ISSUE_FOUND' | 'NOT_APPLICABLE';
  description?: string;
  issueType?: string;
};
export type ApiMoveIn = {
  id: string;
  tenancyId: string;
  paymentId: string;
  status: string;
  deadlineAt: string | null;
  handoverAt: string | null;
  submittedAt: string | null;
  draft: MoveInAnswer[] | null;
  issues: Array<{
    id: string;
    item: string;
    description: string;
    severity: string;
    status: string;
    classificationDisputed: boolean;
  }>;
  refundRequests: Array<{ id: string; status: string; reason: string }>;
  evidence: Array<{
    id: string;
    issueId: string | null;
    uploaderId: string;
    createdAt: string;
  }>;
  events: Array<{
    id: string;
    type: string;
    details: Record<string, unknown>;
    createdAt: string;
  }>;
};

export type ApiAgreement = {
  id: string;
  tenancyId: string;
  reference: string;
  status:
    | 'PENDING_SIGNATURES'
    | 'PARTIALLY_SIGNED'
    | 'EXECUTED'
    | 'SUPERSEDED'
    | 'VOID';
  termsVersion: string;
  documentHash: string;
  renderedTerms: Record<string, unknown>;
  generatedAt: string;
  executedAt: string | null;
  signatures: Array<{
    signerUserId: string;
    signerRole: 'TENANT' | 'LANDLORD' | 'AGENT';
    method: 'ELECTRONIC_CONSENT' | 'UPLOADED_SIGNED_COPY';
    signerName: string;
    signedAt: string;
    uploadedDocumentUrl: string | null;
  }>;
};

export type ApiGuarantorForm = {
  id: string;
  tenancyId: string;
  reference: string;
  status: 'PENDING_SIGNATURE' | 'EXECUTED';
  prospectiveTenantName: string;
  guarantorName: string;
  knownForYears: number;
  homeAddress: string;
  businessAddress: string;
  telephone: string;
  profession: string;
  qualification: string;
  documentHash: string;
  signatureMethod: 'ELECTRONIC_CONSENT' | 'UPLOADED_SIGNED_COPY' | null;
  signerName: string | null;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
  passportUploaded: boolean;
  signedCopyAttached: boolean;
};

export type ApiReceipt = {
  id: string;
  receiptNumber: string;
  kind: 'TENANT_PAYMENT_CONFIRMED' | 'LANDLORD_PAYOUT_DISBURSED';
  issuedAt: string;
  metadata: Record<string, unknown>;
  payment: {
    reference: string;
    currency: string;
    listing: { title: string; address: string | null };
  };
  payout: { id: string; kind: string; paidAt: string | null } | null;
};

export type PaginatedResponse<T> = {
  items: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

export type ApiAdminUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'DEACTIVATED';
  lastActiveAt: string | null;
  createdAt: string;
  userRoles: { role: { code: ApiRole; name: string } }[];
  directPermissions: {
    effect: PermissionEffect;
    permission: { key: AdminPermissionKey; name: string };
  }[];
  kyc: {
    status: string;
    phoneStatus: string;
    ninStatus: string;
    identityMethod: PublisherVerificationMethod | null;
    nameMatchStatus: 'NOT_CHECKED' | 'MATCHED' | 'MISMATCHED' | 'UNAVAILABLE';
    nameMatchReason: string | null;
    updatedAt: string;
  } | null;
  publisherVerification: {
    status: PublisherVerificationStatus;
    method: PublisherVerificationMethod | null;
    nameMatchStatus: 'NOT_CHECKED' | 'MATCHED' | 'MISMATCHED' | 'UNAVAILABLE';
    nameMatchReason: string | null;
    updatedAt: string;
  } | null;
};

export type ApiAuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
  actor: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

export type AdminListingQuery = {
  page?: number;
  pageSize?: number;
  status?: ApiListing['status'];
};

export type ListingQuery = {
  page?: number;
  pageSize?: number;
  state?: string;
  area?: string;
  bedrooms?: number;
  propertyType?: ApiListing['propertyType'];
  sort?: 'RECENT' | 'RECOMMENDED';
};

export type CreateListingInput = {
  title: string;
  description: string;
  propertyType: ApiListing['propertyType'];
  annualRentKobo: string;
  serviceChargeKobo?: string;
  cautionFeeKobo?: string;
  bedrooms: number;
  bathrooms: number;
  state: string;
  area: string;
  address: string;
  latitude: number;
  longitude: number;
  amenities?: string[];
  availableFrom?: string;
  minimumLeaseMonths?: number;
  media?: ListingMediaInput[];
};

export type ListingMediaInput = {
  objectKey: string;
  mediaType: ListingMediaType;
  altText?: string;
  position?: number;
};

export type PresignedMediaUpload = {
  objectKey: string;
  mediaType: ListingMediaType | 'DOCUMENT';
  mimeType: string;
  uploadUrl: string;
  publicUrl?: string;
  expiresAt: string;
};

export type ApiMaintenanceRequest = {
  id: string;
  listingId: string;
  title: string;
  description: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  resolvedAt?: string | null;
  closedAt?: string | null;
  escalatedAt?: string | null;
  responseDueAt?: string | null;
  adminOwnerId?: string | null;
  createdAt: string;
  updatedAt: string;
  listing: { id: string; slug: string; title: string };
  reporter: { id: string; firstName: string; lastName: string };
  landlord?: { id: string; firstName: string; lastName: string };
  agent?: { id: string; firstName: string; lastName: string } | null;
  assignedTo?: { id: string; firstName: string; lastName: string } | null;
  adminOwner?: { id: string; firstName: string; lastName: string } | null;
  attachments?: Array<{
    id: string;
    url: string;
    publicId: string;
    format: string | null;
    bytes: number | null;
    createdAt: string;
  }>;
  attention?: {
    urgent: boolean;
    overdue: boolean;
    escalated: boolean;
    unassigned: boolean;
    needsAttention: boolean;
  };
  _count?: { updates: number; attachments: number };
  updates: {
    id: string;
    body: string | null;
    fromStatus: string | null;
    toStatus: string | null;
    createdAt: string;
    author: { id: string; firstName: string; lastName: string };
  }[];
};

export type ApiMaintenanceAuditEvent = {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; firstName: string; lastName: string } | null;
};

export type ApiAdminMaintenanceCase = ApiMaintenanceRequest & {
  auditHistory: ApiMaintenanceAuditEvent[];
};

export type ApiMaintenanceOperator = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

export type ApiReview = {
  id: string;
  inspectionId: string | null;
  tenancyId: string | null;
  listingId: string | null;
  authorId: string;
  targetUserId: string | null;
  targetType: 'LISTING' | 'LANDLORD' | 'AGENT' | 'TENANT';
  score: number;
  body: string;
  status: 'PUBLISHED' | 'HIDDEN' | 'REMOVED';
  moderationNote: string | null;
  disputedAt: string | null;
  disputeReason: string | null;
  disputeResolvedAt: string | null;
  ratingDimensions: Partial<Record<
    | 'accuracy'
    | 'condition'
    | 'communication'
    | 'reliability'
    | 'attendance'
    | 'punctuality'
    | 'paymentReliability'
    | 'propertyCare'
    | 'tenancyObligations',
    number
  >> | null;
  createdAt: string;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  };
  listing: { id: string; title: string; slug: string } | null;
  targetUser: { id: string; firstName: string; lastName: string } | null;
};

export type ApiReviewOpportunity = {
  tenancyId: string;
  endedAt: string;
  listing: { id: string; title: string; slug: string };
  targets: Array<{
    type: ApiReview['targetType'];
    user: { id: string; firstName: string; lastName: string } | null;
    reviewed: boolean;
  }>;
};

export type ApiTenantReviewRecord = {
  tenant: { id: string; firstName: string; lastName: string };
  source: 'TENANCY' | 'INSPECTION';
  summary: {
    count: number;
    averageScore: number | null;
    dimensions: Record<string, { average: number; count: number }>;
  };
  reviews: PaginatedResponse<ApiReview>;
};

export type ApiMaintenanceCategory =
  | 'PLUMBING'
  | 'ELECTRICITY'
  | 'APPLIANCE'
  | 'SECURITY'
  | 'STRUCTURAL'
  | 'OTHER';
export type ApiMaintenancePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type ApiNotificationType =
  | 'NEW_MESSAGE'
  | 'NEW_APPLICATION'
  | 'APPLICATION_APPROVED'
  | 'APPLICATION_REJECTED'
  | 'PAYMENT_SUCCESSFUL'
  | 'PAYMENT_FAILED'
  | 'ESCROW_UPDATED'
  | 'COMMISSION_EARNED'
  | 'MAINTENANCE_CREATED'
  | 'MAINTENANCE_UPDATED'
  | 'LISTING_STATUS_UPDATED'
  | 'KYC_UPDATED'
  | 'INCIDENT_UPDATED'
  | 'CAUTION_DISPUTE_UPDATED'
  | 'ADMIN_INVITATION'
  | 'INSPECTION_UPDATED'
  | 'REVIEW_UPDATED'
  | 'VERIFICATION_UPDATED'
  | 'TENANCY_UPDATED'
  | 'ADMIN_ANNOUNCEMENT';
export type ApiNotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH';

export type ApiNotificationPreference = {
  type: ApiNotificationType;
  channel: ApiNotificationChannel;
  enabled: boolean;
};

export type ApiNotification = {
  id: string;
  type: ApiNotificationType;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  data?: Record<string, unknown> | null;
};

export type ApiIncidentType =
  | 'SAFETY_THREAT'
  | 'HARASSMENT'
  | 'FRAUD'
  | 'VIOLENCE'
  | 'SERIOUS_PROPERTY_SAFETY'
  | 'MISCONDUCT';
export type ApiIncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ApiIncidentStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'INVESTIGATING'
  | 'RESOLVED'
  | 'CLOSED';

export type ApiIncident = {
  id: string;
  reference: string;
  type: ApiIncidentType;
  severity: ApiIncidentSeverity;
  status: ApiIncidentStatus;
  description: string;
  confidential: boolean;
  occurredAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  listing: { id: string; title: string; slug: string } | null;
};

export type ApiDashboard = {
  roles: ApiRole[];
  unreadNotifications: number;
  unreadMessages: number;
  tenant?: {
    savedHomes: number;
    activeTenancies: number;
    pendingApplications: number;
    maintenanceOpen: number;
    totalPaidKobo: string;
  };
  landlord?: {
    totalListings: number;
    activeListings: number;
    activeTenancies: number;
    pendingApplications: number;
    maintenanceOpen: number;
    paidOutKobo: string;
  };
  agent?: {
    totalListings: number;
    activeListings: number;
    activeTenancies: number;
    pendingApplications: number;
    maintenanceOpen: number;
    paidOutKobo: string;
  };
  admin?: {
    users: number;
    administrators: number;
    listingsPendingReview: number;
    successfulPayments: number;
    maintenanceOpen: number;
    platformRevenueKobo: string;
    agentCommissionsKobo: string;
  };
};

export type ApiSystemStates = {
  checkedAt: string;
  api: 'operational';
  database: 'operational' | 'unavailable';
  redis: 'operational' | 'unavailable';
  integrations: {
    paymentService: 'configured' | 'not_configured';
    dojah: 'configured' | 'not_configured';
    r2: 'configured' | 'not_configured';
  };
};

export type ApiValidationIssue = {
  /** A dotted backend field path, when the failure belongs to a form control. */
  field: string | null;
  message: string;
};

export type ApiFieldErrors = Record<string, string[]>;

type ApiErrorResponse = {
  message?: unknown;
  issues?: unknown;
  errors?: unknown;
  error?: unknown;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Normalized, safe validation context for forms. Never render `payload` directly. */
    readonly issues: ApiValidationIssue[] = [],
    /** Preserved for logs/debugging; UI should use the normalized fields above. */
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')
  : process.env.NODE_ENV === 'development'
    ? 'http://localhost:4000/api/v1'
    : null;
const sessionStorageKey = 'singlerent.session';
const registrationDraftKey = 'singlerent.registration-draft';
type RequestOptions = { retryOnUnauthorized?: boolean };
type SessionListener = (session: ApiSession | null) => void;

const sessionListeners = new Set<SessionListener>();
let refreshPromise: Promise<ApiSession> | null = null;

function notifySessionListeners(session: ApiSession | null): void {
  sessionListeners.forEach((listener) => listener(session));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function textMessages(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(textMessages);
  if (isRecord(value)) return Object.values(value).flatMap(textMessages);
  return [];
}

function issueField(value: Record<string, unknown>): string | null {
  if (typeof value.field === 'string' && value.field.trim())
    return value.field.trim();
  if (typeof value.property === 'string' && value.property.trim())
    return value.property.trim();
  if (Array.isArray(value.path)) {
    const path = value.path
      .filter(
        (part): part is string | number =>
          typeof part === 'string' || typeof part === 'number',
      )
      .join('.');
    if (path) return path;
  }
  return null;
}

function validationIssues(value: unknown): ApiValidationIssue[] {
  if (isRecord(value)) {
    if ('message' in value || 'messages' in value || 'constraints' in value)
      return validationIssues([value]);
    return Object.entries(value).flatMap(([field, messages]) =>
      textMessages(messages).map((message) => ({ field, message })),
    );
  }
  const entries = Array.isArray(value) ? value : [];
  return entries.flatMap((entry): ApiValidationIssue[] => {
    if (typeof entry === 'string') return [{ field: null, message: entry }];
    if (!isRecord(entry)) return [];
    const messages = [
      ...textMessages(entry.message),
      ...textMessages(entry.messages),
      ...textMessages(entry.constraints),
    ];
    return [...new Set(messages)].map((message) => ({
      field: issueField(entry),
      message,
    }));
  });
}

function fallbackMessage(status: number): string {
  if (status === 0)
    return 'We could not reach SingleRent. Check your connection and try again.';
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403)
    return 'You do not have permission to complete this action.';
  if (status === 404) return 'The requested record could not be found.';
  if (status >= 500)
    return 'SingleRent is temporarily unavailable. Please try again.';
  return 'Something went wrong. Please try again.';
}

function isGenericMessage(message: string): boolean {
  const value = message.trim();
  return (
    /^(request validation failed|bad request|validation failed|error|failed|unauthorized|forbidden|not found|internal server error|service unavailable)$/i.test(
      value,
    ) || /^cannot (get|post|put|patch|delete)\s+\//i.test(value)
  );
}

/** Converts supported backend error bodies into a safe, form-aware client error. */
export function normalizeApiError(payload: unknown, status: number): ApiError {
  const error: ApiErrorResponse = isRecord(payload) ? payload : {};
  const issues = [
    ...validationIssues(error.issues),
    ...validationIssues(error.errors),
  ];
  const uniqueIssues = (status >= 500 ? [] : issues).filter(
    (issue, index, source) =>
      source.findIndex(
        (candidate) =>
          candidate.field === issue.field &&
          candidate.message === issue.message,
      ) === index,
  );
  const messages = [
    ...new Set([
      ...textMessages(error.message),
      ...(typeof error.error === 'string' ? textMessages(error.error) : []),
    ]),
  ];
  const safeMessages = status >= 500 ? [] : messages;
  const primaryMessage = safeMessages.find(
    (message) => !isGenericMessage(message),
  );
  const issueSummary = uniqueIssues
    .map((issue) =>
      uniqueIssues.length > 1 && issue.field
        ? `${issue.field}: ${issue.message}`
        : issue.message,
    )
    .join(' ');
  const message = issueSummary || primaryMessage || fallbackMessage(status);
  return new ApiError(message, status, uniqueIssues, payload);
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const body = await response.text().catch(() => '');
  if (!body) return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    // A proxy/server may send HTML or plain text. Do not expose it to users.
    return undefined;
  }
}

async function performRequest(
  path: string,
  init: RequestInit,
  token?: string,
): Promise<Response> {
  if (!apiBaseUrl) {
    throw new ApiError(
      'SingleRent API deployment has not been configured yet.',
      503,
    );
  }
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  try {
    return await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  } catch (cause: unknown) {
    if (cause instanceof ApiError) throw cause;
    throw new ApiError(fallbackMessage(0), 0, [], undefined);
  }
}

/** Returns the safe primary error text for alerts, banners and toasts. */
export function apiErrorMessage(
  cause: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (cause instanceof ApiError) return cause.message || fallback;
  return fallback;
}

/**
 * Maps normalized backend validation paths to the controls used by a form.
 * Alias values are useful when a UI calls a field `annualRent` and the API
 * calls it `annualRentKobo`.
 */
export function apiFieldErrors(
  cause: unknown,
  aliases: Record<string, string> = {},
): ApiFieldErrors {
  if (!(cause instanceof ApiError)) return {};
  return cause.issues.reduce<ApiFieldErrors>((result, issue) => {
    if (!issue.field) return result;
    const rootField = issue.field.split('.')[0];
    const field = aliases[issue.field] ?? aliases[rootField] ?? issue.field;
    result[field] = [...(result[field] ?? []), issue.message];
    return result;
  }, {});
}

/** A form-level error that never repeats field messages already shown inline. */
export function apiFormError(
  cause: unknown,
  fieldErrors: ApiFieldErrors,
  fallback: string,
): string {
  const message = apiErrorMessage(cause, fallback);
  return Object.keys(fieldErrors).length > 0
    ? 'Please correct the highlighted fields and try again.'
    : message;
}

async function refreshSession(): Promise<ApiSession> {
  if (refreshPromise) return refreshPromise;

  const currentSession = sessionStore.get();
  if (!currentSession?.refreshToken) {
    sessionStore.clear();
    throw new ApiError('Your session has expired. Please sign in again.', 401);
  }

  refreshPromise = (async () => {
    try {
      const response = await performRequest('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: currentSession.refreshToken }),
      });
      const payload = await readPayload(response);
      if (!response.ok) throw normalizeApiError(payload, response.status);

      const nextSession = payload as ApiSession;
      if (
        !nextSession?.accessToken ||
        !nextSession?.refreshToken ||
        !nextSession?.user?.id
      ) {
        throw new ApiError(
          'The server returned an invalid session. Please sign in again.',
          401,
        );
      }
      sessionStore.set(nextSession);
      return nextSession;
    } catch (cause: unknown) {
      sessionStore.clear();
      if (cause instanceof ApiError) throw cause;
      throw new ApiError(
        'Your session could not be renewed. Please sign in again.',
        401,
      );
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
  options: RequestOptions = {},
): Promise<T> {
  if (!apiBaseUrl) {
    throw new ApiError(
      'SingleRent API deployment has not been configured yet.',
      503,
    );
  }
  const response = await performRequest(path, init, token);
  const payload = await readPayload(response);
  if (!response.ok) {
    if (
      response.status === 401 &&
      token &&
      options.retryOnUnauthorized !== false
    ) {
      const storedSession = sessionStore.get();
      const session =
        storedSession?.accessToken && storedSession.accessToken !== token
          ? storedSession
          : await refreshSession();
      const retryResponse = await performRequest(
        path,
        init,
        session.accessToken,
      );
      const retryPayload = await readPayload(retryResponse);
      if (!retryResponse.ok)
        throw normalizeApiError(retryPayload, retryResponse.status);
      return retryPayload as T;
    }
    throw normalizeApiError(payload, response.status);
  }
  return payload as T;
}

async function downloadPdf(path: string, token: string): Promise<Blob> {
  const response = await performRequest(
    path,
    { headers: { accept: 'application/pdf' } },
    token,
  );
  if (!response.ok) {
    const payload = await readPayload(response);
    throw normalizeApiError(payload, response.status);
  }
  return response.blob();
}

function queryString(query: ListingQuery = {}): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const value = params.toString();
  return value ? `?${value}` : '';
}

function queryStringFor(
  query: Record<string, string | number | boolean | undefined>,
): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const value = params.toString();
  return value ? `?${value}` : '';
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
    if (typeof window !== 'undefined')
      window.sessionStorage.setItem(sessionStorageKey, JSON.stringify(session));
    notifySessionListeners(session);
  },
  clear(): void {
    if (typeof window !== 'undefined')
      window.sessionStorage.removeItem(sessionStorageKey);
    notifySessionListeners(null);
  },
  subscribe(listener: SessionListener): () => void {
    sessionListeners.add(listener);
    return () => sessionListeners.delete(listener);
  },
};

export type RegistrationDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  dateOfBirth?: string;
};

export const registrationDraftStore = {
  get(): RegistrationDraft | null {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(registrationDraftKey);
    return raw ? (JSON.parse(raw) as RegistrationDraft) : null;
  },
  set(draft: RegistrationDraft): void {
    if (typeof window !== 'undefined')
      window.sessionStorage.setItem(
        registrationDraftKey,
        JSON.stringify(draft),
      );
  },
  clear(): void {
    if (typeof window !== 'undefined')
      window.sessionStorage.removeItem(registrationDraftKey);
  },
};

export const api = {
  auth: {
    login(input: { identifier: string; password: string }): Promise<ApiSession> {
      return request<ApiSession>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    google(input: {
      idToken: string;
      phone?: string;
      role: 'TENANT' | 'LANDLORD' | 'AGENT';
      dateOfBirth?: string;
    }): Promise<ApiSession> {
      return request<ApiSession>('/auth/google', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    register(
      input: RegistrationDraft & { role: 'TENANT' | 'LANDLORD' | 'AGENT' },
    ): Promise<ApiSession> {
      return request<ApiSession>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    confirmPhoneVerification(
      token: string,
      challengeId: string,
      code: string,
    ): Promise<{ verified: true }> {
      return request<{ verified: true }>(
        '/auth/phone-verification/confirm',
        { method: 'POST', body: JSON.stringify({ challengeId, code }) },
        token,
      );
    },
    issuePhoneVerification(
      token: string,
      phone?: string,
    ): Promise<{ id: string; expiresAt: string; developmentCode?: string }> {
      return request<{
        id: string;
        expiresAt: string;
        developmentCode?: string;
      }>('/auth/phone-verification', { method: 'POST', body: JSON.stringify(phone ? { phone } : {}) }, token);
    },
    me(token: string): Promise<ApiSession['user']> {
      return request<ApiSession['user']>('/auth/me', {}, token);
    },
    logout(token: string, refreshToken: string): Promise<void> {
      return request<void>(
        '/auth/logout',
        { method: 'POST', body: JSON.stringify({ refreshToken }) },
        token,
        { retryOnUnauthorized: false },
      );
    },
    requestPasswordReset(
      phone: string,
    ): Promise<{
      requested: true;
      challengeId?: string;
      developmentCode?: string;
    }> {
      return request('/auth/password-reset/request', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });
    },
    confirmPasswordReset(input: {
      phone: string;
      challengeId: string;
      code: string;
      password: string;
      confirmPassword: string;
    }): Promise<{ reset: true }> {
      return request('/auth/password-reset/confirm', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    deactivate(
      token: string,
      input: { confirmation: 'DEACTIVATE'; currentPassword?: string },
    ): Promise<void> {
      return request<void>(
        '/auth/me/deactivate',
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
  },
  dashboard: {
    get(token: string): Promise<ApiDashboard> {
      return request<ApiDashboard>('/dashboard', {}, token);
    },
  },
  listings: {
    search(query?: ListingQuery): Promise<PaginatedResponse<ApiListing>> {
      return request<PaginatedResponse<ApiListing>>(
        `/listings${queryString(query)}`,
      );
    },
    mine(
      token: string,
      query?: ListingQuery,
    ): Promise<PaginatedResponse<ApiListing>> {
      return request<PaginatedResponse<ApiListing>>(
        `/listings/mine${queryString(query)}`,
        {},
        token,
      );
    },
    managedDetail(token: string, idOrSlug: string): Promise<ApiListing> {
      return request<ApiListing>(
        `/listings/mine/${encodeURIComponent(idOrSlug)}`,
        {},
        token,
      );
    },
    saved(
      token: string,
      query?: ListingQuery,
    ): Promise<PaginatedResponse<ApiListing>> {
      return request<PaginatedResponse<ApiListing>>(
        `/listings/saved${queryString(query)}`,
        {},
        token,
      );
    },
    savedState(token: string, idOrSlug: string): Promise<{ saved: boolean }> {
      return request<{ saved: boolean }>(
        `/listings/${encodeURIComponent(idOrSlug)}/saved-state`,
        {},
        token,
      );
    },
    detail(idOrSlug: string, token?: string): Promise<ApiListing> {
      const id = encodeURIComponent(idOrSlug);
      return token
        ? request<ApiListing>(`/listings/${id}/access`, {}, token)
        : request<ApiListing>(`/listings/${id}`);
    },
    pricing(idOrSlug: string, token?: string): Promise<ApiRentalPricing> {
      const id = encodeURIComponent(idOrSlug);
      return token
        ? request<ApiRentalPricing>(`/listings/${id}/access/pricing`, {}, token)
        : request<ApiRentalPricing>(`/listings/${id}/pricing`);
    },
    create(token: string, input: CreateListingInput): Promise<ApiListing> {
      return request<ApiListing>(
        '/listings',
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    update(
      token: string,
      listingId: string,
      input: Partial<CreateListingInput>,
    ): Promise<ApiListing> {
      return request<ApiListing>(
        `/listings/${encodeURIComponent(listingId)}`,
        { method: 'PATCH', body: JSON.stringify(input) },
        token,
      );
    },
    publish(token: string, listingId: string): Promise<ApiListing> {
      return request<ApiListing>(
        `/listings/${encodeURIComponent(listingId)}/publish`,
        { method: 'POST' },
        token,
      );
    },
    submit(token: string, listingId: string): Promise<ApiListing> {
      return request<ApiListing>(
        `/listings/${encodeURIComponent(listingId)}/submit`,
        { method: 'POST' },
        token,
      );
    },
    removeMedia(
      token: string,
      listingId: string,
      mediaId: string,
    ): Promise<void> {
      return request<void>(
        `/listings/${encodeURIComponent(listingId)}/media/${encodeURIComponent(mediaId)}`,
        { method: 'DELETE' },
        token,
      );
    },
    save(token: string, listingId: string): Promise<void> {
      return request<void>(
        `/listings/${listingId}/save`,
        { method: 'POST' },
        token,
      );
    },
    unsave(token: string, listingId: string): Promise<void> {
      return request<void>(
        `/listings/${listingId}/save`,
        { method: 'DELETE' },
        token,
      );
    },
  },
  media: {
    createPresignedUpload(
      token: string,
      input: {
        kind:
          | 'listing'
          | 'maintenance'
          | 'profile'
          | 'incident'
          | 'agreement'
          | 'move_in'
          | 'guarantor';
        mediaType: ListingMediaType | 'DOCUMENT';
        mimeType: string;
        size: number;
        listingId?: string;
        tenancyId?: string;
      },
    ): Promise<PresignedMediaUpload> {
      return request<PresignedMediaUpload>(
        '/media/uploads/presign',
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    deleteUnassociatedUpload(token: string, objectKey: string): Promise<void> {
      return request<void>(
        '/media/uploads',
        { method: 'DELETE', body: JSON.stringify({ objectKey }) },
        token,
      );
    },
  },
  documents: {
    agreement(token: string, tenancyId: string): Promise<ApiAgreement> {
      return request<ApiAgreement>(
        `/tenancies/${encodeURIComponent(tenancyId)}/agreement`,
        {},
        token,
      );
    },
    signAgreement(
      token: string,
      tenancyId: string,
      signerName: string,
    ): Promise<ApiAgreement> {
      return request<ApiAgreement>(
        `/tenancies/${encodeURIComponent(tenancyId)}/agreement/signatures`,
        {
          method: 'POST',
          body: JSON.stringify({ signerName, acceptTerms: true }),
        },
        token,
      );
    },
    attachSignedCopy(
      token: string,
      tenancyId: string,
      input: { signerName: string; objectKey: string },
    ): Promise<ApiAgreement> {
      return request<ApiAgreement>(
        `/tenancies/${encodeURIComponent(tenancyId)}/agreement/signed-copy`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    signedCopies(
      token: string,
      tenancyId: string,
    ): Promise<{
      copies: Array<{
        signerName: string;
        signerRole: string;
        signedAt: string;
        downloadUrl: string;
        expiresAt: string;
      }>;
    }> {
      return request(
        `/tenancies/${encodeURIComponent(tenancyId)}/agreement/signed-copies`,
        {},
        token,
      );
    },
    agreementPdf(token: string, tenancyId: string): Promise<Blob> {
      return downloadPdf(
        `/tenancies/${encodeURIComponent(tenancyId)}/agreement/pdf`,
        token,
      );
    },
    guarantorForm(token: string, tenancyId: string): Promise<ApiGuarantorForm | null> {
      return request<ApiGuarantorForm | null>(
        `/tenancies/${encodeURIComponent(tenancyId)}/guarantor-form`,
        {},
        token,
      );
    },
    saveGuarantorForm(
      token: string,
      tenancyId: string,
      input: {
        guarantorName: string;
        knownForYears: number;
        homeAddress: string;
        businessAddress: string;
        telephone: string;
        profession: string;
        qualification: string;
        passportObjectKey?: string;
      },
    ): Promise<ApiGuarantorForm> {
      return request<ApiGuarantorForm>(
        `/tenancies/${encodeURIComponent(tenancyId)}/guarantor-form`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    guarantorFormPdf(token: string, tenancyId: string): Promise<Blob> {
      return downloadPdf(
        `/tenancies/${encodeURIComponent(tenancyId)}/guarantor-form/pdf`,
        token,
      );
    },
    signGuarantorForm(
      token: string,
      tenancyId: string,
      signerName: string,
    ): Promise<ApiGuarantorForm> {
      return request<ApiGuarantorForm>(
        `/tenancies/${encodeURIComponent(tenancyId)}/guarantor-form/signature`,
        { method: 'POST', body: JSON.stringify({ signerName, acceptTerms: true }) },
        token,
      );
    },
    attachGuarantorSignedCopy(
      token: string,
      tenancyId: string,
      input: { signerName: string; objectKey: string },
    ): Promise<ApiGuarantorForm> {
      return request<ApiGuarantorForm>(
        `/tenancies/${encodeURIComponent(tenancyId)}/guarantor-form/signed-copy`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    receipts(token: string): Promise<ApiReceipt[]> {
      return request<ApiReceipt[]>('/receipts', {}, token);
    },
    receiptPdf(token: string, receiptId: string): Promise<Blob> {
      return downloadPdf(
        `/receipts/${encodeURIComponent(receiptId)}/pdf`,
        token,
      );
    },
  },
  moveIn: {
    get(token: string, tenancyId: string): Promise<ApiMoveIn> {
      return request(
        `/tenancies/${encodeURIComponent(tenancyId)}/move-in`,
        {},
        token,
      );
    },
    handover(token: string, tenancyId: string): Promise<ApiMoveIn> {
      return request(
        `/tenancies/${encodeURIComponent(tenancyId)}/move-in/handover`,
        { method: 'POST' },
        token,
      );
    },
    draft(
      token: string,
      tenancyId: string,
      answers: MoveInAnswer[],
    ): Promise<ApiMoveIn> {
      return request(
        `/tenancies/${encodeURIComponent(tenancyId)}/move-in/draft`,
        { method: 'PUT', body: JSON.stringify({ answers }) },
        token,
      );
    },
    submit(
      token: string,
      tenancyId: string,
      answers: MoveInAnswer[],
    ): Promise<ApiMoveIn> {
      return request(
        `/tenancies/${encodeURIComponent(tenancyId)}/move-in/submit`,
        { method: 'POST', body: JSON.stringify({ answers }) },
        token,
      );
    },
    reportIssue(
      token: string,
      tenancyId: string,
      item: string,
      issueType: string,
      description: string,
    ): Promise<ApiMoveIn> {
      return request(
        `/tenancies/${encodeURIComponent(tenancyId)}/move-in/issues`,
        {
          method: 'POST',
          body: JSON.stringify({ item, issueType, description }),
        },
        token,
      );
    },
    issueAction(
      token: string,
      tenancyId: string,
      issueId: string,
      action: string,
      note: string,
    ): Promise<ApiMoveIn> {
      return request(
        `/tenancies/${encodeURIComponent(tenancyId)}/move-in/issues/${encodeURIComponent(issueId)}/actions`,
        { method: 'POST', body: JSON.stringify({ action, note }) },
        token,
      );
    },
    refund(
      token: string,
      tenancyId: string,
      reason: string,
    ): Promise<ApiMoveIn> {
      return request(
        `/tenancies/${encodeURIComponent(tenancyId)}/move-in/refund-request`,
        { method: 'POST', body: JSON.stringify({ reason }) },
        token,
      );
    },
    attachEvidence(
      token: string,
      tenancyId: string,
      objectKey: string,
      issueId?: string,
    ): Promise<ApiMoveIn> {
      return request(
        `/tenancies/${encodeURIComponent(tenancyId)}/move-in/evidence`,
        { method: 'POST', body: JSON.stringify({ objectKey, issueId }) },
        token,
      );
    },
    evidence(
      token: string,
      tenancyId: string,
      evidenceId: string,
    ): Promise<{ downloadUrl: string }> {
      return request(
        `/tenancies/${encodeURIComponent(tenancyId)}/move-in/evidence/${encodeURIComponent(evidenceId)}`,
        {},
        token,
      );
    },
    adminList(
      token: string,
    ): Promise<
      Array<
        ApiMoveIn & {
          tenancy: {
            listing: { title: string };
            tenant: { firstName: string; lastName: string };
          };
        }
      >
    > {
      return request('/admin/move-in', {}, token);
    },
    adminResolve(
      token: string,
      tenancyId: string,
      issueId: string,
      reason: string,
    ): Promise<void> {
      return request(
        `/admin/move-in/${encodeURIComponent(tenancyId)}/issues/${encodeURIComponent(issueId)}/resolve`,
        { method: 'POST', body: JSON.stringify({ reason }) },
        token,
      );
    },
    adminReclassify(
      token: string,
      tenancyId: string,
      issueId: string,
      severity: string,
      reason: string,
    ): Promise<void> {
      return request(
        `/admin/move-in/${encodeURIComponent(tenancyId)}/issues/${encodeURIComponent(issueId)}/reclassify`,
        { method: 'POST', body: JSON.stringify({ severity, reason }) },
        token,
      );
    },
    adminReject(
      token: string,
      tenancyId: string,
      requestId: string,
      reason: string,
    ): Promise<void> {
      return request(
        `/admin/move-in/${encodeURIComponent(tenancyId)}/refunds/${encodeURIComponent(requestId)}/reject`,
        { method: 'POST', body: JSON.stringify({ reason }) },
        token,
      );
    },
    adminApprove(
      token: string,
      paymentId: string,
      requestId: string,
      reason: string,
      outcome: 'VALID_PROPERTY_FAILURE' | 'TENANT_CHANGED_MIND',
    ): Promise<void> {
      return request(
        `/admin/transactions/${encodeURIComponent(paymentId)}/move-in-refunds/${encodeURIComponent(requestId)}/approve`,
        { method: 'POST', body: JSON.stringify({ reason, outcome }) },
        token,
      );
    },
    adminEvidence(
      token: string,
      tenancyId: string,
      evidenceId: string,
    ): Promise<{ downloadUrl: string }> {
      return request(
        `/admin/move-in/${encodeURIComponent(tenancyId)}/evidence/${encodeURIComponent(evidenceId)}`,
        {},
        token,
      );
    },
  },
  maintenance: {
    list(
      token: string,
      listingId?: string,
    ): Promise<PaginatedResponse<ApiMaintenanceRequest>> {
      const query = listingId
        ? `?listingId=${encodeURIComponent(listingId)}`
        : '';
      return request<PaginatedResponse<ApiMaintenanceRequest>>(
        `/maintenance${query}`,
        {},
        token,
      );
    },
    update(
      token: string,
      requestId: string,
      input: { status?: ApiMaintenanceRequest['status']; body?: string },
    ): Promise<ApiMaintenanceRequest> {
      return request<ApiMaintenanceRequest>(
        `/maintenance/${requestId}`,
        { method: 'PATCH', body: JSON.stringify(input) },
        token,
      );
    },
    create(
      token: string,
      input: {
        listingId: string;
        title: string;
        category: ApiMaintenanceCategory;
        description: string;
        priority: ApiMaintenancePriority;
        attachments?: Array<{
          url: string;
          publicId: string;
          format?: string;
          bytes?: number;
        }>;
      },
    ): Promise<ApiMaintenanceRequest> {
      return request<ApiMaintenanceRequest>(
        '/maintenance',
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
  },
  conversations: {
    monitoring(
      token: string,
      query: {
        property?: string;
        tenant?: string;
        contact?: string;
        from?: string;
        to?: string;
        status?: string;
        page?: number;
      },
    ): Promise<{
      items: Array<
        ApiConversation & {
          escalations: Array<{
            id: string;
            contactId: string;
            question: string;
            response: string | null;
            createdAt: string;
            respondedAt: string | null;
          }>;
          messages: ApiMessage[];
        }
      >;
      contacts: Array<{ id: string; firstName: string; lastName: string }>;
      total: number;
      page: number;
    }> {
      return request(
        `/conversations/monitoring${queryStringFor(query)}`,
        {},
        token,
      );
    },
    escalations(
      token: string,
    ): Promise<
      Array<{
        id: string;
        question: string;
        response: string | null;
        createdAt: string;
        respondedAt: string | null;
        conversation: { listing: { id: string; title: string } | null };
      }>
    > {
      return request('/conversations/escalations', {}, token);
    },
    replyToEscalation(
      token: string,
      escalationId: string,
      body: string,
    ): Promise<ApiMessage> {
      return request(
        `/conversations/escalations/${encodeURIComponent(escalationId)}/reply`,
        { method: 'POST', body: JSON.stringify({ body }) },
        token,
      );
    },
    list(
      token: string,
      query: { page?: number; pageSize?: number } = {},
    ): Promise<PaginatedResponse<ApiConversation>> {
      return request<PaginatedResponse<ApiConversation>>(
        `/conversations${queryStringFor(query)}`,
        {},
        token,
      );
    },
    create(
      token: string,
      input: {
        listingId?: string;
        recipientId?: string;
        subject?: string;
        type: ApiConversationType;
        initialMessage?: string;
      },
    ): Promise<ApiConversation> {
      return request<ApiConversation>(
        '/conversations',
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    messages(
      token: string,
      conversationId: string,
      query: { page?: number; pageSize?: number } = {},
    ): Promise<PaginatedResponse<ApiMessage>> {
      return request<PaginatedResponse<ApiMessage>>(
        `/conversations/${encodeURIComponent(conversationId)}/messages${queryStringFor(query)}`,
        {},
        token,
      );
    },
    sendMessage(
      token: string,
      conversationId: string,
      body: string,
    ): Promise<ApiMessage> {
      return request<ApiMessage>(
        `/conversations/${encodeURIComponent(conversationId)}/messages`,
        { method: 'POST', body: JSON.stringify({ body }) },
        token,
      );
    },
    markRead(token: string, conversationId: string): Promise<void> {
      return request<void>(
        `/conversations/${encodeURIComponent(conversationId)}/read`,
        { method: 'PATCH' },
        token,
      );
    },
  },
  applications: {
    create(
      token: string,
      input: CreateApplicationInput,
    ): Promise<ApiRentalApplication> {
      return request<ApiRentalApplication>(
        '/applications',
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    update(
      token: string,
      applicationId: string,
      input: Omit<CreateApplicationInput, 'listingId'>,
    ): Promise<ApiRentalApplication> {
      return request<ApiRentalApplication>(
        `/applications/${encodeURIComponent(applicationId)}`,
        { method: 'PATCH', body: JSON.stringify(input) },
        token,
      );
    },
    mine(
      token: string,
      query: {
        page?: number;
        pageSize?: number;
        status?: ApiApplicationStatus;
      } = {},
    ): Promise<PaginatedResponse<ApiRentalApplication>> {
      return request<PaginatedResponse<ApiRentalApplication>>(
        `/applications/mine${queryStringFor(query)}`,
        {},
        token,
      );
    },
    received(
      token: string,
      query: {
        page?: number;
        pageSize?: number;
        status?: ApiApplicationStatus;
      } = {},
    ): Promise<PaginatedResponse<ApiRentalApplication>> {
      return request<PaginatedResponse<ApiRentalApplication>>(
        `/applications/received${queryStringFor(query)}`,
        {},
        token,
      );
    },
    approve(
      token: string,
      applicationId: string,
    ): Promise<ApiRentalApplication> {
      return request<ApiRentalApplication>(
        `/applications/${encodeURIComponent(applicationId)}/approve`,
        { method: 'POST' },
        token,
      );
    },
    reject(
      token: string,
      applicationId: string,
      reason: string,
    ): Promise<ApiRentalApplication> {
      return request<ApiRentalApplication>(
        `/applications/${encodeURIComponent(applicationId)}/reject`,
        { method: 'POST', body: JSON.stringify({ reason }) },
        token,
      );
    },
    cancel(token: string, applicationId: string): Promise<void> {
      return request<void>(
        `/applications/${encodeURIComponent(applicationId)}/cancel`,
        { method: 'POST' },
        token,
      );
    },
  },
  payments: {
    list(
      token: string,
      query: { page?: number; pageSize?: number } = {},
    ): Promise<PaginatedResponse<ApiPayment>> {
      return request<PaginatedResponse<ApiPayment>>(
        `/payments${queryStringFor(query)}`,
        {},
        token,
      );
    },
    initialize(
      token: string,
      applicationId: string,
      cancellationPolicyAccepted: boolean,
    ): Promise<{
      paymentId: string;
      reference: string;
      pricing: {
        rentAmountKobo: string;
        platformFeeKobo: string;
        agentFeeKobo: string;
        legalFeeKobo: string;
        cautionFeeKobo: string;
        totalAmountKobo: string;
      };
      authorizationUrl: string;
      accessCode: string;
      providerReference: string;
    }> {
      return request(
        '/payments/initialize',
        { method: 'POST', body: JSON.stringify({ applicationId, cancellationPolicyAccepted }) },
        token,
      );
    },
    get(token: string, paymentId: string): Promise<ApiPayment> {
      return request<ApiPayment>(
        `/payments/${encodeURIComponent(paymentId)}`,
        {},
        token,
      );
    },
    verify(token: string, paymentId: string): Promise<ApiPayment> {
      return request<ApiPayment>(
        `/payments/${encodeURIComponent(paymentId)}/verify`,
        { method: 'POST' },
        token,
      );
    },
    authorizeRelease(token: string, paymentId: string): Promise<ApiPayment> {
      return request<ApiPayment>(
        `/payments/${encodeURIComponent(paymentId)}/authorize-release`,
        { method: 'POST' },
        token,
      );
    },
    proposeCautionDeduction(
      token: string,
      paymentId: string,
      input: { amountKobo: string; reason: string; evidence?: string[] },
    ): Promise<ApiCautionDeduction> {
      return request<ApiCautionDeduction>(
        `/payments/${encodeURIComponent(paymentId)}/caution-deductions`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    acceptCautionDeduction(
      token: string,
      paymentId: string,
      deductionId: string,
      note?: string,
    ): Promise<void> {
      return request<void>(
        `/payments/${encodeURIComponent(paymentId)}/caution-deductions/${encodeURIComponent(deductionId)}/accept`,
        { method: 'POST', body: JSON.stringify(note ? { note } : {}) },
        token,
      );
    },
    disputeCautionDeduction(
      token: string,
      paymentId: string,
      deductionId: string,
      note?: string,
    ): Promise<void> {
      return request<void>(
        `/payments/${encodeURIComponent(paymentId)}/caution-deductions/${encodeURIComponent(deductionId)}/dispute`,
        { method: 'POST', body: JSON.stringify(note ? { note } : {}) },
        token,
      );
    },
    returnRemainingCaution(
      token: string,
      paymentId: string,
    ): Promise<ApiPayout> {
      return request<ApiPayout>(
        `/payments/${encodeURIComponent(paymentId)}/caution-return`,
        { method: 'POST' },
        token,
      );
    },
  },
  tenancies: {
    list(
      token: string,
      query: {
        page?: number;
        pageSize?: number;
        status?: ApiTenancy['status'];
      } = {},
    ): Promise<PaginatedResponse<ApiTenancy>> {
      return request<PaginatedResponse<ApiTenancy>>(
        `/tenancies${queryStringFor(query)}`,
        {},
        token,
      );
    },
    activate(token: string, tenancyId: string): Promise<ApiTenancy> {
      return request<ApiTenancy>(
        `/tenancies/${encodeURIComponent(tenancyId)}/activate`,
        { method: 'POST' },
        token,
      );
    },
    complete(token: string, tenancyId: string): Promise<ApiTenancy> {
      return request<ApiTenancy>(
        `/tenancies/${encodeURIComponent(tenancyId)}/complete`,
        { method: 'POST' },
        token,
      );
    },
  },
  payouts: {
    list(token: string): Promise<ApiPayout[]> {
      return request<ApiPayout[]>('/payouts', {}, token);
    },
    withdraw(token: string, payoutId: string): Promise<ApiPayout> {
      return request<ApiPayout>(
        `/payouts/${encodeURIComponent(payoutId)}/withdraw`,
        { method: 'POST', body: JSON.stringify({}) },
        token,
      );
    },
  },
  payoutAccounts: {
    mine(
      token: string,
    ): Promise<{ configured: boolean; account: ApiPayoutAccount | null }> {
      return request<{ configured: boolean; account: ApiPayoutAccount | null }>(
        '/payout-accounts/me',
        {},
        token,
      );
    },
    banks(token: string): Promise<ApiBank[]> {
      return request<ApiBank[]>('/payout-accounts/banks', {}, token);
    },
    save(
      token: string,
      input: { accountNumber: string; bankCode: string },
    ): Promise<{ configured: boolean; account: ApiPayoutAccount }> {
      return request<{ configured: boolean; account: ApiPayoutAccount }>(
        '/payout-accounts/me',
        { method: 'PUT', body: JSON.stringify(input) },
        token,
      );
    },
  },
  users: {
    profile(token: string): Promise<ApiUserProfile> {
      return request<ApiUserProfile>('/users/me/profile', {}, token);
    },
    updateProfile(token: string, input: Record<string, unknown>) {
      return request(
        '/users/me/profile',
        { method: 'PATCH', body: JSON.stringify(input) },
        token,
      );
    },
    sendPhoneVerification(token: string, phone: string) {
      return request<{
        id: string;
        expiresAt: string;
        developmentCode?: string;
      }>(
        '/users/me/phone-verification',
        { method: 'POST', body: JSON.stringify({ phone }) },
        token,
      );
    },
    confirmPhoneVerification(token: string, challengeId: string, code: string) {
      return request(
        '/users/me/phone-verification/confirm',
        { method: 'POST', body: JSON.stringify({ challengeId, code }) },
        token,
      );
    },
    submitNin(token: string, nin: string) {
      return request<NinVerificationResult>(
        '/users/me/kyc/nin',
        { method: 'POST', body: JSON.stringify({ nin }) },
        token,
      );
    },
    getKycStatus(token: string) {
      return request<{
        status: string;
        verified: boolean;
        underReview: boolean;
        identityMethod: PublisherVerificationMethod | null;
        nameMatchReason: string | null;
        latestServiceCharge?: {
          id: string;
          status: string;
          amountKobo: string;
          failureReason: string | null;
        } | null;
      }>('/users/me/kyc', {}, token);
    },
    initializeTransactionalKyc(token: string, identity: { method: PublisherVerificationMethod; identifier: string }) {
      return request<{
        chargeId: string;
        amountKobo: string;
        currency: string;
        reference: string;
        authorizationUrl: string;
        status: string;
      }>(
        '/users/me/kyc/service-charge',
        { method: 'POST', body: JSON.stringify(identity) },
        token,
      );
    },
    verifyTransactionalKycCharge(token: string, chargeId: string) {
      return request<{ status: string; verified: boolean; underReview?: boolean }>(
        `/users/me/kyc/service-charge/${chargeId}/verify`,
        { method: 'POST' },
        token,
      );
    },
    getPublisherVerification(token: string) {
      return request<ApiPublisherVerification>(
        '/users/me/publisher-verification',
        {},
        token,
      );
    },
    startPublisherVerification(
      token: string,
      method: PublisherVerificationMethod,
    ) {
      return request<ApiPublisherVerification>(
        '/users/me/publisher-verification/sessions',
        { method: 'POST', body: JSON.stringify({ method }) },
        token,
      );
    },
    reconcilePublisherVerification(token: string, verificationId: string) {
      return request<ApiPublisherVerification>(
        `/users/me/publisher-verification/sessions/${encodeURIComponent(verificationId)}/reconcile`,
        { method: 'POST' },
        token,
      );
    },
  },
  notifications: {
    devices(
      token: string,
    ): Promise<
      Array<{
        id: string;
        provider: string;
        label: string | null;
        createdAt: string;
        lastSeenAt: string;
      }>
    > {
      return request('/notifications/devices', {}, token);
    },
    get(token: string, id: string): Promise<ApiNotification> {
      return request(`/notifications/${encodeURIComponent(id)}`, {}, token);
    },
    registerDevice(
      token: string,
      pushToken: string,
      label?: string,
    ): Promise<{ id: string }> {
      return request(
        '/notifications/devices',
        { method: 'POST', body: JSON.stringify({ token: pushToken, label }) },
        token,
      );
    },
    registerWebPush(
      token: string,
      subscription: {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      },
      label?: string,
    ): Promise<{ id: string }> {
      return request(
        '/notifications/devices',
        {
          method: 'POST',
          body: JSON.stringify({ provider: 'WEB_PUSH', subscription, label }),
        },
        token,
      );
    },
    removeDevice(token: string, id: string): Promise<void> {
      return request(
        `/notifications/devices/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
        token,
      );
    },
    list(
      token: string,
      query: { page?: number; pageSize?: number; unreadOnly?: boolean } = {},
    ): Promise<PaginatedResponse<ApiNotification>> {
      return request<PaginatedResponse<ApiNotification>>(
        `/notifications${queryStringFor(query)}`,
        {},
        token,
      );
    },
    preferences(token: string): Promise<ApiNotificationPreference[]> {
      return request<ApiNotificationPreference[]>(
        '/notifications/preferences',
        {},
        token,
      );
    },
    updatePreferences(
      token: string,
      preferences: ApiNotificationPreference[],
    ): Promise<ApiNotificationPreference[]> {
      return request<ApiNotificationPreference[]>(
        '/notifications/preferences',
        { method: 'PATCH', body: JSON.stringify({ preferences }) },
        token,
      );
    },
    markRead(token: string, notificationId: string): Promise<void> {
      return request<void>(
        `/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: 'PATCH' },
        token,
      );
    },
    markAllRead(token: string): Promise<void> {
      return request<void>(
        '/notifications/read-all',
        { method: 'POST' },
        token,
      );
    },
  },
  inspections: {
    slots(
      listingId: string,
    ): Promise<{
      timezone: string;
      durationMinutes: number;
      slots: InspectionSlot[];
    }> {
      return request(
        `/inspections/listings/${encodeURIComponent(listingId)}/slots`,
      );
    },
    availability(
      token: string,
      listingId: string,
    ): Promise<InspectionAvailability> {
      return request(
        `/inspections/listings/${encodeURIComponent(listingId)}/availability`,
        {},
        token,
      );
    },
    saveAvailability(
      token: string,
      listingId: string,
      input: InspectionAvailability,
    ): Promise<InspectionAvailability> {
      return request(
        `/inspections/listings/${encodeURIComponent(listingId)}/availability`,
        { method: 'PUT', body: JSON.stringify(input) },
        token,
      );
    },
    book(
      token: string,
      listingId: string,
      startsAt: string,
      source: 'SLOT' | 'REQUEST',
    ): Promise<InspectionBooking> {
      return request(
        `/inspections/listings/${encodeURIComponent(listingId)}/bookings`,
        { method: 'POST', body: JSON.stringify({ startsAt, source }) },
        token,
      );
    },
    list(token: string): Promise<InspectionBooking[]> {
      return request('/inspections', {}, token);
    },
    action(
      token: string,
      bookingId: string,
      action:
        | 'approve'
        | 'decline'
        | 'cancel'
        | 'complete'
        | 'confirm-attendance'
        | 'dispute-attendance'
        | 'propose'
        | 'accept-proposal'
        | 'reject-proposal',
      startsAt?: string,
    ): Promise<InspectionBooking> {
      return request(
        `/inspections/${encodeURIComponent(bookingId)}/${action}`,
        { method: 'POST', body: JSON.stringify(startsAt ? { startsAt } : {}) },
        token,
      );
    },
  },
  reviews: {
    publicList(
      query: {
        page?: number;
        pageSize?: number;
        listingId?: string;
        targetUserId?: string;
        targetType?: Exclude<ApiReview['targetType'], 'TENANT'>;
      },
    ): Promise<PaginatedResponse<ApiReview>> {
      return request<PaginatedResponse<ApiReview>>(
        `/reviews${queryStringFor(query)}`,
      );
    },
    mine(
      token: string,
      query: {
        page?: number;
        pageSize?: number;
        status?: ApiReview['status'];
      } = {},
    ): Promise<PaginatedResponse<ApiReview>> {
      return request<PaginatedResponse<ApiReview>>(
        `/reviews/mine${queryStringFor(query)}`,
        {},
        token,
      );
    },
    opportunities(
      token: string,
      query: { page?: number; pageSize?: number } = {},
    ): Promise<PaginatedResponse<ApiReviewOpportunity>> {
      return request<PaginatedResponse<ApiReviewOpportunity>>(
        `/reviews/opportunities${queryStringFor(query)}`,
        {},
        token,
      );
    },
    received(
      token: string,
      query: {
        page?: number;
        pageSize?: number;
        status?: ApiReview['status'];
      } = {},
    ): Promise<PaginatedResponse<ApiReview>> {
      return request<PaginatedResponse<ApiReview>>(
        `/reviews/received${queryStringFor(query)}`,
        {},
        token,
      );
    },
    inspectionOpportunities(
      token: string,
    ): Promise<
      Array<{ inspectionId: string; targets: ApiReview['targetType'][] }>
    > {
      return request('/reviews/inspection-opportunities', {}, token);
    },
    tenantRecord(
      token: string,
      applicationId: string,
      query: {
        source: 'TENANCY' | 'INSPECTION';
        page?: number;
        pageSize?: number;
      },
    ): Promise<ApiTenantReviewRecord> {
      return request<ApiTenantReviewRecord>(
        `/reviews/tenant-record/${encodeURIComponent(applicationId)}${queryStringFor(query)}`,
        {},
        token,
      );
    },
    create(
      token: string,
      input: {
        tenancyId?: string;
        inspectionId?: string;
        targetType: ApiReview['targetType'];
        score: number;
        body: string;
        ratingDimensions?: ApiReview['ratingDimensions'];
      },
    ): Promise<ApiReview> {
      return request<ApiReview>(
        '/reviews',
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    summary(query: {
      listingId?: string;
      targetUserId?: string;
      targetType?: Exclude<ApiReview['targetType'], 'TENANT'>;
    }): Promise<{
      count: number;
      averageScore: number | null;
      dimensions: Record<string, { average: number; count: number }>;
    }> {
      return request(`/reviews/summary${queryStringFor(query)}`);
    },
    admin(
      token: string,
      query: {
        page?: number;
        pageSize?: number;
        status?: ApiReview['status'];
      } = {},
    ): Promise<PaginatedResponse<ApiReview>> {
      return request<PaginatedResponse<ApiReview>>(
        `/reviews/admin${queryStringFor(query)}`,
        {},
        token,
      );
    },
    moderate(
      token: string,
      reviewId: string,
      input: { status: 'PUBLISHED' | 'HIDDEN' | 'REMOVED'; note: string },
    ): Promise<ApiReview> {
      return request<ApiReview>(
        `/reviews/${encodeURIComponent(reviewId)}/moderation`,
        { method: 'PATCH', body: JSON.stringify(input) },
        token,
      );
    },
    dispute(
      token: string,
      reviewId: string,
      reason: string,
    ): Promise<ApiReview> {
      return request<ApiReview>(
        `/reviews/${encodeURIComponent(reviewId)}/dispute`,
        { method: 'POST', body: JSON.stringify({ reason }) },
        token,
      );
    },
  },
  reports: {
    mine(
      token: string,
      query: {
        page?: number;
        pageSize?: number;
        status?: ApiIncidentStatus;
      } = {},
    ): Promise<PaginatedResponse<ApiIncident>> {
      return request<PaginatedResponse<ApiIncident>>(
        `/reports/mine${queryStringFor(query)}`,
        {},
        token,
      );
    },
    create(
      token: string,
      input: {
        listingId?: string;
        type: ApiIncidentType;
        severity: ApiIncidentSeverity;
        description: string;
        occurredAt?: string;
        confidential: boolean;
        evidence?: Array<{
          url: string;
          publicId: string;
          format?: string;
          bytes?: number;
        }>;
      },
    ): Promise<ApiIncident> {
      return request<ApiIncident>(
        '/reports',
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    admin(
      token: string,
      query: {
        page?: number;
        pageSize?: number;
        status?: ApiIncidentStatus;
      } = {},
    ): Promise<PaginatedResponse<ApiIncident>> {
      return request<PaginatedResponse<ApiIncident>>(
        `/reports/admin${queryStringFor(query)}`,
        {},
        token,
      );
    },
    investigate(
      token: string,
      incidentId: string,
      input: { assignedToUserId?: string; note?: string } = {},
    ): Promise<ApiIncident> {
      return request<ApiIncident>(
        `/reports/${encodeURIComponent(incidentId)}/investigate`,
        { method: 'PATCH', body: JSON.stringify(input) },
        token,
      );
    },
    resolve(
      token: string,
      incidentId: string,
      input: { resolutionNote: string; close?: boolean },
    ): Promise<ApiIncident> {
      return request<ApiIncident>(
        `/reports/${encodeURIComponent(incidentId)}/resolve`,
        { method: 'PATCH', body: JSON.stringify(input) },
        token,
      );
    },
  },
  admin: {
    acceptInvitation(input: {
      token: string;
      firstName: string;
      lastName: string;
      password: string;
      confirmPassword: string;
    }): Promise<{ id: string; email: string; role: 'ADMIN' | 'SUPER_ADMIN' }> {
      return request<{ id: string; email: string; role: 'ADMIN' | 'SUPER_ADMIN' }>(
        '/admin/invitations/accept',
        { method: 'POST', body: JSON.stringify(input) },
      );
    },
    notificationActivity(
      token: string,
    ): Promise<{
      enabled: boolean;
      activeDevices: number;
      attempts: number;
      accepted: number;
      failed: number;
      invalid: number;
    }> {
      return request('/admin/notification-activity', {}, token);
    },
    users(
      token: string,
      query: {
        page?: number;
        pageSize?: number;
        role?: ApiRole;
        status?: ApiAdminUser['status'];
        search?: string;
      } = {},
    ): Promise<PaginatedResponse<ApiAdminUser>> {
      return request<PaginatedResponse<ApiAdminUser>>(
        `/admin/users${queryStringFor(query)}`,
        {},
        token,
      );
    },
    kyc(
      token: string,
      query: { page?: number; pageSize?: number } = {},
    ): Promise<PaginatedResponse<ApiAdminUser>> {
      return request<PaginatedResponse<ApiAdminUser>>(
        `/admin/kyc${queryStringFor(query)}`,
        {},
        token,
      );
    },
    listings(
      token: string,
      query: AdminListingQuery = {},
    ): Promise<PaginatedResponse<ApiListing>> {
      return request<PaginatedResponse<ApiListing>>(
        `/admin/listings${queryStringFor(query)}`,
        {},
        token,
      );
    },
    transactions(
      token: string,
      query: {
        page?: number;
        pageSize?: number;
        status?: ApiPayment['status'];
        search?: string;
      } = {},
    ): Promise<PaginatedResponse<ApiAdminTransaction>> {
      return request<PaginatedResponse<ApiAdminTransaction>>(
        `/admin/transactions${queryStringFor(query)}`,
        {},
        token,
      );
    },
    maintenance(
      token: string,
      query: {
        page?: number;
        pageSize?: number;
        status?: ApiMaintenanceRequest['status'];
        priority?: ApiMaintenanceRequest['priority'];
        search?: string;
        attention?: 'URGENT' | 'OVERDUE' | 'ESCALATED' | 'UNASSIGNED';
      } = {},
    ): Promise<PaginatedResponse<ApiMaintenanceRequest>> {
      return request<PaginatedResponse<ApiMaintenanceRequest>>(
        `/admin/maintenance${queryStringFor(query)}`,
        {},
        token,
      );
    },
    maintenanceCase(token: string, requestId: string): Promise<ApiAdminMaintenanceCase> {
      return request<ApiAdminMaintenanceCase>(
        `/admin/maintenance/${encodeURIComponent(requestId)}`,
        {},
        token,
      );
    },
    maintenanceOperators(token: string): Promise<ApiMaintenanceOperator[]> {
      return request<ApiMaintenanceOperator[]>('/admin/maintenance/operators', {}, token);
    },
    assignMaintenanceOwner(token: string, requestId: string, ownerId: string | null): Promise<ApiMaintenanceRequest> {
      return request<ApiMaintenanceRequest>(
        `/admin/maintenance/${encodeURIComponent(requestId)}/owner`,
        { method: 'PATCH', body: JSON.stringify({ ownerId }) },
        token,
      );
    },
    addMaintenanceNote(token: string, requestId: string, note: string): Promise<ApiAdminMaintenanceCase> {
      return request<ApiAdminMaintenanceCase>(
        `/admin/maintenance/${encodeURIComponent(requestId)}/notes`,
        { method: 'POST', body: JSON.stringify({ note }) },
        token,
      );
    },
    escalateMaintenance(
      token: string,
      requestId: string,
      input: { reason: string; responseDueAt?: string },
    ): Promise<ApiMaintenanceRequest> {
      return request<ApiMaintenanceRequest>(
        `/admin/maintenance/${encodeURIComponent(requestId)}/escalate`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    contactMaintenanceParticipant(
      token: string,
      requestId: string,
      input: { recipient: 'TENANT' | 'LANDLORD' | 'AGENT'; message: string },
    ): Promise<{ conversationId: string }> {
      return request<{ conversationId: string }>(
        `/admin/maintenance/${encodeURIComponent(requestId)}/contact`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    correctMaintenanceStatus(
      token: string,
      requestId: string,
      input: { status: ApiMaintenanceRequest['status']; reason: string },
    ): Promise<ApiMaintenanceRequest> {
      return request<ApiMaintenanceRequest>(
        `/admin/maintenance/${encodeURIComponent(requestId)}/status`,
        { method: 'PATCH', body: JSON.stringify(input) },
        token,
      );
    },
    systemStates(token: string): Promise<ApiSystemStates> {
      return request<ApiSystemStates>('/admin/system-states', {}, token);
    },
    reviewKyc(token: string, userId: string, input: { approved: boolean; reviewNote: string }): Promise<ApiAdminUser['kyc']> {
      return request<ApiAdminUser['kyc']>(
        `/admin/kyc/${encodeURIComponent(userId)}/review`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    reviewPublisherVerification(token: string, userId: string, input: { approved: boolean; reviewNote: string }): Promise<ApiAdminUser['publisherVerification']> {
      return request<ApiAdminUser['publisherVerification']>(
        `/admin/publisher-verifications/${encodeURIComponent(userId)}/review`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    refund(
      token: string,
      paymentId: string,
      input: { scope: 'RENT' | 'CAUTION'; amountKobo: string; reason: string },
    ): Promise<ApiPayout> {
      return request<ApiPayout>(
        `/admin/transactions/${encodeURIComponent(paymentId)}/refunds`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    authorizeEscrowRelease(
      token: string,
      paymentId: string,
    ): Promise<ApiAdminTransaction> {
      return request<ApiAdminTransaction>(
        `/admin/transactions/${encodeURIComponent(paymentId)}/release`,
        { method: 'POST' },
        token,
      );
    },
    resolveCautionDispute(
      token: string,
      paymentId: string,
      deductionId: string,
      input: { outcome: 'RETURN_TO_TENANT' | 'PAY_LANDLORD'; note: string },
    ): Promise<ApiPayout> {
      return request<ApiPayout>(
        `/admin/transactions/${encodeURIComponent(paymentId)}/caution-deductions/${encodeURIComponent(deductionId)}/resolve`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    moderateListing(
      token: string,
      listingId: string,
      action: 'approve' | 'reject' | 'suspend',
      note?: string,
    ): Promise<ApiListing> {
      return request<ApiListing>(
        `/admin/listings/${encodeURIComponent(listingId)}/${action}`,
        { method: 'POST', body: JSON.stringify(note ? { note } : {}) },
        token,
      );
    },
    createInvitation(
      token: string,
      input: {
        email: string;
        role: 'ADMIN' | 'SUPER_ADMIN';
        adminTitle?: string;
      },
    ): Promise<{
      id: string;
      email: string;
      role: ApiRole;
      adminTitle: string | null;
      expiresAt: string;
    }> {
      return request<{
        id: string;
        email: string;
        role: ApiRole;
        adminTitle: string | null;
        expiresAt: string;
      }>(
        `/admin/invitations`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    updateUserStatus(
      token: string,
      userId: string,
      status: ApiAdminUser['status'],
    ): Promise<ApiAdminUser> {
      return request<ApiAdminUser>(
        `/admin/users/${encodeURIComponent(userId)}/status`,
        { method: 'PATCH', body: JSON.stringify({ status }) },
        token,
      );
    },
    assignRole(
      token: string,
      userId: string,
      role: 'ADMIN' | 'SUPER_ADMIN',
    ): Promise<void> {
      return request<void>(
        `/admin/users/${encodeURIComponent(userId)}/roles`,
        { method: 'POST', body: JSON.stringify({ role }) },
        token,
      );
    },
    updatePermissions(
      token: string,
      userId: string,
      permissions: { key: AdminPermissionKey; effect: PermissionEffect }[],
    ): Promise<void> {
      return request<void>(
        `/admin/users/${encodeURIComponent(userId)}/permissions`,
        { method: 'PATCH', body: JSON.stringify({ permissions }) },
        token,
      );
    },
    auditLogs(
      token: string,
      query: { page?: number; pageSize?: number } = {},
    ): Promise<ApiAuditLog[]> {
      return request<ApiAuditLog[]>(
        `/admin/audit-logs${queryStringFor(query)}`,
        {},
        token,
      );
    },
  },
};
