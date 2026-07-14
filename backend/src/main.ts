import { NestFactory } from '@nestjs/core';
import { RawBodyRequest } from '@nestjs/common/interfaces';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';
import { ValidationPipe, Logger, LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import { join } from 'path';
import { AppModule } from './app.module';
import { SpaFallbackController } from './spa-fallback.controller';
import { GlobalExceptionFilter } from '@shared/filters/global-exception.filter';
import { RequestLoggingInterceptor } from '@shared/interceptors/request-logging.interceptor';

/**
 * Resolve active log levels.
 *
 * NestJS treats the levels array as an explicit allowlist (NOT a threshold), so
 * `['debug']` would suppress error/warn/log. To keep the intuitive meaning of a
 * single value (e.g. the common `LOG_LEVEL=debug`), we treat one token as a
 * *threshold* — that level and everything more severe.
 *
 * Precedence:
 *   1. `LOG_LEVEL` single token  -> threshold (e.g. debug => error,warn,log,debug).
 *   2. `LOG_LEVEL` comma list     -> explicit set (advanced, e.g. "error,warn").
 *   3. Unset -> NODE_ENV default — production: error/warn/log (no debug/verbose),
 *      otherwise the full set. Prevents prod from effectively running at debug.
 */
function resolveLogLevels(): LogLevel[] {
  // Ordered from least to most verbose. `fatal` always rides along with `error`.
  const order: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];
  const raw = (process.env.LOG_LEVEL || '').trim().toLowerCase();

  if (raw) {
    const tokens = raw.split(',').map((s) => s.trim()).filter(Boolean);

    // Single token => threshold (that level and everything more severe).
    if (tokens.length === 1) {
      const idx = order.indexOf(tokens[0] as LogLevel);
      if (idx >= 0) return ['fatal', ...order.slice(0, idx + 1)];
    }

    // Multiple tokens => explicit set.
    const explicit = tokens.filter((s): s is LogLevel =>
      (order as string[]).includes(s) || s === 'fatal',
    );
    if (explicit.length) {
      return explicit.includes('error') && !explicit.includes('fatal')
        ? ['fatal', ...explicit]
        : explicit;
    }
  }

  const isProd = (process.env.NODE_ENV || 'development') === 'production';
  return isProd
    ? ['fatal', 'error', 'warn', 'log']
    : ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const logLevels = resolveLogLevels();
  const appModule = await AppModule.forRootAsync();

  // Enable raw body for reliable webhook HMAC signature verification
  const app = await NestFactory.create<NestExpressApplication>(appModule, {
    rawBody: true,
    logger: logLevels,
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

  // Explicit request body-size limits. Must accommodate the base64 image / signature
  // endpoints (vehicle damage & exterior images, handover signatures) while bounding
  // abuse. useBodyParser() keeps the rawBody capture used for webhook HMAC verification.
  const bodyLimit = process.env.HTTP_BODY_LIMIT || '12mb';
  const captureRawBody = (req: RawBodyRequest<Request>, _res: unknown, buf: Buffer) => {
    req.rawBody = buf;
  };
  app.useBodyParser('json', { limit: bodyLimit, verify: captureRawBody });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true, verify: captureRawBody });

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
    allowedHeaders: ['Content-Type', 'Authorization', 'x-seed-token', 'x-hm-signature', 'x-dimo-signature', 'stripe-signature'],
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
  logger.log(`Active log levels: [${logLevels.join(', ')}]`);
}

bootstrap();
