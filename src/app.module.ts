import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { ProfileController } from './profile/profile.controller';
import { ProfileService } from './profile/profile.service';
import { ProfileModule } from './profile/profile.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [UsersModule, ProfileModule, AuthModule],
  controllers: [AppController, ProfileController],
  providers: [AppService, ProfileService],
})
export class AppModule {}
