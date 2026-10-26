# 诊断日志策略

日志的唯一用途是**出问题时定位具体错误**，不是记录用户操作流水。因此本项目的日志遵循
「按天分文件、超长自动切分、只记异常与关键诊断信息」三条原则。

## 1. 文件组织

- 位置：`~/.vela/logs/`（测试/隔离环境可用 `AI_NOVEL_VELA_HOME` 覆盖根目录）；
- 命名：`vela-YYYY-MM-DD.log`，按**本地自然日**切分；
- 单文件超过 5 MB 自动切分：`vela-YYYY-MM-DD.1.log`、`.2.log`…，不会出现无法打开的超大文件；
- 只保留最近 **14 天**，更早的文件在下一次写入时自动删除；
- 升级迁移：旧的单一文件 `vela.log` / `vela.log.1` 会按文件修改日期合并进对应的按天文件，不丢历史。

常量定义在 `electron/utils/app-log.ts`：`MAX_LOG_BYTES` = 5 MB，`LOG_RETENTION_DAYS` = 14。

## 2. 记录什么

每条记录是一行 JSON（便于 `grep` / `jq` / 脚本检索），字段：

```json
{"ts":"2026-10-26T02:00:00.000Z","level":"error","scope":"LLM","event":"discover-models failed","error":{"message":"...","stack":"...","code":"..."}}
```

- `level`：`error`（失败）或 `info`（少量关键状态/异常自愈）；
- `scope`：来源模块，如 `LLM`、`Agent`、`MCP`、`Skin`、`Knowledge`、`WindowLoad`、`RendererConsole`；
- `event`：可检索的短事件名；
- `error`：`message` / `stack` / `code`，用于定位到具体代码位置；
- 附加字段：少量结构化上下文（例如 `conversationId`、`serverId`、`line`、`sourceId`）。

会写入日志的内容：

- 未捕获异常、未处理的 Promise 拒绝（`MainProcess`）；
- IPC/主进程操作失败、外部依赖失败（模型、MCP、知识库、皮肤、会话存储等）；
- 窗口加载失败、渲染进程崩溃；
- Renderer 的 warning / error 控制台输出（跳过应用自身已结构化落盘的 `[Vela ...]` 行，避免重复）；
- 少量真正需要排查的异常自愈路径（例如 Agent lane 残留操作自动中止、运行时变更导致会话重建）。

## 3. 不记录什么（流水账）

- Renderer 的 `console.log` / `console.info` / verbose 输出；
- Agent 每轮提示的开始/结束、每次工具调用的 start/completed、每次生成完成；
- 正常的用户操作（打开/关闭页面、点击、切换模型等）——这些由界面自身反馈，不属于诊断信息；
- 可预期的业务拒绝（例如用户在导入确认页取消、参数校验失败返回给 UI 的错误）。

## 4. 排查方式

```bash
# 按日期看当天日志
ls ~/.vela/logs/
cat ~/.vela/logs/vela-2026-10-26.log

# 只找错误，按模块聚合
grep '"level":"error"' ~/.vela/logs/vela-2026-10-26*.log

# 定位某个会话/服务
grep 'conversationId":"<id>"' ~/.vela/logs/vela-2026-10-26*.log
grep '"scope":"MCP"' ~/.vela/logs/vela-2026-10-26*.log
```

## 5. 与 `llm_calls` 的区别

`llm_calls` 是项目 SQLite 里的**模型调用统计**（tokens/耗时/成功状态），用于模型面板与费用统计，
不是排查日志：它已经在写入侧限制为最近 1000 条，并可在「模型调用」面板手动清空。
诊断日志（本文档）只关心异常，二者不要混用。
