import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientVerification1761600000000 implements MigrationInterface {
  name = 'ClientVerification1761600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "client" ADD "verification_status" character varying(20) NOT NULL DEFAULT 'approved'`);
    await queryRunner.query(`ALTER TABLE "client" ADD "verification_note" text`);
    await queryRunner.query(`ALTER TABLE "client" ADD "verified_by" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "client" ADD "verified_at" timestamp`);
    await queryRunner.query(`ALTER TABLE "client" ADD "license_file_path" character varying(500)`);
    await queryRunner.query(`ALTER TABLE "client" ADD "license_file_name" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "client" ADD "license_mime_type" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "client" ADD "license_size_bytes" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "client" DROP COLUMN "license_size_bytes"`);
    await queryRunner.query(`ALTER TABLE "client" DROP COLUMN "license_mime_type"`);
    await queryRunner.query(`ALTER TABLE "client" DROP COLUMN "license_file_name"`);
    await queryRunner.query(`ALTER TABLE "client" DROP COLUMN "license_file_path"`);
    await queryRunner.query(`ALTER TABLE "client" DROP COLUMN "verified_at"`);
    await queryRunner.query(`ALTER TABLE "client" DROP COLUMN "verified_by"`);
    await queryRunner.query(`ALTER TABLE "client" DROP COLUMN "verification_note"`);
    await queryRunner.query(`ALTER TABLE "client" DROP COLUMN "verification_status"`);
  }
}
