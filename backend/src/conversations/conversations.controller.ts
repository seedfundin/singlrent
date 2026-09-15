import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { ConversationQuery, conversationQuerySchema, CreateConversationRequest, createConversationSchema, SendMessageRequest, sendMessageSchema } from './dto/conversation.schemas';
import { ConversationsService } from './conversations.service';

@ApiTags('Conversations')
@ApiBearerAuth()
@Controller({ path: 'conversations', version: '1' })
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(conversationQuerySchema)) query: ConversationQuery) {
    return this.conversationsService.list(user.userId, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createConversationSchema)) input: CreateConversationRequest,
  ) {
    return this.conversationsService.create(user.userId, input);
  }

  @Get(':conversationId')
  get(@CurrentUser() user: AuthenticatedUser, @Param('conversationId') conversationId: string) {
    return this.conversationsService.get(user.userId, conversationId);
  }

  @Get(':conversationId/messages')
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Query(new ZodValidationPipe(conversationQuerySchema)) query: ConversationQuery,
  ) {
    return this.conversationsService.messages(user.userId, conversationId, query);
  }

  @Post(':conversationId/messages')
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) input: SendMessageRequest,
  ) {
    return this.conversationsService.sendMessage(user.userId, conversationId, input);
  }

  @Patch(':conversationId/read')
  @HttpCode(204)
  async markRead(@CurrentUser() user: AuthenticatedUser, @Param('conversationId') conversationId: string): Promise<void> {
    await this.conversationsService.markRead(user.userId, conversationId);
  }
}
