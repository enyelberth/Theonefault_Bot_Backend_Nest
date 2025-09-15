import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import * as https from 'https';
@Module({
  imports: [
    HttpModule.register({
      httpsAgent: new https.Agent({
        rejectUnauthorized: false, // Ignora errores de certificado SSL
      }),
    }),
  ],
  exports: [HttpModule],
})
export class HttpconfigModule {}
