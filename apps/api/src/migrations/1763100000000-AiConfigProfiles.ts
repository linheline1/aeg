import { MigrationInterface, QueryRunner } from 'typeorm';

/** AI 配置多 profile 化：加 name / active 列，旧行回填为启用中的「默认配置」 */
export class AiConfigProfiles1763100000000 implements MigrationInterface {
  name = 'AiConfigProfiles1763100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_config" ADD COLUMN "name" varchar(120) NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "ai_config" ADD COLUMN "active" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`UPDATE "ai_config" SET "name" = '默认配置', "active" = true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_config" DROP COLUMN "active"`);
    await queryRunner.query(`ALTER TABLE "ai_config" DROP COLUMN "name"`);
  }
}
