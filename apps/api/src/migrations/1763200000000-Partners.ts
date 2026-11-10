import { MigrationInterface, QueryRunner } from 'typeorm';

/** 合作伙伴（海运承运商 / 生态合作伙伴）：管理端增删，logo 必传，官网合作伙伴页展示 */
export class Partners1763200000000 implements MigrationInterface {
  name = 'Partners1763200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "partner" (
        "id" varchar(40) NOT NULL,
        "category" varchar(20) NOT NULL,
        "name" varchar(120) NOT NULL,
        "logo_file_path" varchar(500) NOT NULL,
        "logo_mime_type" varchar(100) NOT NULL DEFAULT '',
        "logo_size_bytes" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL,
        CONSTRAINT "PK_partner_id" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "partner"`);
  }
}
