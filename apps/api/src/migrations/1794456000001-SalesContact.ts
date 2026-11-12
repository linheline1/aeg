import { MigrationInterface, QueryRunner } from 'typeorm';

export class SalesContact1794456000001 implements MigrationInterface {
  name = 'SalesContact1794456000001';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "user" ADD COLUMN "sales_phone" varchar(30)');
    await queryRunner.query('ALTER TABLE "user" ADD COLUMN "sales_wechat" varchar(80)');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "user" DROP COLUMN "sales_wechat"');
    await queryRunner.query('ALTER TABLE "user" DROP COLUMN "sales_phone"');
  }
}
