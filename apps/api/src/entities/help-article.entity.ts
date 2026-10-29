import { BeforeInsert, Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import * as crypto from 'crypto';

@Entity('help_article')
@Index('IDX_help_article_app_slug', ['app', 'slug'], { unique: true })
export class HelpArticleEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @BeforeInsert()
  genId() { if (!this.id) this.id = crypto.randomUUID(); }

  @Index()
  @Column({ type: 'varchar', length: 20 })
  app!: 'client' | 'ops';

  @Column({ type: 'varchar', length: 50 })
  category!: string;

  @Column({ type: 'varchar', length: 100 })
  slug!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 500 })
  summary!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'boolean', default: true })
  published!: boolean;

  @Column({ type: 'boolean', default: false })
  featured!: boolean;

  @Column({ type: 'integer', default: 0 })
  sort_order!: number;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
