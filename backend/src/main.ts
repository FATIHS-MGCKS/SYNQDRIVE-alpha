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

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.create<NestExpressApplication>(appModule);
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

  app.enableCors({
    origin: true,
    credentials: true,
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
