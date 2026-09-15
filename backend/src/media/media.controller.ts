import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { CreateUploadSignatureRequest, createUploadSignatureSchema } from './dto/media.schemas';
import { MediaService } from './media.service';

@ApiTags('Media')
@ApiBearerAuth()
@Controller({ path: 'media', version: '1' })
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload-signatures')
  createUploadSignature(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createUploadSignatureSchema)) input: CreateUploadSignatureRequest,
  ) {
    return this.mediaService.createUploadSignature(user.userId, input);
  }
}
