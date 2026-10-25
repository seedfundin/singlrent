import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConversationType, MessageKind, NotificationType, Prisma, RoleCode } from '@prisma/client';
import { pageResult, Paginated } from '../common/http/pagination';
import { PrismaService } from '../common/database/prisma.service';
import { ListingsService } from '../listings/listings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../websocket/realtime.gateway';
import { ConversationQuery, CreateConversationRequest, SendMessageRequest } from './dto/conversation.schemas';
import { PropertyAiService } from './property-ai.service';

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
    private readonly propertyAiService: PropertyAiService,
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
    if (input.type === ConversationType.PROPERTY_AI) {
      return this.createPropertyAiConversation(userId, input);
    }
    if (input.listingId || input.type !== ConversationType.SUPPORT) {
      throw new ForbiddenException('Property conversations must use the Property Assistant');
    }
    const recipientId = input.recipientId!;
    await this.assertSupportParticipants([userId, recipientId]);
    if (recipientId === userId) {
      throw new ForbiddenException('You cannot message yourself');
    }
    const recipient = await this.prisma.user.findUnique({ where: { id: recipientId }, select: { id: true } });
    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        listingId: input.listingId,
        type: input.type,
        subject: input.subject,
        members: { create: [{ userId }, { userId: recipientId }] },
      },
      include: conversationInclude,
    });
    this.realtimeGateway.joinUserToConversation(userId, conversation.id);
    this.realtimeGateway.joinUserToConversation(recipientId, conversation.id);
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
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, listingId: true, type: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const members = await this.membersOrThrow(userId, conversationId);
    if (conversation.type === ConversationType.PROPERTY_AI && conversation.listingId) {
      const listing = await this.listingsService.getByPublicId(conversation.listingId, userId);
      if (userId === listing.landlordId || userId === listing.managingAgentId) throw new ForbiddenException('Property contacts must reply through the questions inbox');
    }
    if (conversation.type !== ConversationType.PROPERTY_AI && (conversation.listingId || conversation.type !== ConversationType.SUPPORT)) {
      throw new ForbiddenException('This property conversation is read-only. Please use the Property Assistant.');
    }
    if (conversation.type === ConversationType.SUPPORT) await this.assertSupportParticipants(members.map((member) => member.userId));
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
    if (conversation.type === ConversationType.PROPERTY_AI && conversation.listingId) {
      const assistantReply = await this.propertyAiService.answer(conversation.listingId, input.body, userId);
      let answer = assistantReply.body;
      if (assistantReply.needsPropertyContactReply) {
        try {
          const handoff = await this.forwardQuestionToPropertyContact(userId, conversation.id, message.id, conversation.listingId, input.body);
          answer = handoff.forwarded
            ? 'I could not find that answer in the listing. I have forwarded your question to the property contact and will share their response here.'
            : 'That detail is not included in this listing. This home is managed by your account, so there is no separate property contact to message.';
        } catch {
          answer = 'That detail is not included in this listing. I could not send the question to the property contact just now; please try again shortly.';
        }
      }
      const aiMessage = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.message.create({
          data: { conversationId, kind: MessageKind.AI, body: answer },
          include: { sender: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } } },
        });
        await transaction.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: created.createdAt } });
        return created;
      });
      this.realtimeGateway.emitMessage(conversationId, aiMessage);
    }
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

  private async createPropertyAiConversation(userId: string, input: CreateConversationRequest): Promise<ConversationView> {
    const listingId = input.listingId!;
    const listing = await this.listingsService.getByPublicId(listingId, userId);
    if (listing.landlordId === userId || listing.managingAgentId === userId) {
      throw new ForbiddenException('Property contacts cannot initiate tenant conversations');
    }
    const existing = await this.prisma.conversation.findFirst({
      where: {
        listingId: listing.id,
        type: ConversationType.PROPERTY_AI,
        members: { some: { userId } },
      },
      include: conversationInclude,
      orderBy: { updatedAt: 'desc' },
    });
    const conversation = existing ?? await this.prisma.conversation.create({
      data: {
        listingId: listing.id,
        type: ConversationType.PROPERTY_AI,
        subject: `Property assistant · ${listing.title}`,
        members: { create: [{ userId }] },
      },
      include: conversationInclude,
    });
    this.realtimeGateway.joinUserToConversation(userId, conversation.id);
    if (input.initialMessage) {
      await this.sendMessage(userId, conversation.id, { body: input.initialMessage });
    }
    return this.get(userId, conversation.id);
  }

  private async forwardQuestionToPropertyContact(
    userId: string,
    conversationId: string,
    messageId: string,
    listingId: string,
    body: string,
  ): Promise<{ forwarded: boolean; recipientName: string }> {
    const listing = await this.listingsService.getByPublicId(listingId, userId);
    const recipient = listing.managingAgent ?? listing.landlord;
    const recipientName = `${recipient.firstName} ${recipient.lastName}`.trim();
    if (recipient.id === userId) {
      return { forwarded: false, recipientName };
    }

    const notification = await this.prisma.$transaction(async (transaction) => {
      const escalation = await transaction.propertyQuestionEscalation.create({
        data: { conversationId, questionMessageId: messageId, tenantId: userId, contactId: recipient.id, question: body },
      });
      return transaction.notification.create({ data: { userId: recipient.id, type: NotificationType.NEW_MESSAGE, title: 'Property question awaiting your response', body: `A tenant has a question about ${listing.title}.`, data: { escalationId: escalation.id } } });
    });
    this.realtimeGateway.emitNotification(recipient.id, notification);
    await this.notificationsService.dispatchExisting(notification);

    return { forwarded: true, recipientName };
  }

  async escalations(userId: string) {
    return this.prisma.propertyQuestionEscalation.findMany({
      where: { contactId: userId },
      include: { conversation: { select: { listing: { select: { id: true, title: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async monitoring(query: Record<string, string>) {
    const contacts = query.contact ? await this.prisma.user.findMany({
      where: { OR: [{ firstName: { contains: query.contact, mode: 'insensitive' } }, { lastName: { contains: query.contact, mode: 'insensitive' } }] },
      select: { id: true },
    }) : undefined;
    const after = query.from ? new Date(query.from) : undefined;
    const before = query.to ? new Date(query.to) : undefined;
    if ((after && isNaN(after.getTime())) || (before && isNaN(before.getTime()))) throw new ForbiddenException('Invalid date filter');
    if (before) before.setUTCHours(23, 59, 59, 999);
    const where: Prisma.ConversationWhereInput = {
      type: ConversationType.PROPERTY_AI,
      listing: query.property ? { title: { contains: query.property, mode: 'insensitive' } } : undefined,
      members: query.tenant ? { some: { user: { OR: [{ firstName: { contains: query.tenant, mode: 'insensitive' } }, { lastName: { contains: query.tenant, mode: 'insensitive' } }] } } } : undefined,
      createdAt: after || before ? { gte: after, lte: before } : undefined,
      escalations: query.contact || query.status ? { some: { contactId: contacts ? { in: contacts.map((contact) => contact.id) } : undefined, respondedAt: query.status === 'pending' ? null : query.status === 'answered' ? { not: null } : undefined } } : undefined,
    };
    const page = Math.max(1, Math.min(Number.parseInt(query.page || '1', 10) || 1, 10000));
    const [items, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * 20, take: 20,
        include: { listing: { select: { id: true, title: true } }, members: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
          messages: { orderBy: { createdAt: 'asc' } }, escalations: { orderBy: { createdAt: 'asc' } } } }),
      this.prisma.conversation.count({ where }),
    ]);
    const contactIds = [...new Set(items.flatMap((conversation) => conversation.escalations.map((entry) => entry.contactId)))];
    const people = await this.prisma.user.findMany({ where: { id: { in: contactIds } }, select: { id: true, firstName: true, lastName: true } });
    return { items, total, page, contacts: people };
  }

  private async assertSupportParticipants(userIds: string[]) {
    const administrator = await this.prisma.userRole.findFirst({ where: { userId: { in: userIds }, role: { code: { in: [RoleCode.ADMIN, RoleCode.SUPER_ADMIN] } } }, select: { userId: true } });
    if (!administrator) throw new ForbiddenException('Support conversations must include an administrator. Property questions must use the Property Assistant.');
  }

  async replyToEscalation(userId: string, escalationId: string, body: string) {
    const result = await this.prisma.$transaction(async (transaction) => {
      const escalation = await transaction.propertyQuestionEscalation.findUnique({ where: { id: escalationId } });
      if (!escalation) throw new NotFoundException('Question not found');
      if (escalation.contactId !== userId) throw new ForbiddenException('You are not assigned to this question');
      const claimed = await transaction.propertyQuestionEscalation.updateMany({ where: { id: escalationId, contactId: userId, respondedAt: null }, data: { response: body, respondedAt: new Date() } });
      if (claimed.count !== 1) throw new ConflictException('This question has already been answered');
      const message = await transaction.message.create({ data: { conversationId: escalation.conversationId, kind: MessageKind.AI, body }, include: { sender: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } } } });
      await transaction.propertyQuestionEscalation.update({ where: { id: escalationId }, data: { assistantMessageId: message.id } });
      await transaction.conversation.update({ where: { id: escalation.conversationId }, data: { lastMessageAt: message.createdAt } });
      const notification = await transaction.notification.create({ data: { userId: escalation.tenantId, type: NotificationType.NEW_MESSAGE, title: 'Your property question has been answered', body: 'The Property Assistant has a response to your question.', data: { conversationId: escalation.conversationId, messageId: message.id } } });
      return { escalation, message, notification };
    });
    this.realtimeGateway.emitMessage(result.escalation.conversationId, result.message);
    this.realtimeGateway.emitNotification(result.escalation.tenantId, result.notification);
    await this.notificationsService.dispatchExisting(result.notification);
    return result.message;
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
