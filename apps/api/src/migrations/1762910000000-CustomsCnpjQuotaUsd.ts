import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomsCnpjQuotaUsd1762910000000 implements MigrationInterface {
  name = 'CustomsCnpjQuotaUsd1762910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customs_cnpj' AND column_name = 'quota_limit_brl'
        ) THEN
          ALTER TABLE "customs_cnpj" RENAME COLUMN "quota_limit_brl" TO "quota_limit_usd";
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customs_cnpj' AND column_name = 'quota_used_brl'
        ) THEN
          ALTER TABLE "customs_cnpj" RENAME COLUMN "quota_used_brl" TO "quota_used_usd";
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customs_cnpj' AND column_name = 'quota_limit_usd'
        ) THEN
          ALTER TABLE "customs_cnpj" RENAME COLUMN "quota_limit_usd" TO "quota_limit_brl";
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customs_cnpj' AND column_name = 'quota_used_usd'
        ) THEN
          ALTER TABLE "customs_cnpj" RENAME COLUMN "quota_used_usd" TO "quota_used_brl";
        END IF;
      END $$;
    `);
  }
}
