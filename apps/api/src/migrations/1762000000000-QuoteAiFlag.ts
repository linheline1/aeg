import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuoteAiFlag1762000000000 implements MigrationInterface {
  name = 'QuoteAiFlag1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quote_order" ADD "converted_by_ai" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "quote_order" ADD "ai_notes" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quote_order" DROP COLUMN "ai_notes"`);
    await queryRunner.query(`ALTER TABLE "quote_order" DROP COLUMN "converted_by_ai"`);
  }
}
