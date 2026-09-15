import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConversationType, MessageKind, NotificationType, Prisma } from '@prisma/client';
import { pageResult, Paginated } from '../common/http/pagination';
import { PrismaService } from '../common/database/prisma.service';
import { ListingsService } from '../listings/listings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../websocket/realtime.gateway';
import { ConversationQuery, CreateConversationRequest, SendMessageRequest } from './dto/conversation.schemas';

const conversationInclude = {
  listing: { select: { id: true, slug: true, title: true } },
  members: {
    include: { user: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } } },
  },
  messages: { take: 1, orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.ConversationInclude;

type ConversationView = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listingsService: ListingsService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(userId: string, query: ConversationQuery): Promise<Paginated<ConversationView & { unreadCount: number }>> {
    const where = { members: { some: { userId } } };
    const [conversations, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        include: conversationInclude,
        orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.conversation.count({ where }),
    ]);
    const items = await Promise.all(
      conversations.map(async (conversation) => {
        this.realtimeGateway.joinUserToConversation(userId, conversation.id);
        const membership = conversation.members.find((member) => member.userId === userId);
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conversation.id,
            senderId: { not: userId },
            createdAt: membership?.lastReadAt ? { gt: membership.lastReadAt } : undefined,
          },
        });
        return { ...conversation, unreadCount };
      }),
    );
    return pageResult(items, total, query);
  }

  async get(userId: string, conversationId: string): Promise<ConversationView> {
    await this.assertMember(userId, conversationId);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: conversationInclude,
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    this.realtimeGateway.joinUserToConversation(userId, conversation.id);
    return conversation;
  }

  async create(userId: string, input: CreateConversationRequest): Promise<ConversationView> {
    if (input.recipientId === userId) {
      throw new ForbiddenException('You cannot message yourself');
    }
    if (input.listingId) {
      const listing = await this.listingsService.getByPublicId(input.listingId, userId);
      const allowedRecipients = [listing.landlordId, listing.managingAgentId].filter(
        (candidate): candidate is string => Boolean(candidate),
      );
      if (!allowedRecipients.includes(input.recipientId)) {
        throw new ForbiddenException('Choose the landlord or managing agent for this listing');
      }
    } else {
      const recipient = await this.prisma.user.findUnique({ where: { id: input.recipientId }, select: { id: true } });
      if (!recipient) {
        throw new NotFoundException('Recipient not found');
      }
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        listingId: input.listingId,
        type: input.type,
        subject: input.subject,
        members: { create: [{ userId }, { userId: input.recipientId }] },
      },
      include: conversationInclude,
    });
    this.realtimeGateway.joinUserToConversation(userId, conversation.id);
    this.realtimeGateway.joinUserToConversation(input.recipientId, conversation.id);
    if (input.initialMessage) {
      await this.sendMessage(userId, conversation.id, { body: input.initialMessage });
      return this.get(userId, conversation.id);
    }
    return conversation;
  }

  async messages(userId: string, conversationId: string, query: ConversationQuery) {
    await this.assertMember(userId, conversationId);
    const where = { conversationId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where,
        include: { sender: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } }, receipts: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.message.count({ where }),
    ]);
    return pageResult(items.reverse(), total, query);
  }

  async sendMessage(userId: string, conversationId: string, input: SendMessageRequest) {
    const members = await this.membersOrThrow(userId, conversationId);
    const message = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.message.create({
        data: { conversationId, senderId: userId, kind: MessageKind.USER, body: input.body },
        include: { sender: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } } },
      });
      await transaction.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: created.createdAt } });
      await transaction.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadAt: created.createdAt },
      });
      return created;
    });
    this.realtimeGateway.emitMessage(conversationId, message);
    await Promise.all(
      members
        .filter((member) => member.userId !== userId)
        .map((member) =>
          this.notificationsService.create({
            userId: member.userId,
            type: NotificationType.NEW_MESSAGE,
            title: 'New message',
            body: input.body.slice(0, 180),
            data: { conversationId, messageId: message.id },
          }),
        ),
    );
    return message;
  }

  async markRead(userId: string, conversationId: string): Promise<void> {
    await this.assertMember(userId, conversationId);
    const readAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadAt: readAt },
      });
      const unread = await transaction.message.findMany({
        where: { conversationId, senderId: { not: userId }, receipts: { none: { userId } } },
        select: { id: true },
      });
      if (unread.length) {
        await transaction.messageReceipt.createMany({
          data: unread.map((message) => ({ messageId: message.id, userId, readAt })),
          skipDuplicates: true,
        });
      }
    });
  }

  private async assertMember(userId: string, conversationId: string): Promise<void> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { userId: true },
    });
    if (!member) {
      throw new ForbiddenException('You are not a member of this conversation');
    }
  }

  private async membersOrThrow(userId: string, conversationId: string) {
    const members = await this.prisma.conversationMember.findMany({ where: { conversationId } });
    if (!members.some((member) => member.userId === userId)) {
      throw new ForbiddenException('You are not a member of this conversation');
    }
    return members;
  }
}
