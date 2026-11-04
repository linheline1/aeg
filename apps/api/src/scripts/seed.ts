/**
 * 种子脚本（PostgreSQL）：初始 admin / operator / sales01 / customs01 / client_a 账号、
 * 示例客户、模板 v2.0 记录、全局费率。与 mock 模式 seedIfEmpty 对齐。
 * 运行：pnpm run seed（需先执行 migration:run）
 */
import 'reflect-metadata';
import '../common/load-env';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import * as process from 'process';
import { AppDataSource } from '../data-source';
import { ClientEntity } from '../entities/client.entity';
import { UserEntity } from '../entities/user.entity';
import { TemplateVersionEntity } from '../entities/template-version.entity';
import { FeeRateEntity } from '../entities/fee-rate.entity';
import { repoRoot } from '../common/mock-db';

async function seed() {
  await AppDataSource.initialize();
  console.log('✅ DB connected (PostgreSQL)');

  const clientRepo = AppDataSource.getRepository(ClientEntity);
  const userRepo = AppDataSource.getRepository(UserEntity);
  const templateRepo = AppDataSource.getRepository(TemplateVersionEntity);
  const feeRateRepo = AppDataSource.getRepository(FeeRateEntity);

  // Client
  let client = await clientRepo.findOne({ where: { name: '示例客户 A' } });
  if (!client) {
    client = await clientRepo.save(clientRepo.create({ id: crypto.randomUUID(), name: '示例客户 A', status: 'active' }));
    console.log(`✅ client seeded: ${client.id}`);
  } else {
    console.log(`⏭ client already exists: ${client.id}`);
  }

  // Users
  const users = [
    { username: 'admin', role: 'admin' as const, client_id: null, defaultPwd: 'admin123' },
    { username: 'operator', role: 'operator' as const, client_id: null, defaultPwd: 'operator123' },
    { username: 'sales01', role: 'sales' as const, client_id: null, defaultPwd: 'sales123' },
    { username: 'customs01', role: 'customs' as const, client_id: null, defaultPwd: 'customs123' },
    { username: 'client_a', role: 'client' as const, client_id: client.id, defaultPwd: 'client123' }
  ];
  const seededUsers: UserEntity[] = [];
  for (const u of users) {
    const existing = await userRepo.findOne({ where: { username: u.username } });
    if (existing) {
      console.log(`⏭ user already exists: ${u.username}`);
      seededUsers.push(existing);
      continue;
    }
    const saved = await userRepo.save(userRepo.create({
      id: crypto.randomUUID(),
      username: u.username,
      password_hash: await bcrypt.hash(u.defaultPwd, 12),
      role: u.role,
      client_id: u.client_id,
      status: 'active'
    }));
    seededUsers.push(saved);
    console.log(`✅ user seeded: ${u.username} / ${u.defaultPwd} (${saved.id})`);
  }

  // 示例客户默认归属 sales01（仅当未设置时）
  const salesUser = seededUsers.find(u => u.role === 'sales');
  if (salesUser && !client.salesperson_id) {
    client.salesperson_id = salesUser.id;
    await clientRepo.save(client);
    console.log(`✅ client assigned to sales01`);
  }

  // Template v2.0
  const templatePath = path.join(
    repoRoot(),
    'apps/api/uploads/templates/巴西整柜装箱清单_模板_v2.0.xlsx'
  );
  let fileHash = '';
  if (existsSync(templatePath)) {
    fileHash = crypto.createHash('sha256').update(readFileSync(templatePath)).digest('hex');
  } else {
    console.warn('⚠️  模板文件未找到，先在 packages/excel-utils 运行 gen:template');
  }

  const activeTpl = await templateRepo.findOne({ where: { status: 'active' } });
  if (!activeTpl) {
    await templateRepo.save(templateRepo.create({
      id: crypto.randomUUID(),
      template_code: 'BR_FCL',
      version_no: '2.0',
      file_path: 'apps/api/uploads/templates/巴西整柜装箱清单_模板_v2.0.xlsx',
      file_hash: fileHash,
      schema_json: {},
      meta_json: {
        template_id: 'BR_FCL',
        version: '2.0',
        schema_hash: '',
        published_at: new Date().toISOString(),
        min_rows: 1,
        max_rows: 100
      },
      status: 'active',
      activated_at: new Date()
    }));
    console.log(`✅ template v2.0 seeded`);
  } else {
    console.log(`⏭ template already active: ${activeTpl.version_no}`);
  }

  // 全局费率
  const globalRate = await feeRateRepo.findOne({ where: { scope: 'global' } });
  if (!globalRate) {
    await feeRateRepo.save(feeRateRepo.create({
      id: crypto.randomUUID(),
      scope: 'global',
      client_id: null,
      ocean_freight_usd: 1200,
      port_fee_usd: 130,
      br_clearance_brl: 0,
      fx_rate: 5.0,
      sales_tax_rate: 0.065,
      sales_markup_rate: 0.20,
      profit_brl: 30000,
      updated_by: 'system',
      updated_at: new Date()
    }));
    console.log(`✅ global fee rate seeded`);
  } else {
    console.log(`⏭ global fee rate already exists`);
  }

  await AppDataSource.destroy();
  console.log('🎉 Seed done');
}

seed().catch((err) => {
  console.error('❌ seed failed:', err);
  process.exit(1);
});
