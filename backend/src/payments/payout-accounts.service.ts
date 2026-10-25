import { ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { PaystackService } from '../integrations/paystack.service';
import { SavePayoutAccountRequest } from './dto/payout-account.schemas';

const payoutAccountSelect = {
  bankName: true,
  accountName: true,
  accountLast4: true,
  currency: true,
  updatedAt: true,
} as const;

@Injectable()
export class PayoutAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
  ) {}

  async getMine(userId: string) {
    const account = await this.prisma.payoutAccount.findUnique({
      where: { userId },
      select: payoutAccountSelect,
    });
    return { configured: Boolean(account), account };
  }

  listBanks() {
    return this.paystack.listNigerianBanks();
  }

  async saveMine(userId: string, input: SavePayoutAccountRequest) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, status: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Only active accounts can add a payout destination');

    try {
      const recipient = await this.paystack.createTransferRecipient({
        name: `${user.firstName} ${user.lastName}`.trim(),
        accountNumber: input.accountNumber,
        bankCode: input.bankCode,
      });
      const account = await this.prisma.payoutAccount.upsert({
        where: { userId },
        create: {
          userId,
          recipientCode: recipient.recipientCode,
          bankCode: input.bankCode,
          bankName: recipient.bankName,
          accountName: recipient.accountName,
          accountLast4: input.accountNumber.slice(-4),
        },
        update: {
          recipientCode: recipient.recipientCode,
          bankCode: input.bankCode,
          bankName: recipient.bankName,
          accountName: recipient.accountName,
          accountLast4: input.accountNumber.slice(-4),
        },
        select: payoutAccountSelect,
      });
      return { configured: true, account };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('This bank destination is already linked to another account. Please use a different bank account or ask support for help.');
        }
        if (error.code === 'P2021' || error.code === 'P2022') {
          throw new ServiceUnavailableException('Bank account setup is temporarily unavailable while SingleRent updates its secure payment records. Please try again shortly.');
        }
      }
      throw new ServiceUnavailableException('We could not save this bank account right now. Please try again shortly.');
    }
  }
}
