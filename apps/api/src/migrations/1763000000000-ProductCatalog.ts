import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductCatalog1763000000000 implements MigrationInterface {
  name = 'ProductCatalog1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_catalog" (
        "id" uuid NOT NULL,
        "sku_key" character varying(160) NOT NULL,
        "sku" character varying(160) NOT NULL,
        "product_cn" character varying(500),
        "product_en" character varying(500),
        "description" text,
        "material" character varying(100),
        "base_unit_price_rmb" double precision,
        "ncm" character varying(8),
        "ncm_confidence" double precision,
        "ncm_rationale" text,
        "ncm_sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "tax_rates" jsonb,
        "image_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "last_quote_id" uuid,
        "last_client_id" uuid,
        "ncm_reviewed_by" character varying(80),
        "ncm_reviewed_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_catalog" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_product_catalog_sku_key" ON "product_catalog" ("sku_key")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_product_catalog_sku_key"`);
    await queryRunner.query(`DROP TABLE "product_catalog"`);
  }
}
