import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuoteTotalAmountRmb1762100000000 implements MigrationInterface {
  name = 'QuoteTotalAmountRmb1762100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quote_order" ADD "total_amount_rmb" double precision`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quote_order" DROP COLUMN "total_amount_rmb"`);
  }
}
