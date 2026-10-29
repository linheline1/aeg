import { Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { TemplateModule } from './template/template.module';
import { ClientModule } from './client/client.module';
import { StaffModule } from './staff/staff.module';
import { AuditModule } from './audit/audit.module';
import { UserModule } from './user/user.module';
import { OrderModule } from './order/order.module';
import { UploadModule } from './upload/upload.module';
import { RatesModule } from './rates/rates.module';
import { AdminStatsModule } from './admin/admin-stats.module';
import { FinanceModule } from './finance/finance.module';
import { HelpModule } from './help/help.module';
import { DatabaseModule } from './common/database.module';
import { ALL_ENTITIES } from './data-source';
import { seedIfEmpty } from './common/mock-db';

/**
 * APP_MODULE_MODE
 *   - 'mock'       本地预览（默认）：纯 JS JSON mock DB，零原生依赖
 *   - 'postgres'   VPS 部署：使用 TypeORM + PostgreSQL（schema 由 migrations 管理）
 */
const MODE = (process.env.APP_MODULE_MODE || 'mock') as 'mock' | 'postgres';

const imports: any[] = [DatabaseModule, AuthModule, UserModule, TemplateModule, ClientModule, StaffModule, AuditModule, OrderModule, UploadModule, RatesModule, AdminStatsModule, FinanceModule, HelpModule];

// VPS 部署时启用 TypeORM
if (MODE === 'postgres') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TypeOrmModule } = require('@nestjs/typeorm');
  imports.unshift(
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'ddp',
      password: process.env.DB_PASS || 'ddp_local',
      database: process.env.DB_NAME || 'ddpserver',
      entities: ALL_ENTITIES,
      synchronize: false,
      migrationsRun: true,
      migrations: [__dirname + '/migrations/*.{ts,js}'],
      logging: process.env.DB_LOG === 'true'
    })
  );
}

@Module({ imports })
export class AppModule implements OnModuleInit {
  async onModuleInit() {
    if (MODE === 'mock') {
      await seedIfEmpty();
    } else {
      console.log('📦 DB mode: PostgreSQL（schema 由 migrations 管理，种子数据用 pnpm seed）');
    }
  }
}
