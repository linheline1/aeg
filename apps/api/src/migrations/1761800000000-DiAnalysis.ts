import { MigrationInterface, QueryRunner } from 'typeorm';

export class DiAnalysis1761800000000 implements MigrationInterface {
  name = 'DiAnalysis1761800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quote_order" ADD "di_analysis" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quote_order" DROP COLUMN "di_analysis"`);
  }
}
