import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiConfig1761900000000 implements MigrationInterface {
  name = 'AiConfig1761900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_config" (
        "id" varchar(40) PRIMARY KEY NOT NULL,
        "base_url" varchar(500) NOT NULL DEFAULT '',
        "api_key" varchar(500) NOT NULL DEFAULT '',
        "model" varchar(120) NOT NULL DEFAULT '',
        "timeout_ms" integer NOT NULL DEFAULT 60000,
        "updated_by" varchar(50) NOT NULL,
        "updated_at" TIMESTAMP NOT NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ai_config"`);
  }
}
