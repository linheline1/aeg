import { Module } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { existsSync } from 'fs';

// 尝试加载 .env（优先 .env.local）
const envLocal = existsSync('.env.local');
if (envLocal) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

@Module({})
export class ConfigModule {}
