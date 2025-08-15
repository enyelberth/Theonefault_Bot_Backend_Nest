import { Module } from '@nestjs/common';
//import { AccountService } from './bankAccountType.service';
//import { AccountController } from './account.controller';
import { PrismaClient } from '@prisma/client';
import { BankAccountTypeService } from './bankAccountType.service';
import { BankAccountTypeController } from './bankAccountType.controller';
@Module({
  controllers: [BankAccountTypeController],
  providers: [BankAccountTypeService, PrismaClient],
})
export class BankAccountTypeServiceModule {}
