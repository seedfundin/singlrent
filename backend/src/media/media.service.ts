import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
const imageMaximumBytes = 5 * 1024 * 1024;
const videoMaximumBytes = 50 * 1024 * 1024;
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
    const configuration = this.r2Configuration();
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
      publicUrl: this.publicUrl(configuration.publicUrl, objectKey),
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
    const kind = (['listing', 'maintenance', 'profile', 'incident'] as const).find((candidate) =>
      objectKey.startsWith(`${this.objectPrefix(candidate)}/${userId}/`),
    );
    if (!kind) {
      throw new BadRequestException('Media asset does not belong to this account');
    }
    if (kind !== 'listing' && kind !== 'maintenance') {
      throw new ForbiddenException('This type of media cannot be removed through the unassociated upload endpoint');
    }
    const associated = kind === 'listing'
      ? await this.prisma.listingMedia.findUnique({ where: { objectKey }, select: { id: true } })
      : await this.prisma.maintenanceAttachment.findUnique({ where: { publicId: objectKey }, select: { id: true } });
    if (associated) {
      throw new ForbiddenException('This media file is already attached and cannot be removed as an unassociated upload');
    }
    await this.deleteObject(objectKey);
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

  private async assertUploadAuthorization(userId: string, input: CreatePresignedUploadRequest): Promise<void> {
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

  private async deleteObject(objectKey: string): Promise<void> {
    const configuration = this.r2Configuration();
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
