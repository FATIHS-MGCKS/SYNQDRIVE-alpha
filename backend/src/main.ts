import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import { join } from 'path';
import { AppModule } from './app.module';
import { SpaFallbackController } from './spa-fallback.controller';
import { GlobalExceptionFilter } from '@shared/filters/global-exception.filter';
import { RequestLoggingInterceptor } from '@shared/interceptors/request-logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const appModule = await AppModule.forRootAsync();

  // Enable raw body for reliable webhook HMAC signature verification
  const app = await NestFactory.create<NestExpressApplication>(appModule, {
    rawBody: true,
  });
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);
  const apiPrefix = configService.get<string>('app.apiPrefix', 'api');
  const apiVersion = configService.get<string>('app.apiVersion', 'v1');

  app.setGlobalPrefix(`${apiPrefix}/${apiVersion}`, {
    exclude: ['master', 'master/(.*)', 'rental', 'rental/(.*)'],
  });

  app.use(helmet());
  app.use(compression());

  // CORS: explicit allowlist from config — no wildcard origin
  const allowedOrigins = configService.get<string[]>('app.corsOrigins', []);
  app.enableCors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no Origin header) and allowlisted origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`CORS blocked request from: ${origin}`);
        callback(new Error(`Origin ${origin} not allowed by CORS policy`), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-seed-token', 'x-hm-signature', 'x-dimo-signature'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SynqDrive API')
    .setDescription('Multi-tenant SaaS platform for mobility and vehicle operations')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(port);
  logger.log(`SynqDrive backend running on port ${port}`);
  logger.log(`API prefix: ${apiPrefix}/${apiVersion}`);
  logger.log(`Swagger docs available at /docs`);
}

bootstrap();
