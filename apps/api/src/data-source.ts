import 'reflect-metadata';
import './common/load-env';
import { DataSource } from 'typeorm';
import { UserEntity } from './entities/user.entity';
import { ClientEntity } from './entities/client.entity';
import { TemplateVersionEntity } from './entities/template-version.entity';
import { TemplateFieldEntity } from './entities/template-field.entity';
import { AuditLogEntity } from './entities/audit-log.entity';
import { QuoteOrderEntity } from './entities/quote-order.entity';
import { FeeRateEntity } from './entities/fee-rate.entity';
import { ClientImageEntity } from './entities/client-image.entity';
import { ClientCnpjEntity } from './entities/client-cnpj.entity';
import { OrderFileEntity } from './entities/order-file.entity';
import { PaymentRecordEntity } from './entities/payment-record.entity';
import { HelpArticleEntity } from './entities/help-article.entity';
import { AiConfigEntity } from './entities/ai-config.entity';
import { UploadDraftEntity } from './entities/upload-draft.entity';
import { CustomsCnpjEntity } from './entities/customs-cnpj.entity';
import { ProductCatalogEntity } from './entities/product-catalog.entity';

export const ALL_ENTITIES = [
  UserEntity,
  ClientEntity,
  TemplateVersionEntity,
  TemplateFieldEntity,
  AuditLogEntity,
  QuoteOrderEntity,
  FeeRateEntity,
  ClientImageEntity,
  ClientCnpjEntity,
  CustomsCnpjEntity,
  ProductCatalogEntity,
  OrderFileEntity,
  PaymentRecordEntity,
  HelpArticleEntity,
  AiConfigEntity,
  UploadDraftEntity
];

/** TypeORM CLI（migration:generate/run）与种子/导入脚本共用的 DataSource */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'ddp',
  password: process.env.DB_PASS || 'ddp_local',
  database: process.env.DB_NAME || 'ddpserver',
  entities: ALL_ENTITIES,
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
  logging: process.env.DB_LOG === 'true'
});
