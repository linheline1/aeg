/**
 * 数据迁移脚本：把 mock 文件库 apps/api/data/dev.json 导入 PostgreSQL。
 * 幂等：按主键 id 跳过已存在行，可重复执行。
 * 容忍缺省：quotes 等行缺可选字段时按 null 处理。
 * 运行：pnpm run import:dev-json（需先执行 migration:run）
 */
import 'reflect-metadata';
import '../common/load-env';
import * as process from 'process';
import * as fs from 'fs';
import path from 'path';
import { EntityTarget, ObjectLiteral } from 'typeorm';
import { AppDataSource } from '../data-source';
import { UserEntity } from '../entities/user.entity';
import { ClientEntity } from '../entities/client.entity';
import { TemplateVersionEntity } from '../entities/template-version.entity';
import { AuditLogEntity } from '../entities/audit-log.entity';
import { QuoteOrderEntity } from '../entities/quote-order.entity';
import { FeeRateEntity } from '../entities/fee-rate.entity';
import { ClientImageEntity } from '../entities/client-image.entity';
import { ClientCnpjEntity } from '../entities/client-cnpj.entity';
import { OrderFileEntity } from '../entities/order-file.entity';
import { PaymentRecordEntity } from '../entities/payment-record.entity';
import { HelpArticleEntity } from '../entities/help-article.entity';
import { repoRoot } from '../common/mock-db';

/** dev.json 顶层键 → 实体（顺序保证 FK 依赖：client 先于 user） */
const TABLE_MAP: [string, EntityTarget<ObjectLiteral>][] = [
  ['clients', ClientEntity],
  ['users', UserEntity],
  ['templates', TemplateVersionEntity],
  ['quotes', QuoteOrderEntity],
  ['fee_rates', FeeRateEntity],
  ['audit_logs', AuditLogEntity],
  ['client_images', ClientImageEntity],
  ['client_cnpjs', ClientCnpjEntity],
  ['order_files', OrderFileEntity],
  ['payments', PaymentRecordEntity],
  ['help_articles', HelpArticleEntity]
];

async function main() {
  const jsonPath = path.join(repoRoot(), 'apps/api/data/dev.json');
  if (!fs.existsSync(jsonPath)) {
    console.log(`⏭ ${jsonPath} 不存在，无需导入`);
    return;
  }
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  await AppDataSource.initialize();
  console.log('✅ DB connected (PostgreSQL)');

  for (const [key, entity] of TABLE_MAP) {
    const rows: any[] = raw[key] || [];
    if (rows.length === 0) continue;
    const repo = AppDataSource.getRepository(entity);
    let inserted = 0;
    let skipped = 0;
    for (const row of rows) {
      // ON CONFLICT DO NOTHING：主键或唯一键（如 username）冲突均跳过，幂等
      const res = await repo.createQueryBuilder().insert().values(row).orIgnore().execute();
      if (res.identifiers.length > 0) inserted++; else skipped++;
    }
    console.log(`✅ ${key}: 导入 ${inserted} 条，跳过 ${skipped} 条（共 ${rows.length} 条）`);
  }

  await AppDataSource.destroy();
  console.log('🎉 import-dev-json done');
}

main().catch((err) => {
  console.error('❌ import failed:', err);
  process.exit(1);
});
