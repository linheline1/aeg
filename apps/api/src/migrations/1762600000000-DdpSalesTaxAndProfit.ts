import { MigrationInterface, QueryRunner } from 'typeorm';

export class DdpSalesTaxAndProfit1762600000000 implements MigrationInterface {
  name = 'DdpSalesTaxAndProfit1762600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fee_rate" ADD "sales_tax_rate" double precision NOT NULL DEFAULT 0.065`);
    await queryRunner.query(`ALTER TABLE "fee_rate" ADD "profit_brl" double precision NOT NULL DEFAULT 30000`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fee_rate" DROP COLUMN "profit_brl"`);
    await queryRunner.query(`ALTER TABLE "fee_rate" DROP COLUMN "sales_tax_rate"`);
  }
}
