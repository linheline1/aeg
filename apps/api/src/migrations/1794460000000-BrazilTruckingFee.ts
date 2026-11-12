import { MigrationInterface, QueryRunner } from 'typeorm';

export class BrazilTruckingFee1794460000000 implements MigrationInterface {
  name = 'BrazilTruckingFee1794460000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "fee_rate" ADD COLUMN "br_trucking_brl" double precision NOT NULL DEFAULT 0');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "fee_rate" DROP COLUMN "br_trucking_brl"');
  }
}
