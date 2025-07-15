import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Theonefault API')
    .setDescription('Documentación API con theonefault')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Ingrese su token JWT aquí',
        name: 'Authorization',
        in: 'header',
      },
      'BearerAuth', // Nombre de la seguridad, debe coincidir con @ApiBearerAuth('BearerAuth')
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // Mantener token después de ingresar
    },
  });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();