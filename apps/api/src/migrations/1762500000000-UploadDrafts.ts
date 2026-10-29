import { MigrationInterface, QueryRunner } from 'typeorm';

export class UploadDrafts1762500000000 implements MigrationInterface {
  name = 'UploadDrafts1762500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "upload_draft" (
        "id" uuid NOT NULL,
        "client_id" uuid NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'preview',
        "file_name" character varying(255) NOT NULL,
        "file_path" character varying(500) NOT NULL,
        "template_version" character varying(20) NOT NULL,
        "rows" jsonb NOT NULL,
        "warehouse_code" character varying(255),
        "converted_by_ai" boolean NOT NULL DEFAULT false,
        "ai_notes" text,
        "declared_currency" character varying(3) NOT NULL DEFAULT 'RMB',
        "screenshots" jsonb,
        "quote_id" uuid,
        "expires_at" TIMESTAMP NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_upload_draft" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_upload_draft_client_id" ON "upload_draft" ("client_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "upload_draft"`);
  }
}
