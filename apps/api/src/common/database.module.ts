import { Global, Module, Provider } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  UserRepo, ClientRepo, TemplateRepo, AuditRepo, QuotesRepo,
  FeeRatesRepo, ImageRepo, ClientCnpjsRepo, CustomsCnpjsRepo, ProductCatalogRepo, OrderFilesRepo, PaymentsRepo, HelpArticlesRepo, AiConfigRepo
} from './mock-db';
import {
  PgUserRepo, PgClientRepo, PgTemplateRepo, PgAuditRepo, PgQuotesRepo,
  PgFeeRatesRepo, PgImageRepo, PgClientCnpjsRepo, PgCustomsCnpjsRepo, PgProductCatalogRepo, PgOrderFilesRepo, PgPaymentsRepo, PgHelpArticlesRepo, PgAiConfigRepo
} from './pg-repos';
import { UploadDraftsRepo } from '../upload/upload-draft.repository';

const MODE = (process.env.APP_MODULE_MODE || 'mock') as 'mock' | 'postgres';

/**
 * 仓储 token 统一出口：mock 模式返回 JSON 文件库实例，
 * postgres 模式返回 TypeORM 实现（公开方法与 mock 版一致）。
 * 新增表时需同时：加实体 + mock 表 + 两套 Repo + 此处注册。
 */
function repoProvider(token: string, MockClass: new () => unknown, PgClass: new (ds: DataSource) => unknown): Provider {
  return {
    provide: token,
    useFactory: (ds?: DataSource) => (MODE === 'postgres' ? new PgClass(ds as DataSource) : new MockClass()),
    inject: [{ token: DataSource, optional: true }]
  };
}

export const REPO_TOKENS = [
  'UserRepo', 'ClientRepo', 'TemplateRepo', 'AuditRepo', 'QuotesRepo',
  'FeeRatesRepo', 'ImageRepo', 'ClientCnpjsRepo', 'CustomsCnpjsRepo', 'ProductCatalogRepo', 'OrderFilesRepo', 'PaymentsRepo', 'HelpArticlesRepo', 'AiConfigRepo', 'UploadDraftsRepo'
] as const;

@Global()
@Module({
  providers: [
    repoProvider('UserRepo', UserRepo, PgUserRepo),
    repoProvider('ClientRepo', ClientRepo, PgClientRepo),
    repoProvider('TemplateRepo', TemplateRepo, PgTemplateRepo),
    repoProvider('AuditRepo', AuditRepo, PgAuditRepo),
    repoProvider('QuotesRepo', QuotesRepo, PgQuotesRepo),
    repoProvider('FeeRatesRepo', FeeRatesRepo, PgFeeRatesRepo),
    repoProvider('ImageRepo', ImageRepo, PgImageRepo),
    repoProvider('ClientCnpjsRepo', ClientCnpjsRepo, PgClientCnpjsRepo),
    repoProvider('CustomsCnpjsRepo', CustomsCnpjsRepo, PgCustomsCnpjsRepo),
    repoProvider('ProductCatalogRepo', ProductCatalogRepo, PgProductCatalogRepo),
    repoProvider('OrderFilesRepo', OrderFilesRepo, PgOrderFilesRepo),
    repoProvider('PaymentsRepo', PaymentsRepo, PgPaymentsRepo),
    repoProvider('HelpArticlesRepo', HelpArticlesRepo, PgHelpArticlesRepo),
    repoProvider('AiConfigRepo', AiConfigRepo, PgAiConfigRepo),
    {
      provide: 'UploadDraftsRepo',
      useFactory: (ds?: DataSource) => new UploadDraftsRepo(MODE === 'postgres' ? ds : undefined),
      inject: [{ token: DataSource, optional: true }]
    }
  ],
  exports: [...REPO_TOKENS]
})
export class DatabaseModule {}
