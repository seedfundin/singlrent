import { Body, Controller, Delete, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import {
  CreatePresignedUploadRequest,
  DeleteUploadRequest,
  createPresignedUploadSchema,
  deleteUploadSchema,
} from './dto/media.schemas';
import { MediaService } from './media.service';

@ApiTags('Media')
@ApiBearerAuth()
@Controller({ path: 'media', version: '1' })
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('uploads/presign')
  createPresignedUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createPresignedUploadSchema)) input: CreatePresignedUploadRequest,
  ) {
    return this.mediaService.createPresignedUpload(user.userId, input);
  }

  @Delete('uploads')
  @HttpCode(204)
  async deleteUnassociatedUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(deleteUploadSchema)) input: DeleteUploadRequest,
  ): Promise<void> {
    await this.mediaService.deleteUnassociatedUpload(user.userId, input.objectKey);
  }
}
