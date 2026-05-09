import { Module } from '@nestjs/common';
import { PrismaModule } from 'prisma/prisma.module';
import { AccountBalanceController } from './account-balance.controller';
import { AccountBalanceService } from './account-balance.service';

@Module({
  imports: [PrismaModule],
  controllers: [AccountBalanceController],
  providers: [AccountBalanceService],
  exports: [AccountBalanceService],
})
export class AccountBalanceModule {}
