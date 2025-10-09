import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configurar CORS para aceptar solicitudes desde cualquier origen
  app.enableCors({
    origin: '*', // permite cualquier origen
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization',
    credentials: false, // NO permitir envío de cookies por seguridad con '*'
  });

  // Configuración Swagger con autenticación Bearer JWT
  const config = new DocumentBuilder()
    .setTitle('KAIZEN API')
    .setDescription('Documentación API KAIZEN')
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
      'BearerAuth', // Nombre que usarás en @ApiBearerAuth()
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
