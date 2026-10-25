import { ConversationType, MessageKind } from '@prisma/client';
import { ConversationsService } from './conversations.service';

describe('mediated property conversations', () => {
  let tx: any;
  let service: ConversationsService;
  let gateway: any;
  beforeEach(() => {
    tx = {
      propertyQuestionEscalation: {
        findUnique: jest.fn().mockResolvedValue({ id: 'question', contactId: 'agent', tenantId: 'tenant', conversationId: 'conversation' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      message: { create: jest.fn(async ({ data }: any) => ({ ...data, id: 'answer', createdAt: new Date() })) },
      conversation: { findUnique: jest.fn(), update: jest.fn() },
      conversationMember: { findMany: jest.fn(), update: jest.fn() },
      notification: { create: jest.fn(async ({ data }: any) => ({ ...data, id: 'notification' })) },
      userRole: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    gateway = { emitMessage: jest.fn(), emitNotification: jest.fn() };
    service = new ConversationsService({ ...tx, $transaction: (callback: any) => callback(tx) } as any, {} as any, gateway, { dispatchExisting: jest.fn() } as any, {} as any);
  });
  it('blocks new direct listing and tenancy conversations', async () => {
    await expect(service.create('tenant', { type: ConversationType.LISTING_ENQUIRY, recipientId: 'agent', listingId: 'listing' })).rejects.toThrow('Property Assistant');
    await expect(service.create('tenant', { type: ConversationType.TENANCY, recipientId: 'agent' })).rejects.toThrow('Property Assistant');
  });
  it('blocks fake support conversations without an administrator', async () => {
    await expect(service.create('tenant', { type: ConversationType.SUPPORT, recipientId: 'agent' })).rejects.toThrow('administrator');
  });
  it('prevents further messages in old direct property conversations', async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: 'old', listingId: 'listing', type: ConversationType.LISTING_ENQUIRY });
    tx.conversationMember.findMany.mockResolvedValue([{ userId: 'tenant' }, { userId: 'agent' }]);
    await expect(service.sendMessage('tenant', 'old', { body: 'Can you answer?' })).rejects.toThrow('read-only');
    expect(tx.message.create).not.toHaveBeenCalled();
  });
  it('forwards an unanswered question to the assigned agent without creating a direct conversation', async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: 'conversation', listingId: 'listing', type: ConversationType.PROPERTY_AI });
    tx.conversationMember.findMany.mockResolvedValue([{ userId: 'tenant' }]);
    tx.propertyQuestionEscalation.create = jest.fn(async ({ data }: any) => ({ ...data, id: 'question' }));
    const listing = { id: 'listing', title: 'Home', landlordId: 'landlord', managingAgentId: 'agent', managingAgent: { id: 'agent', firstName: 'Ada', lastName: 'A' }, landlord: { id: 'landlord', firstName: 'Owner', lastName: 'B' } };
    const listings = { getByPublicId: jest.fn().mockResolvedValue(listing) };
    const ai = { answer: jest.fn().mockResolvedValue({ needsPropertyContactReply: true, body: 'Forwarding' }) };
    service = new ConversationsService({ ...tx, $transaction: (callback: any) => callback(tx) } as any, listings as any, gateway, { dispatchExisting: jest.fn() } as any, ai as any);
    await service.sendMessage('tenant', 'conversation', { body: 'Is water available?' });
    expect(tx.propertyQuestionEscalation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ contactId: 'agent', tenantId: 'tenant', question: 'Is water available?' }) }));
    expect(tx.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'agent' }) }));
    expect(tx.conversation.create).toBeUndefined();
  });
  it('relays the exact response as an assistant message and records a notification', async () => {
    const response = 'The rent is ₦500,000; water is not included.';
    await service.replyToEscalation('agent', 'question', response);
    expect(tx.message.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ body: response, kind: MessageKind.AI }) }));
    expect(tx.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'tenant' }) }));
    expect(gateway.emitNotification).toHaveBeenCalled();
  });
  it('rejects unassigned contacts and duplicate answers', async () => {
    await expect(service.replyToEscalation('stranger', 'question', 'answer')).rejects.toThrow('not assigned');
    tx.propertyQuestionEscalation.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.replyToEscalation('agent', 'question', 'answer')).rejects.toThrow('already been answered');
    expect(tx.message.create).not.toHaveBeenCalled();
  });
});
