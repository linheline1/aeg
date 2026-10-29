import 'reflect-metadata';
import './common/load-env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // R-07：生产环境必须显式提供 JWT_SECRET，禁止回退到内置开发密钥
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    Logger.error('生产环境必须设置 JWT_SECRET 环境变量，拒绝启动', 'Bootstrap');
    process.exit(1);
  }
  const port = parseInt(process.env.PORT || '5000', 10);
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log']
  });

  // 全局前缀：/api
  app.setGlobalPrefix('api');

  // 全局校验管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  // CORS（三端分离子域名，开发期允许；生产限定）
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  });

  // 仅监听 localhost
  await app.listen(port, '127.0.0.1', () => {
    Logger.log(`🚀 API running at http://127.0.0.1:${port}/api`, 'Bootstrap');
  });
}
bootstrap();
