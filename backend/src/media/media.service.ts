import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { CreateUploadSignatureRequest } from './dto/media.schemas';

@Injectable()
export class MediaService {
  constructor(private readonly configService: ConfigService) {}

  createUploadSignature(userId: string, input: CreateUploadSignatureRequest) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');
    if (!cloudName || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException('Media uploads are not configured');
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `singlerent/${input.kind}/${userId}`;
    const parameters = { folder, timestamp };
    const toSign = Object.entries(parameters)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    const signature = createHash('sha1').update(`${toSign}${apiSecret}`).digest('hex');

    return {
      cloudName,
      apiKey,
      timestamp,
      folder,
      signature,
      resourceType: input.resourceType,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${input.resourceType}/upload`,
    };
  }

  assertOwnedPublicId(publicId: string, userId: string, kind: CreateUploadSignatureRequest['kind']): void {
    if (!publicId.startsWith(`singlerent/${kind}/${userId}/`)) {
      throw new BadRequestException('Media asset does not belong to this account');
    }
  }
}
