import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { ProfileController } from './profile/profile.controller';
import { ProfileService } from './profile/profile.service';
import { ProfileModule } from './profile/profile.module';
import { AuthModule } from './auth/auth.module';
import { ScheduleModule } from './schedule/schedule.module';

import { AvailabledayService } from './availableday/availableday.service';
import { AvailabledayController } from './availableday/availableday.controller';
import { AvailabledayModule } from './availableday/availableday.module';
import { AppointmentModule } from './appointment/appointment.module';
import { PricecryptoModule } from './pricecrypto/pricecrypto.module';
import { BinanceModule } from './binance/binance.module';
import { CustomersModule } from './customers/customers.module';
import { ServiceModule } from './service/service.module';
import { ClientsModule } from './clients/clients.module';
import { PromotionsModule } from './promotions/promotions.module';

@Module({
  imports: [ScheduleModule, UsersModule, ProfileModule, AuthModule, AvailabledayModule, AppointmentModule, PricecryptoModule, BinanceModule, CustomersModule, ServiceModule, ClientsModule, PromotionsModule],
  controllers: [AppController, ProfileController],
  providers: [AppService, ProfileService],
})
export class AppModule {}
