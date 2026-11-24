import { MigrationInterface, QueryRunner } from 'typeorm';

export class KnowledgeDoc1794460000003 implements MigrationInterface {
  name = 'KnowledgeDoc1794460000003';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE "knowledge_doc" (
      "id" uuid PRIMARY KEY,
      "title" varchar(200) NOT NULL,
      "kind" varchar(20) NOT NULL,
      "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "status" varchar(20) NOT NULL DEFAULT 'active',
      "is_current" boolean NOT NULL DEFAULT false,
      "version" varchar(60) NOT NULL DEFAULT '',
      "effective_date" varchar(20),
      "source_file" varchar(300),
      "summary" varchar(500) NOT NULL DEFAULT '',
      "content" text NOT NULL DEFAULT '',
      "chunks" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "created_by" varchar(80) NOT NULL DEFAULT 'system',
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )`);
    await runner.query(`CREATE INDEX "IDX_knowledge_doc_kind_status" ON "knowledge_doc" ("kind", "status")`);
    await runner.query(`CREATE UNIQUE INDEX "UQ_knowledge_current_price" ON "knowledge_doc" ("is_current") WHERE "is_current" = true AND "kind" = 'price_table'`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE "knowledge_doc"');
  }
}
