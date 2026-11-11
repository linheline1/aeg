import { MigrationInterface, QueryRunner } from 'typeorm';

/** 合作伙伴官网链接（落地页点击 logo 跳转；空串表示未设置） */
export class PartnerWebsiteUrl1763300000000 implements MigrationInterface {
  name = 'PartnerWebsiteUrl1763300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "partner"
      ADD "website_url" varchar(300) NOT NULL DEFAULT ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "partner" DROP COLUMN "website_url"`);
  }
}
