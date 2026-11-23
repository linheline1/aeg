# Hostinger 发布与恢复

在 VPS 的 `/opt/aeg-ddp` 拉取待发布提交后，运行 `bash deploy/hostinger/update.sh`。脚本在独立发布目录构建并保留 API、依赖和四端静态产物，发布前检查五个构建版本。切换后检查四端入口、实际入口 JS 和 API 版本。任一验证失败时，回退前端链接和 API，并重新检查。保留最近两版对应的目录及工作树。首次从旧脚本升级时会捕获当前 API 与四端的配对版本，旧版依赖仍由原应用目录提供。

待执行的数据库迁移默认阻止发布。只有确认新旧 API 同时兼容新结构，且完成同批备份后，才使用 `update.sh --allow-compatible-migrations`。需要不兼容迁移时另行安排维护窗口和数据库恢复步骤。代码回滚不会逆向执行数据库迁移。

维护窗口内可用 `bash deploy/hostinger/backup.sh ddpserver /var/backups/aeg` 成套备份。先配置 PostgreSQL 客户端认证（如受限权限的 `.pgpass`），不要把密码写入命令。脚本暂停 API，备份数据库、上传附件和本地运行数据，并生成校验和，退出时恢复服务。确保维护期间没有其他写入者。把验证通过的备份复制到受控的异机存储。

用隔离实例和同一批备份执行 `bash deploy/hostinger/restore-drill.sh /path/to/backup`。脚本在本机 PostgreSQL 创建临时库，恢复数据并核对报价、图片与订单附件的文件引用，输出耗时，结束后清理临时库和目录。运行账户需要创建临时库权限。生产恢复由维护人员根据演练结果单独执行。

人工回滚使用 `bash deploy/hostinger/rollback.sh`，先确认数据库仍兼容上一版。脚本验证上一版 API、四端及资源，若失败会重新激活操作前的版本。
