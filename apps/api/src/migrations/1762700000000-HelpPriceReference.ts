import { MigrationInterface, QueryRunner } from 'typeorm';

export class HelpPriceReference1762700000000 implements MigrationInterface {
  name = 'HelpPriceReference1762700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "help_article"
      SET "title" = '上传装箱清单并获取参考报价',
          "summary" = '从下载模板到查看 BRL DDP 参考预估的完整流程。',
          "content" = $content$## 填写装箱清单
1. 在「工作台」下载当前启用的 Excel 模板。
2. 按实际情况填写品名、HS Code、箱数、尺寸、重量等字段，不要修改模板列名。
3. 保存文件后上传，需要时一并上传明细截图。

## 系统校验
系统会校验清单并重算相关公式。出现错误时，请根据行号和字段提示修改后重新上传。

## 查看参考报价
我司完成核算并发布后，在「我的报价」中打开订单，即可查看参考 DDP 总价、费用分项、AI DI 及后续物流信息。页面金额为参考预估，不构成最终报价或锁价承诺。$content$,
          "updated_at" = now()
      WHERE "app" = 'client' AND "slug" = 'excel-and-quotation'
    `);
    await queryRunner.query(`
      UPDATE "help_article"
      SET "title" = '为什么上传清单后还看不到参考报价？',
          "summary" = '了解清单上传、AI DI、运营核算和参考报价发布之间的关系。',
          "content" = $content$## 原因与处理
清单上传成功不代表参考报价已经生成。系统先进行 AI NCM/DI 核算，我司核对资料和费用后才能发布参考报价。
1. 先在「我的报价」查看订单当前状态和 AI DI 进度。
2. 如果上传时提示数据错误，请修改后重新上传。
3. 长时间未更新时，请提供报价号联系我司。$content$,
          "updated_at" = now()
      WHERE "app" = 'client' AND "slug" = 'quote-not-visible'
    `);
    await queryRunner.query(`
      INSERT INTO "help_article"
        ("id", "app", "category", "slug", "title", "summary", "content", "published", "featured", "sort_order", "created_at", "updated_at")
      VALUES
        ('9b1c6e32-7e2e-4e9b-a86f-7f76e6dcb2a1', 'client', 'faq', 'ddp-reference-price',
         '参考 DDP 价格如何计算？',
         '了解 AI DI、销售税务、综合运营费用与最终确认之间的关系。',
         $content$## 参考价组成
参考 DDP 总价包含国际海运费、其他成本、AI DI、销售环节税费及综合运营费用；国际海运费会单独列示，内部运营成本不向客户拆分。

## 为什么是参考价
AI 根据产品描述建议 NCM 和税率，系统再按当前汇率、费率及贸易条件估算。NCM、税率、汇率、附加费用和海关认定可能变化，因此页面金额不是最终账单。

## 最终确认
最终价格以我司书面确认、正式报价单及实际清关和账单文件为准。对金额有疑问时，请提供报价号联系运营人员。$content$,
         true, true, 45, now(), now())
      ON CONFLICT ("app", "slug") DO UPDATE SET
        "title" = EXCLUDED."title",
        "summary" = EXCLUDED."summary",
        "content" = EXCLUDED."content",
        "published" = true,
        "featured" = true,
        "updated_at" = now()
    `);
    await queryRunner.query(`
      UPDATE "help_article"
      SET "content" = $content$## 检查客户资料
- 核对 Excel 明细、品名、HS Code、箱数、重量和体积。
- 查看客户上传的明细截图与异常信息。
- 确认订单模板版本及数据校验结果。

## 核算并重新计算
1. 确认费率来源是客户覆盖还是全局默认。
2. 核对 AI NCM/DI，设置海运费、起运港杂费、汇率、20% 税基加成、销售税务和每票利润。
3. 销售税基 =（DI + 货值）×1.20 + 国际运费；参考 DDP = 税基×6.5% + DI + 国际运费 + 其他成本 + 利润；修改后重新计算并核对分项。

## 发布或标记异常
确认无误后将订单发布为 done，客户端随后可查看参考预估。资料或价格存在问题时不要盲目发布；使用失败状态并填写清晰原因。
> 客户侧金额始终标注为参考价，不能承诺锁价；最终以书面确认和正式账单为准。$content$,
          "updated_at" = now()
      WHERE "app" = 'ops' AND "slug" = 'order-review-and-publish'
    `);
    await queryRunner.query(`
      UPDATE "help_article"
      SET "content" = $content$## 费率解析规则
报价计算按“客户覆盖 > 全局默认”解析。全局调整会影响未设置覆盖的客户，客户覆盖只影响指定客户。

## 修改前检查
- 确认修改对象和影响范围。
- 核对海运费、港杂费、汇率、20% 税基加成、销售税务和每票利润。
- 税基加成默认 20%，销售税务默认 6.5%，每票利润默认 R$30,000。
- 保留准确的调整备注，便于审计追踪。

## 模板核对
模板预览用于确认当前启用版本及客户清单字段。核算时不要混用不同版本的列名和数据结构。$content$,
          "updated_at" = now()
      WHERE "app" = 'ops' AND "slug" = 'rates-and-template'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "help_article" WHERE "app" = 'client' AND "slug" = 'ddp-reference-price'`);
  }
}
