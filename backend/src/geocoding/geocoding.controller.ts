import { Controller, Get, Query } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { GeocodingSearchRequest, geocodingSearchSchema } from './dto/geocoding.schemas';
import { GeocodingService } from './geocoding.service';

@ApiTags('Geocoding')
@ApiBearerAuth()
@Controller({ path: 'geocoding', version: '1' })
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Get('search')
  @Roles(RoleCode.LANDLORD, RoleCode.AGENT)
  search(@Query(new ZodValidationPipe(geocodingSearchSchema)) query: GeocodingSearchRequest) {
    return this.geocodingService.search(query.q, query.limit);
  }
}
