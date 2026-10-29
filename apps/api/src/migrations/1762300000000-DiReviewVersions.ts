import { MigrationInterface, QueryRunner } from 'typeorm';

export class DiReviewVersions1762300000000 implements MigrationInterface {
  name = 'DiReviewVersions1762300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quote_order" ADD "di_review_versions" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quote_order" DROP COLUMN "di_review_versions"`);
  }
}
