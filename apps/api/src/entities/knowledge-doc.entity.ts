import { BeforeInsert, Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import * as crypto from 'crypto';

/**
 * 内部知识库文档。
 * kind='price_table' 时 content 为结构化价目表 JSON（驱动确定性计价引擎）；
 * kind='doc' 时 content 为 Markdown 全文，chunks 为检索片段（注入 AI 话术）。
 */
@Entity('knowledge_doc')
@Index('IDX_knowledge_doc_kind_status', ['kind', 'status'])
export class KnowledgeDocEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @BeforeInsert()
  genId() { if (!this.id) this.id = crypto.randomUUID(); }

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 20 })
  kind!: 'price_table' | 'doc';

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  tags!: string[];

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: 'active' | 'archived';

  /** 仅 kind='price_table' 有意义：当前启用的价目表（同类最多一条） */
  @Column({ type: 'boolean', default: false })
  is_current!: boolean;

  @Column({ type: 'varchar', length: 60, default: '' })
  version!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  effective_date!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  source_file!: string | null;

  @Column({ type: 'varchar', length: 500, default: '' })
  summary!: string;

  /** price_table: JSON.stringify(PriceTable)；doc: Markdown 全文 */
  @Column({ type: 'text', default: '' })
  content!: string;

  /** 检索片段：{ heading, text }[]，避免把整篇文档塞进 prompt */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  chunks!: { heading: string; text: string }[];

  @Column({ type: 'varchar', length: 80, default: 'system' })
  created_by!: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at!: Date;
}
