import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuoteDeclaredCurrency1762200000000 implements MigrationInterface {
  name = 'QuoteDeclaredCurrency1762200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quote_order" ADD "declared_currency" character varying(3) NOT NULL DEFAULT 'RMB'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quote_order" DROP COLUMN "declared_currency"`);
  }
}
