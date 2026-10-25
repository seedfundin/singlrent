import { NotificationsService } from './notifications.service';

describe('notification links', () => {
  it('only returns a notification belonging to the signed-in user', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new NotificationsService({ notification: { findFirst } } as never, {} as never, {} as never);
    const id = '11111111-1111-4111-8111-111111111111';
    await expect(service.getOne('other-user', id)).rejects.toThrow('Notification not found');
    expect(findFirst).toHaveBeenCalledWith({ where: { id, userId: 'other-user' } });
    await expect(service.getOne('other-user', 'invalid')).rejects.toThrow('Notification not found');
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});
