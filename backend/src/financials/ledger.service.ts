import { Injectable } from '@nestjs/common';
import { LedgerAccountCode, LedgerEntryType, Prisma } from '@prisma/client';

@Injectable()
export class LedgerService {
  record(
    transaction: Prisma.TransactionClient,
    input: {
      paymentId: string;
      entryType: LedgerEntryType;
      debitAccount: LedgerAccountCode;
      creditAccount: LedgerAccountCode;
      amountKobo: bigint;
      idempotencyKey: string;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    if (input.amountKobo <= 0n) {
      return Promise.resolve();
    }
    return transaction.ledgerEntry
      .create({ data: input })
      .then(() => undefined);
  }
}
