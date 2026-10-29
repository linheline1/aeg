import { MigrationInterface, QueryRunner } from 'typeorm';

export class DdpSalesMarkupRate1762800000000 implements MigrationInterface {
  name = 'DdpSalesMarkupRate1762800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fee_rate" ADD "sales_markup_rate" double precision NOT NULL DEFAULT 0.20`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fee_rate" DROP COLUMN "sales_markup_rate"`);
  }
}
