import { MigrationInterface, QueryRunner } from 'typeorm';

export class SalesAvatar1794456000000 implements MigrationInterface {
  name = 'SalesAvatar1794456000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "user" ADD COLUMN "avatar_data" text');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "user" DROP COLUMN "avatar_data"');
  }
}
