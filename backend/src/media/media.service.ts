import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { ListingMediaType, RoleCode } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import {
  CreatePresignedUploadRequest,
  RequestedMediaType,
  UploadKind,
} from './dto/media.schemas';

const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const videoMimeTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const agreementMimeTypes = new Set(['application/pdf']);
const imageMaximumBytes = 5 * 1024 * 1024;
const videoMaximumBytes = 50 * 1024 * 1024;
const agreementMaximumBytes = 10 * 1024 * 1024;
const uploadExpirySeconds = 10 * 60;

type ListingMediaInput = {
  objectKey: string;
  mediaType: ListingMediaType;
  altText?: string;
  position?: number;
};

type PreparedListingMedia = {
  objectKey: string;
  url: string;
  mediaType: ListingMediaType;
  altText?: string;
  mimeType: string;
  bytes: number;
  position: number;
};

@Injectable()
export class MediaService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async createPresignedUpload(userId: string, input: CreatePresignedUploadRequest) {
    this.assertRequestedMedia(input.mediaType, input.mimeType, input.size);
    await this.assertUploadAuthorization(userId, input);
    const configuration = input.kind === 'move_in' || input.kind === 'guarantor' ? this.privateR2Configuration() : this.r2Configuration();
    const objectKey = this.createObjectKey(input.kind, userId, input.mimeType);
    const uploadUrl = await getSignedUrl(
      this.r2Client(configuration),
      new PutObjectCommand({
        Bucket: configuration.bucketName,
        Key: objectKey,
        ContentType: input.mimeType,
      }),
      { expiresIn: uploadExpirySeconds },
    );

    return {
      objectKey,
      mediaType: input.mediaType,
      mimeType: input.mimeType,
      uploadUrl,
      // Agreement uploads are not returned through the public media domain.
      // Their keys are consumed only by authenticated agreement endpoints.
      publicUrl: input.kind === 'agreement' || input.kind === 'move_in' || input.kind === 'guarantor' ? undefined : this.publicUrl(configuration.publicUrl, objectKey),
      expiresAt: new Date(Date.now() + uploadExpirySeconds * 1000).toISOString(),
    };
  }

  async prepareListingMedia(userId: string, media: ListingMediaInput[]): Promise<PreparedListingMedia[]> {
    if (new Set(media.map((item) => item.objectKey)).size !== media.length) {
      throw new BadRequestException('A listing cannot include the same media file more than once');
    }
    if (media.length > 5) {
      throw new BadRequestException('A listing can contain no more than 5 media files');
    }
    const configuration = this.r2Configuration();
    const images = media.filter((item) => item.mediaType === ListingMediaType.IMAGE);
    const imagePositions = new Map(images.map((item, index) => [item.objectKey, item.position ?? index]));
    return Promise.all(media.map(async (item) => {
      this.assertOwnedObjectKey(item.objectKey, userId, 'listing');
      const object = await this.headObject(configuration, item.objectKey);
      const mimeType = object.ContentType?.split(';')[0]?.trim().toLowerCase();
      const bytes = object.ContentLength;
      if (!mimeType || bytes === undefined || !Number.isFinite(bytes)) {
        throw new BadRequestException('Unable to validate the uploaded listing media');
      }
      this.assertRequestedMedia(item.mediaType, mimeType, bytes);
      return {
        objectKey: item.objectKey,
        url: this.publicUrl(configuration.publicUrl, item.objectKey),
        mediaType: item.mediaType,
        altText: item.altText,
        mimeType,
        bytes,
        // Keep videos away from the image cover ordering.
        position: item.mediaType === ListingMediaType.IMAGE ? imagePositions.get(item.objectKey) ?? 0 : 1000,
      };
    }));
  }

  assertListingMediaRules(media: Array<{ mediaType: ListingMediaType }>): void {
    const images = media.filter((item) => item.mediaType === ListingMediaType.IMAGE).length;
    const videos = media.filter((item) => item.mediaType === ListingMediaType.VIDEO).length;
    if (media.length > 5 || images < 3 || images > 4 || videos !== 1) {
      throw new BadRequestException('A listing needs 3–4 images and exactly 1 video (maximum 5 media files).');
    }
  }

  async deleteUnassociatedUpload(userId: string, objectKey: string): Promise<void> {
    const kind = (['listing', 'maintenance', 'profile', 'incident', 'agreement', 'guarantor'] as const).find((candidate) =>
      objectKey.startsWith(`${this.objectPrefix(candidate)}/${userId}/`),
    );
    if (!kind) {
      throw new BadRequestException('Media asset does not belong to this account');
    }
    if (kind !== 'listing' && kind !== 'maintenance' && kind !== 'agreement' && kind !== 'guarantor') {
      throw new ForbiddenException('This type of media cannot be removed through the unassociated upload endpoint');
    }
    const associated = kind === 'listing'
      ? await this.prisma.listingMedia.findUnique({ where: { objectKey }, select: { id: true } })
      : kind === 'maintenance'
        ? await this.prisma.maintenanceAttachment.findUnique({ where: { publicId: objectKey }, select: { id: true } })
        : kind === 'agreement'
          ? await this.prisma.agreementSignature.findFirst({ where: { uploadedDocumentUrl: objectKey }, select: { id: true } })
          : await this.prisma.guarantorForm.findFirst({ where: { OR: [{ passportObjectKey: objectKey }, { uploadedSignedCopyObjectKey: objectKey }] }, select: { id: true } });
    if (associated) {
      throw new ForbiddenException('This media file is already attached and cannot be removed as an unassociated upload');
    }
    await this.deleteObject(objectKey, kind === 'guarantor');
  }

  async deleteListingObject(userId: string, objectKey: string): Promise<void> {
    // Older non-R2 keys may remain in historical records after the schema migration.
    // They are not R2 objects and must never be sent to the R2 delete API.
    if (!objectKey.startsWith(`${this.objectPrefix('listing')}/${userId}/`)) return;
    await this.deleteObject(objectKey);
  }

  assertOwnedObjectKey(objectKey: string, userId: string, kind: UploadKind): void {
    if (!objectKey.startsWith(`${this.objectPrefix(kind)}/${userId}/`)) {
      throw new BadRequestException('Media asset does not belong to this account');
    }
  }

  async prepareAgreementDocument(userId: string, tenancyId: string, objectKey: string): Promise<void> {
    this.assertOwnedObjectKey(objectKey, userId, 'agreement');
    const tenancy = await this.prisma.tenancy.findFirst({
      where: { id: tenancyId, OR: [{ tenantId: userId }, { landlordId: userId }, { agentId: userId }] },
      select: { id: true },
    });
    if (!tenancy) throw new ForbiddenException('Only tenancy participants can attach a signed agreement');
    const object = await this.headObject(this.r2Configuration(), objectKey);
    const mimeType = object.ContentType?.split(';')[0]?.trim().toLowerCase();
    const bytes = object.ContentLength;
    if (!mimeType || bytes === undefined || !Number.isFinite(bytes)) {
      throw new BadRequestException('Unable to validate the uploaded signed agreement');
    }
    this.assertRequestedMedia('DOCUMENT', mimeType, bytes);
  }

  async prepareGuarantorPassport(userId: string, tenancyId: string, objectKey: string): Promise<void> {
    this.assertOwnedObjectKey(objectKey, userId, 'guarantor');
    await this.assertTenantForGuarantorUpload(userId, tenancyId);
    const object = await this.headObject(this.privateR2Configuration(), objectKey);
    const mimeType = object.ContentType?.split(';')[0]?.trim().toLowerCase();
    const bytes = object.ContentLength;
    if (!mimeType || bytes === undefined || !Number.isFinite(bytes)) {
      throw new BadRequestException('Unable to validate the guarantor passport photograph');
    }
    this.assertRequestedMedia('IMAGE', mimeType, bytes);
  }

  async prepareGuarantorSignedCopy(userId: string, tenancyId: string, objectKey: string): Promise<void> {
    this.assertOwnedObjectKey(objectKey, userId, 'guarantor');
    await this.assertTenantForGuarantorUpload(userId, tenancyId);
    const object = await this.headObject(this.privateR2Configuration(), objectKey);
    const mimeType = object.ContentType?.split(';')[0]?.trim().toLowerCase();
    const bytes = object.ContentLength;
    if (!mimeType || bytes === undefined || !Number.isFinite(bytes)) {
      throw new BadRequestException('Unable to validate the signed guarantor form');
    }
    this.assertRequestedMedia('DOCUMENT', mimeType, bytes);
  }

  async privateDownloadUrl(objectKey: string): Promise<{ downloadUrl: string; expiresAt: string }> {
    const configuration = this.r2Configuration();
    const downloadUrl = await getSignedUrl(
      this.r2Client(configuration),
      new GetObjectCommand({ Bucket: configuration.bucketName, Key: objectKey }),
      { expiresIn: uploadExpirySeconds },
    );
    return { downloadUrl, expiresAt: new Date(Date.now() + uploadExpirySeconds * 1000).toISOString() };
  }

  async prepareMoveInEvidence(userId: string, objectKey: string): Promise<void> {
    this.assertOwnedObjectKey(objectKey, userId, 'move_in');
    const object = await this.headObject(this.privateR2Configuration(), objectKey);
    const mimeType = object.ContentType?.split(';')[0]?.trim().toLowerCase();
    const bytes = object.ContentLength;
    if (!mimeType || bytes === undefined || !Number.isFinite(bytes)) throw new BadRequestException('Unable to validate evidence');
    const type = imageMimeTypes.has(mimeType) ? 'IMAGE' : videoMimeTypes.has(mimeType) ? 'VIDEO' : null;
    if (!type) throw new BadRequestException('Evidence must be an image or video');
    this.assertRequestedMedia(type, mimeType, bytes);
  }

  async moveInEvidenceDownloadUrl(objectKey: string) {
    const configuration = this.privateR2Configuration();
    const downloadUrl = await getSignedUrl(this.r2Client(configuration), new GetObjectCommand({ Bucket: configuration.bucketName, Key: objectKey }), { expiresIn: uploadExpirySeconds });
    return { downloadUrl, expiresAt: new Date(Date.now() + uploadExpirySeconds * 1000).toISOString() };
  }

  private async assertUploadAuthorization(userId: string, input: CreatePresignedUploadRequest): Promise<void> {
    if (input.kind === 'move_in') {
      if (!input.tenancyId || input.mediaType === 'DOCUMENT') throw new BadRequestException('A tenancy and image or video are required');
      const tenancy = await this.prisma.tenancy.findFirst({ where: { id: input.tenancyId, OR: [{ tenantId: userId }, { landlordId: userId }, { agentId: userId }] }, select: { id: true } });
      if (!tenancy) throw new ForbiddenException('Only tenancy participants can upload evidence');
      return;
    }
    if (input.kind === 'agreement') {
      if (!input.tenancyId) throw new BadRequestException('A tenancy is required for a signed agreement upload');
      if (input.mediaType !== 'DOCUMENT') throw new BadRequestException('Signed agreements must be uploaded as PDF documents');
      const tenancy = await this.prisma.tenancy.findFirst({
        where: { id: input.tenancyId, OR: [{ tenantId: userId }, { landlordId: userId }, { agentId: userId }] },
        select: { id: true },
      });
      if (!tenancy) throw new ForbiddenException('Only tenancy participants can upload a signed agreement');
      return;
    }
    if (input.kind === 'guarantor') {
      if (!input.tenancyId) throw new BadRequestException('A tenancy is required for a guarantor form upload');
      if (input.mediaType !== 'IMAGE' && input.mediaType !== 'DOCUMENT') {
        throw new BadRequestException('The guarantor form accepts a passport image or signed PDF document');
      }
      await this.assertTenantForGuarantorUpload(userId, input.tenancyId);
      return;
    }
    if (input.kind !== 'listing') return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { userRoles: { select: { role: { select: { code: true } } } } },
    });
    const roles = user?.userRoles.map(({ role }) => role.code) ?? [];
    if (!roles.includes(RoleCode.LANDLORD) && !roles.includes(RoleCode.AGENT)) {
      throw new ForbiddenException('Only landlords and agents can upload listing media');
    }
    if (!input.listingId) return;
    const listing = await this.prisma.listing.findUnique({
      where: { id: input.listingId },
      select: { landlordId: true, createdById: true, managingAgentId: true, _count: { select: { media: true } } },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (![listing.landlordId, listing.createdById, listing.managingAgentId].includes(userId)) {
      throw new ForbiddenException('You do not manage this listing');
    }
    if (listing._count.media >= 5) throw new BadRequestException('A listing can contain no more than 5 media files');
    const existingOfType = await this.prisma.listingMedia.count({
      where: { listingId: input.listingId, mediaType: input.mediaType as ListingMediaType },
    });
    if (input.mediaType === ListingMediaType.IMAGE && existingOfType >= 4) {
      throw new BadRequestException('A listing can contain no more than 4 images');
    }
    if (input.mediaType === ListingMediaType.VIDEO && existingOfType >= 1) {
      throw new BadRequestException('A listing can contain only 1 video');
    }
  }

  private assertRequestedMedia(mediaType: RequestedMediaType | ListingMediaType, mimeType: string, bytes: number): void {
    if (mediaType === 'DOCUMENT') {
      if (!agreementMimeTypes.has(mimeType) || bytes > agreementMaximumBytes) {
        throw new BadRequestException('A signed agreement must be a PDF no larger than 10 MB.');
      }
      return;
    }
    if (mediaType === 'IMAGE') {
      if (!imageMimeTypes.has(mimeType) || bytes > imageMaximumBytes) {
        throw new BadRequestException('Each image must be JPEG, PNG or WebP and no larger than 5 MB.');
      }
      return;
    }
    if (!videoMimeTypes.has(mimeType) || bytes > videoMaximumBytes) {
      throw new BadRequestException('The listing video must be MP4, WebM or MOV and no larger than 50 MB.');
    }
  }

  private createObjectKey(kind: UploadKind, userId: string, mimeType: string): string {
    return `${this.objectPrefix(kind)}/${userId}/${randomUUID()}.${this.extensionFor(mimeType)}`;
  }

  private extensionFor(mimeType: string): string {
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
      'application/pdf': 'pdf',
    };
    const extension = extensions[mimeType];
    if (!extension) throw new BadRequestException('Unsupported media type');
    return extension;
  }

  private objectPrefix(kind: UploadKind): string {
    const prefixes: Record<UploadKind, string> = {
      listing: 'listings',
      maintenance: 'maintenance',
      profile: 'profiles',
      incident: 'incidents',
      agreement: 'agreements',
      move_in: 'move-in-evidence',
      guarantor: 'guarantor-forms',
    };
    return prefixes[kind];
  }

  private async headObject(configuration: ReturnType<MediaService['r2Configuration']>, objectKey: string) {
    try {
      return await this.r2Client(configuration).send(new HeadObjectCommand({
        Bucket: configuration.bucketName,
        Key: objectKey,
      }));
    } catch {
      throw new BadRequestException('One or more media files were not uploaded successfully');
    }
  }

  private async deleteObject(objectKey: string, privateObject = false): Promise<void> {
    const configuration = privateObject ? this.privateR2Configuration() : this.r2Configuration();
    await this.r2Client(configuration).send(new DeleteObjectCommand({
      Bucket: configuration.bucketName,
      Key: objectKey,
    }));
  }

  private r2Configuration() {
    const accountId = this.configService.get<string>('CLOUDFLARE_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('CLOUDFLARE_R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('CLOUDFLARE_R2_SECRET_ACCESS_KEY');
    const bucketName = this.configService.get<string>('CLOUDFLARE_R2_BUCKET_NAME');
    const publicUrl = this.configService.get<string>('CLOUDFLARE_R2_PUBLIC_URL');
    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
      throw new ServiceUnavailableException('Cloudflare R2 media uploads are not configured');
    }
    return { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl };
  }

  private privateR2Configuration() {
    const configuration = this.r2Configuration();
    const bucketName = this.configService.get<string>('CLOUDFLARE_R2_PRIVATE_BUCKET_NAME');
    if (!bucketName || bucketName === configuration.bucketName) {
      throw new ServiceUnavailableException('Private document storage is not configured. Set CLOUDFLARE_R2_PRIVATE_BUCKET_NAME to a separate, non-public Cloudflare R2 bucket.');
    }
    return { ...configuration, bucketName };
  }

  private async assertTenantForGuarantorUpload(userId: string, tenancyId: string): Promise<void> {
    const tenancy = await this.prisma.tenancy.findFirst({
      where: { id: tenancyId, tenantId: userId },
      select: { id: true },
    });
    if (!tenancy) throw new ForbiddenException('Only the tenant can upload guarantor form documents');
  }

  private r2Client(configuration: ReturnType<MediaService['r2Configuration']>): S3Client {
    return new S3Client({
      region: 'auto',
      endpoint: `https://${configuration.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
      },
    });
  }

  private publicUrl(baseUrl: string, objectKey: string): string {
    return `${baseUrl.replace(/\/$/, '')}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
  }
}
