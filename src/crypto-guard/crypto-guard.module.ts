import { Module } from '@nestjs/common';
import { CryptoGuardService } from './crypto-guard.service';
import { CryptoGuardGateway } from './crypto-guard.gateway';
import { BinanceService } from 'src/binance/binance.service';
import { AccountService } from 'src/account/account.service';
import { AccountModule } from 'src/account/account.module';

@Module({
  imports: [AccountModule],
  providers: [CryptoGuardGateway, CryptoGuardService,BinanceService],
})
export class CryptoGuardModule {}
