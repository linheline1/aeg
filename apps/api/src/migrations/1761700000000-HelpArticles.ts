import { MigrationInterface, QueryRunner } from 'typeorm';
import * as crypto from 'crypto';
import { HELP_ARTICLE_SEED } from '../common/help-seed';

export class HelpArticles1761700000000 implements MigrationInterface {
  name = 'HelpArticles1761700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "help_article" (
        "id" uuid NOT NULL,
        "app" character varying(20) NOT NULL,
        "category" character varying(50) NOT NULL,
        "slug" character varying(100) NOT NULL,
        "title" character varying(200) NOT NULL,
        "summary" character varying(500) NOT NULL,
        "content" text NOT NULL,
        "published" boolean NOT NULL DEFAULT true,
        "featured" boolean NOT NULL DEFAULT false,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_help_article" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_help_article_app_slug" ON "help_article" ("app", "slug")`);
    await queryRunner.query(`CREATE INDEX "IDX_help_article_app" ON "help_article" ("app")`);

    for (const article of HELP_ARTICLE_SEED) {
      const now = new Date().toISOString();
      await queryRunner.query(
        `INSERT INTO "help_article" ("id", "app", "category", "slug", "title", "summary", "content", "published", "featured", "sort_order", "created_at", "updated_at") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [crypto.randomUUID(), article.app, article.category, article.slug, article.title, article.summary, article.content, article.published, article.featured, article.sort_order, now, now]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "help_article"`);
  }
}
