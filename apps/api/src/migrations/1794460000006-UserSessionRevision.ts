import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserSessionRevision1794460000006 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query('ALTER TABLE "user" ADD COLUMN session_revision uuid');
  }

  async down(runner: QueryRunner) {
    await runner.query('ALTER TABLE "user" DROP COLUMN session_revision');
  }
}
