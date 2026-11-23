# 报价回归测试

在仓库根目录使用 Node.js 22 与 `package.json` 固定的 pnpm 版本运行。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

常规用例包括美元金额原币校验、Excel 图片关联、NCM 模型结果校验、DI/DDP 计算和报价接口的角色权限。测试生成合成 Excel，通过临时目录保存附件，并在本机随机端口启动权限测试 API。模型请求使用固定模拟响应。

任务回归还覆盖跨重启读取检查点、租约过期后恢复、HTTP 402 停止自动调用、只重试失败行及旧 DI 结果的版本保护。PostgreSQL 用例也会验证任务表迁移、检查点持久化及 DI 条件写入。

PostgreSQL 用例需要一个独立的本机 PostgreSQL 15 实例及专用数据库 `aeg_quote_test`。配置 `AEG_TEST_PG_URL` 指向该数据库后，在仓库根目录运行以下命令。

```sh
pnpm --filter @aeg/api test:postgres
```

该用例会运行正式迁移。测试业务数据在事务中回滚，数据库结构和迁移记录保留以供重复运行。请使用专用测试库。

GitHub Actions 在拉取请求、向 `main` 或 `development` 推送及手动触发时，启动隔离的 PostgreSQL 服务并执行全部检查。

部署可恢复任务前，需先运行 `QuoteAiTasks1794460000001` 迁移，随后重启 API 并发布使用任务接口的前端。已入队任务每批保存检查点。进程中止时，未保存的批次会在租约到期后重新提交给模型，已保存的成功行直接复用。HTTP 402 任务在手动重试前保持失败或部分完成状态。
