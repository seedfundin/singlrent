import { Queue } from 'bullmq';
import { PayoutJobsService } from './payout-jobs.service';

describe('PayoutJobsService', () => {
  it('uses a BullMQ-safe, stable job identifier', async () => {
    const add = jest.fn().mockResolvedValue({});
    const getJob = jest.fn().mockResolvedValue(null);
    const service = new PayoutJobsService({ add, getJob } as unknown as Queue);

    await service.enqueue('6ae235b9-6df5-4767-ba38-1768eb1bbd23');

    expect(add).toHaveBeenCalledWith(
      'execute-payout',
      { payoutId: '6ae235b9-6df5-4767-ba38-1768eb1bbd23' },
      expect.objectContaining({ jobId: 'payout-6ae235b9-6df5-4767-ba38-1768eb1bbd23' }),
    );
  });

  it('replaces an existing terminal job before scheduling a retry', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const getState = jest.fn().mockResolvedValue('completed');
    const add = jest.fn().mockResolvedValue({});
    const service = new PayoutJobsService({ add, getJob: jest.fn().mockResolvedValue({ getState, remove }) } as unknown as Queue);

    await service.enqueue('6ae235b9-6df5-4767-ba38-1768eb1bbd23');

    expect(remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
  });
});
