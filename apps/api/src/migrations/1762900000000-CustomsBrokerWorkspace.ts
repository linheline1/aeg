import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomsBrokerWorkspace1762900000000 implements MigrationInterface {
  name = 'CustomsBrokerWorkspace1762900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quote_order" ADD "customs_review" jsonb`);
    await queryRunner.query(`
      CREATE TABLE "customs_cnpj" (
        "id" uuid NOT NULL,
        "cnpj" character varying(20) NOT NULL,
        "company_name" character varying(200) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'active',
        "quota_limit_usd" double precision NOT NULL DEFAULT 0,
        "quota_used_usd" double precision NOT NULL DEFAULT 0,
        "cert_a1_file_path" character varying(500),
        "cert_a1_file_name" character varying(255),
        "cert_a1_mime_type" character varying(100),
        "cert_a1_size_bytes" integer,
        "cert_a1_uploaded_at" timestamp,
        "ecpf_file_path" character varying(500),
        "ecpf_file_name" character varying(255),
        "ecpf_mime_type" character varying(100),
        "ecpf_size_bytes" integer,
        "ecpf_uploaded_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customs_cnpj" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_customs_cnpj_cnpj" ON "customs_cnpj" ("cnpj")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_customs_cnpj_cnpj"`);
    await queryRunner.query(`DROP TABLE "customs_cnpj"`);
    await queryRunner.query(`ALTER TABLE "quote_order" DROP COLUMN "customs_review"`);
  }
}
