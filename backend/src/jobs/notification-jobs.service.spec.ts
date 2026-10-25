import { NotificationJobsService } from './notification-jobs.service';

describe('notification job scheduling', () => {
  it('coalesces only conversation push notifications per recipient', async () => {
    const add = jest.fn().mockResolvedValue({});
    const service = new NotificationJobsService({ add } as never);
    await service.enqueue({ notificationId: 'one', userId: 'user', title: '', body: '', channel: 'PUSH', conversationId: 'conversation' });
    expect(add).toHaveBeenCalledWith('deliver-notification', expect.anything(), expect.objectContaining({ jobId: 'notification-one-PUSH', deduplication: { id: 'message-user-conversation', ttl: 60000 } }));
    await service.enqueue({ notificationId: 'two', userId: 'user', title: '', body: '', channel: 'EMAIL', conversationId: 'conversation' });
    expect(add.mock.calls[1][2]).not.toHaveProperty('deduplication');
    await service.enqueue({ notificationId: 'payment', userId: 'user', title: '', body: '', channel: 'PUSH' });
    expect(add.mock.calls[2][2]).not.toHaveProperty('deduplication');
  });
});
