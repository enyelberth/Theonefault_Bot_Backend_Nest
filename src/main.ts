import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { FrontendModule } from './frontend/frontend.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Chrome Private Network Access: sin este header, un fetch desde
  // localhost/https hacia una IP privada (ej. 192.168.x.x) falla como
  // "Failed to fetch" sin respuesta visible, aunque el CORS normal esté ok.
  // Debe ir ANTES de enableCors: el middleware de cors responde y corta
  // la cadena en el preflight (OPTIONS), así que algo registrado después
  // nunca se ejecuta en esa request.
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Private-Network', 'true');
    next();
  });

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
      'BearerAuth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const backendPort = Number(process.env.PORT) || 50000;
  await app.listen(backendPort);
  console.log(
    `[Backend] listening on http://localhost:${backendPort}  (Swagger: /api)`,
  );

  try {
    const frontApp = await NestFactory.create(FrontendModule);
    frontApp.enableCors({ origin: '*' });
    const frontPort = Number(process.env.FRONT_PORT) || 50001;
    await frontApp.listen(frontPort);
    console.log(
      `[KAIZEN Frontend] serving ./public on http://localhost:${frontPort}`,
    );
  } catch (err) {
    console.error(
      `[KAIZEN Frontend] failed to start static frontend server: ${(err as Error).message}`,
    );
  }
}
bootstrap();
