# 生命周期闭环审计（检查「有创建，是否必有删除」）

> 审计日期：2026-10-26
> 审计范围：主进程 IPC（约 205 个渠道）、项目 SQLite（新建项目初始化后 35 张业务表，
> 含 `sqlite_sequence` 共 36 张物理表；页面见第二节「表数口径」）、21 个 Agent 工具、
> 渲染层可见的创建/删除入口。
> 结论性质：纯静态审计（对照创建入口、删除入口、级联清理、UI 入口四类证据）；
> 本文只记录事实与缺口，不在本轮改代码。

## 一、总览

- 上一轮已闭环：**审稿报告**（AI 报告 + 确认快照 + Tab + 修稿溯源；设计稿为本地临时产物，已删除未入库）。
- 本轮发现 **14 处仍未完全闭环**，分三类：
  - **A 类：数据只增不减（6 处）**——有创建、无删除/清理路径；
  - **B 类：能力不对称（4 处）**——产品能创建，但没有对应的关闭/删除动作；
  - **C 类：语义或范围待确认（4 处）**——有删除动作，但清理边界可能不符合预期。
- 其余 20+ 类资源已确认闭环（见第四节矩阵），本次不重复处理。
- **修复进度（2026-10-26 第二轮）**：已修复 6 项（A1、A2、A3、A4、A5、A6），
  剩余 8 项：B1、B2、B3、B4、C1、C2、C3、C4。详见第七、八节。

## 二、审计方法

**表数口径**（`electron/database-schema.ts` 里 `CREATE TABLE IF NOT EXISTS` 共 33 条语句 / 32 个表名，
`import_source_chapter_map` 为兼容旧库重复声明一次；另有两处迁移期临时表/旧表会被 DROP 或改名，
不常驻）。仓库层还有 5 张动态建表：

| 表 | 建表时机 |
| --- | --- |
| `character_roster_meta`、`character_roster_operations` | 初始化项目时（`database-schema.ts:982`） |
| `text_metric_versions` | 初始化项目时（字数单位迁移） |
| `blueprint_commit_operations`、`blueprint_character_sync_operations` | 首次蓝图提交/角色同步时（`blueprint-repository.ts:102`） |

因此：**新建项目刚初始化 = 35 张业务表（36 张物理表）**；蓝图提交/角色同步后最多
**37 张业务表（38 张物理表）**。历史项目可能因旧迁移残留额外表，以实际 `.vela/vela.db`
的 `sqlite_master` 为准。

1. 枚举 `src/shared/ipc-channels.ts` 全部渠道，筛出 `create/save/import/commit/delete/clear/revoke/remove/cancel` 语义词；
2. 枚举 `electron/repositories`、`electron/services` 内全部 `DELETE FROM` 语句（39 条），逐表比对「创建表」与「清理路径」；
3. 枚举 `electron/pi/tools/*` 的写动作与删除动作；
4. 对照渲染层入口（侧栏上下文菜单、设置页、编辑器按钮）确认「用户可见的创建」是否都有「用户可见的删除」；
5. 每条结论标注证据（`file:line`），复核命令见第六节。

## 三、未闭环清单

### A 类：只增不减（有创建、无任何清理路径）

#### A1. `llm_calls` 调用日志永久累积（高）

- 创建：每次主进程模型请求写一行 —— `electron/repositories/llm-repository.ts:20`；
  Agent 每次请求同样落一行 —— `electron/pi/agent-session.ts:438`。
- 读取：`electron/repositories/llm-repository.ts:59`、`:97`（只读）；
  底部面板「模型调用」每 2 秒拉最近 30 条 —— `src/components/panels/BottomPanel.tsx:721`。
- 缺失：全仓无 `DELETE FROM llm_calls`；项目「清空生成数据」也不含此表
  （`electron/repositories/project-clear-repository.ts:92-121`）。
- 影响：单项目随使用时长无限增长；项目清空/重置后旧调用记录仍在。
- 建议：定保留策略（如保留最近 N 天/最多 N 条），在打开项目时或「清空生成数据」时裁剪；
  设置页提供「清空调用记录」入口。

#### A2. `recovery_candidates` 已处理候选永久留存（中高）

- 创建：`electron/repositories/recovery-candidate-repository.ts:162`（生成中断时写入正文快照）；
- 处理：`resolve()` 只把 `status` 改为 `continued/discarded`（`:225-244`），`listPending()` 只查 pending（`:192`）；
- 缺失：无删除 IPC（渠道仅有 `db:recovery-candidate-list/record/update/resolve`），
  项目清空数据也不清理。
- 影响：每条已处理候选连同正文快照永久留在库里且 UI 不可见。
- 建议：`resolve` 时同事务删除该候选（或保留摘要、删正文快照），或提供保留期清理。

#### A3. 导入运行历史 8 张表无删除入口（中）

- 创建：`import_runs` + `import_run_chapters` + `import_run_sources` +
  `import_run_source_chapters` + `import_run_receipts` + `import_run_knowledge_receipts` +
  `import_reference_documents` + `import_source_aliases` / `import_source_chapter_map` /
  `import_legacy_identity_bridge` / `import_global_fact_operations`
  （建表见 `electron/database-schema.ts:232,383,427,442,461,476,484,493,502,523,543`）。
- 现有清理：仅解析阶段的临时运行会被删（`electron/repositories/import-run-parsing.ts:352-357`），
  以及「与既有章节完全重复」的解析运行（`:774`）。
- 缺失：成功/取消/失败后保留的运行没有删除 IPC，也没有「导入历史」UI；
  `restart` 会产生新 run，旧 run 保留（`electron/controllers/db-controller.ts:411` 起）。
- 影响：每次「导入小说 / 拆解仿写 / 作者原稿导入」都会留一套运行记录（含章节表与收据）。
- 建议：新增 `db:import-run-delete`（按 run 级联删子表 + 关联收据）与导入历史面板删除入口；
  或纳入「清空生成数据」范围。

#### A4. `chapter_deletion_operations` 完成记录不清理（低中）

- 创建/更新：`electron/repositories/chapter-deletion-repository.ts:198`、`:168`、`:263`；
- 缺失：全仓无 `DELETE FROM chapter_deletion_operations`；只提供
  `chapter:list-incomplete-deletions` 查询未完成项。
- 影响：每次删除定稿章节留一条操作记录（含文件名/知识库 id/错误），只增不减。
- 建议：完成且成功后归档/删除（或纳入项目清空范围）；失败记录保留用于重试属合理，但需上限或归档策略。

#### A5. 幂等收据 / 操作日志只增不减（中）

| 表 | 创建 | 现有清理 |
| --- | --- | --- |
| `character_roster_operations` | `electron/repositories/character-roster-repository.ts:1035` | 仅「清空项目数据 → 角色」`project-clear-repository.ts:118` |
| `blueprint_commit_operations` | `electron/repositories/blueprint-repository.ts:599` | 仅「清空章节蓝图」`blueprint-repository.ts:156-157` |
| `blueprint_character_sync_operations` | `blueprint-repository.ts:132` | 同上 |
| `finalized_draft_import_operations` | 定稿导入收据 | 仅项目清空（`project-clear-repository.ts:96`） |
| `import_global_fact_operations` | `electron/repositories/import-global-facts-repository.ts:175` | 无 |

- 影响：每次蓝图提交/角色名单提交/蓝图角色同步/定稿导入都追加收据行；正常使用中永不清理，
  只有「清空蓝图」或「清空项目」才会成批删除。
- 建议：明确「收据保留期」（如按 `created_at` 保留 30 天）并在打开项目时 prune；
  或按 operation 完成/过期清理，保留最近一次用于幂等。

#### A6. `post_process_runs/steps` 重复定稿会累积（低中）

- 创建：`db:post-process-create-run`；每次定稿/架构提取创建 run 与 steps。
- 现有清理：仅章节删除（`chapter-deletion-repository.ts:111`）与项目清空
  （`project-clear-repository.ts:97-98`）。
- 缺失：重新定稿同一章会追加新 run，旧 run 无清理入口（无 UI 历史）。
- 建议：定稿重跑时按 `trigger_source` 合并/覆盖旧 run，或章节删除/项目清空之外提供 prune。

### B 类：能力不对称（能创建，产品内无删除路径）

#### B1. 物理文件没有删除能力（中）

- 现状：`fs:*` 渠道只有 read/list/write/mkdir/check/grant（`src/shared/ipc-channels.ts:366-408`），
  **没有 delete/rm**；Agent 仅 `write`/`edit` 能创建文件，删除只能靠 general 助手的 `bash rm`
  或用户进入操作系统；项目树也没有「删除文件」菜单（`src/components/panels/sidebar/ProjectTree.tsx:291-340`）。
- 影响：Agent/导入产生的项目内物理文件（非定稿正文、非数据库事实）只能绕过产品删除。
- 建议：新增受控 `fs:delete`（限定项目根 + 沙箱校验）与对应工具/右键菜单；
  或明确「物理文件不在产品生命周期内」的边界并写进文档。

#### B2. 编辑器 Tab 只有审稿报告能被 Agent 关闭（低）

- `open_editor` 可以打开任意内置页（config/blueprints/characters/architecture/synopsis 等），
  但 `close_editor_tab` 的动作联合类型只允许 `target: 'review-report'`
  （`src/shared/agent-events.ts:59`）。
- 影响：Agent 能开不能关，用户需手动关；属于体验层面的不对称。
- 建议：扩展 `close_editor_tab` 的 target（builtin editor / file / chapter 等），或在 `open_editor`
  文档中明确「打开的页面由用户关闭」。

#### B3. 设定/架构写工具没有显式「清除」动作（低）

- `novel_config` / `story_architecture` 工具只有写入（覆盖字段），没有 clear/reset 动作；
  UI 侧支持清空字段（写空字符串），因此「删除」只能靠覆盖为空，语义不显式。
- 建议：文档化「空值即清除」，或补 `clear` 动作（与 UI 清空按钮共用同一存储路径）。

#### B4. 审稿助手角色内不能删除自己创建的报告（设计边界，待确认）

- 审稿助手工具集只读 + `submit_chapter_review`（`electron/pi/tool-builder.ts:160-179`），
  删除工具 `delete_review_report` 只在 general 主助手与渲染层入口暴露。
- 产品层面闭环（用户/主助手可删），但「创建者角色无法撤销自己的产物」是刻意边界，需产品确认是否保留。

### C 类：语义或范围待确认

#### C1. 「清空剧情树」与「叙事线索」不同步（待确认）

- `db:plot-tree-clear` 只执行 `UPDATE project_core SET plot_tree_snapshot = ''`
  （`electron/repositories/plot-tree-repository.ts:142-147`），
  不触碰 `narrative_thread_plans` / `narrative_thread_confirmations`。
- 若两者属于同一数据域（`NarrativeThreadEditor` 同时承载剧情树与叙事线索），
  「清空剧情树」后叙事线索仍保留，语义不完整；若视为两类用户数据则合理，需要明确文案。

#### C2. 项目「清空生成数据」的覆盖范围与实际删除表不一致（低）

- UI 文案承诺：草稿、定稿正文、修订、审稿报告、后处理记录、全局摘要快照
  （`src/components/dialogs/ClearProjectDataDialog.tsx:48-53`）。
- 实际 `generatedText` 还删除 `finalized_draft_import_operations`
  （`project-clear-repository.ts:96`），但不清理 `llm_calls`、导入运行历史、`recovery_candidates`、
  `chapter_deletion_operations`、`consistency_exemptions`、`study_dossiers`。
- 影响：用户执行「清空项目数据」后，项目库仍保留大量历史轨迹；不是 bug，但「重置」不彻底。
- 建议：定义「清空」的准确语义（生成事实 vs 所有历史日志），据此补表或调整文案。

#### C3. 重新确认会追加新的确认快照行（低）

- 每次「确认审稿清单」都会新建一条 `kind='confirmation'` 记录（`src/components/editor/ReviewReport.tsx:365-373`）；
  这些行已从报告清单隐藏、并随来源报告级联删除，但**重确认本身不自动裁剪旧快照**。
- 影响：反复确认会累积派生快照（不可见，最终随报告删除清理）。
- 建议：若在意体积，可改为「同一来源报告只保留最新确认快照」（删除旧快照前需处理 pending 修稿引用）。

#### C4. `consistency_exemptions` 的撤销是逻辑删除（低，可选）

- `revoke` 仅 `UPDATE ... SET revoked = 1`（`electron/repositories/consistency-exemption-repository.ts:31-36`），
  行永久保留；以 `stable_fact_key` 唯一键为界，体量有限。
- 属合理的可审计逻辑删除，但需在文档中明确「撤销≠删除」。

## 四、已确认闭环的资源（对照矩阵）

| 资源 | 创建 | 删除 / 清理 | 证据 |
| --- | --- | --- | --- |
| 审稿报告 + 确认快照 | 审稿助手 / 确认清单 | 报告页垃圾桶 / 侧栏右键 / `delete_review_report`；快照随父级联 | 上轮实现（`review-repository.ts`、`ReviewReport.tsx`），设计稿为本地临时产物已删除 |
| 草稿 / 定稿 / 修订 / 摘要快照 / 标注 / 正文内容池 | AI 工作流 / 定稿 / 修稿 | 草稿删除、章节删除、清空项目；内容按引用计数回收 | `draft-repository.ts:479-520`、`chapter-deletion-repository.ts:95-120`、`project-clear-repository.ts:92-121` |
| 定稿正文物理稿 + 关联知识库文档 | 定稿发布 | 章节删除（正文文件 + 知识文档 + 后处理 run） | `chapter-deletion-service.ts:24-34`、`chapter-deletion-repository.ts:111-116` |
| 知识库文档 / 向量 | 导入 / 定稿 | `kb:remove-document`、`kb:clear-all`，向量按 docId 删除 | `electron/controllers/kb-controller.ts:238`、`electron/vector-documents.ts:462-510` |
| 角色 | 角色编辑器 / 工具 | 角色删除（含关系清理）、角色名单清空 | `CharacterEditor.tsx:91`、`project-clear-repository.ts:115-119` |
| 章节蓝图 | 蓝图助手 / 用户编辑 | 单章删除 / 范围删除 / 全部清空 | `blueprint-repository.ts:152-159` |
| 叙事线索计划 | 叙事线索编辑器 | `deletePlan`（确认事件随 FK 级联） | `narrative-thread-repository.ts:70`、schema FK `:372` |
| 研究（拆解）档案 | 拆解导入 | `db:study-dossier-delete` | `study-dossier-repository.ts:131-137` |
| 导入解析临时运行 | 导入 | 解析失败/完全重复自动删除 | `import-run-parsing.ts:352-357`、`:774` |
| 定稿 outbox 收据 | 定稿 | 草稿删除 FK 级联 | schema `finalization_outbox` FK `:189` |
| 对话会话（含 .jsonl） | Agent 新建 | 删除单条 + 清空全部；`store.delete` 删文件 | `AgentConversation.tsx:409`、`agent-conversation-store.ts:214-223` |
| 技能（用户 Skill） | 工具创建/安装 | 工具 delete / 设置页 uninstall（删目录） | `manage-skills.tool.ts`、`app-data-controller.ts:236-244` |
| MCP 服务器 | 设置页保存 | `mcp:delete-server` | `src/shared/ipc-channels.ts`、mcp controller |
| 模型 / 渠道 | 设置页保存 | `llm:delete-model`（同时清默认引用） | `llm-controller.ts:314-350` |
| 提示词预设 | 保存 | `prompt:delete-global` | `app-data-controller.ts` |
| 自定义皮肤资源 | 导入 | `remove-custom`（写 manifest + 清理资源文件） | `skin-service.ts:323-342` |
| 最近项目 / 项目 | 创建/打开 | 移除最近项 / 删除项目（删目录 + 关库） | `project-controller.ts:633-720` |
| 底部面板日志 | 运行日志 | 「清空日志」（内存态） | `BottomPanel.tsx:615` |
| 诊断日志文件 | `app:append-diagnostic-log` | 文件大小超限自动轮转 | `electron/utils/app-log.ts:13-26` |

## 五、建议修复顺序

**P0（只增不减且体量会持续增长）**

1. A1 `llm_calls`：保留策略 + 手动清空 + 项目清空覆盖；
2. A2 `recovery_candidates`：resolve 即清理（或保留期）；
3. A3 导入运行历史：删除 IPC + 导入历史入口（或纳入清空项目）。

**P1（能力不对称 / 结构性缺口）**

4. B1 物理文件删除能力（受控 `fs:delete` + 工具/右键菜单）；
5. B2 `close_editor_tab` 扩展到通用 Tab；
6. A5 幂等收据保留期 prune。

**P2（范围与语义）**

7. A4、A6 完成记录/重复 run 的归档策略；
8. C1 剧情树清空语义确认；
9. C2 「清空项目数据」范围定义（补表或修文案）；
10. C3 确认快照保留策略；B3 显式 clear 动作；B4 角色边界确认。

## 六、复核命令

```bash
# 全部 IPC 渠道
grep -oE "^  '[a-z-]+:[a-z-]+'" src/shared/ipc-channels.ts | tr -d " '" | sort

# 全部 DELETE 语句
grep -rn "DELETE FROM" electron/repositories electron/services --include=*.ts | grep -v __tests__

# 可疑表：是否真的没有删除路径
grep -rn "DELETE FROM llm_calls\|DELETE FROM recovery_candidates\|DELETE FROM chapter_deletion_operations" electron
grep -rn "DELETE FROM import_run\|DELETE FROM import_global_fact_operations" electron
grep -rn "DELETE FROM character_roster_operations\|DELETE FROM blueprint_commit_operations" electron

# 审稿闭环回归证据
grep -n "kind\|source_review_id" electron/repositories/review-repository.ts | head

# 实际表清单（临时项目初始化后查 sqlite_master）
# 预期：35 张业务表 + sqlite_sequence = 36 张物理表；蓝图提交后 +2
```

---

## 七、修复进度（2026-10-26 第二轮：先补数据只增不减与导入历史）

### 已修复

| 编号 | 修复内容 | 落点 | 验证 |
| --- | --- | --- | --- |
| A1 | 调用日志有界化：每次写入只保留最近 1000 条；新增 `db:llm-calls-clear` + 模型面板「清空调用记录」按钮（二次确认），项目清空不涉及但日志已有界且可手动清 | `electron/repositories/llm-repository.ts`（`MAX_LLM_CALL_RECORDS`、`clearAll`）、`db-controller.ts`、`src/services/stats-service.ts`、`BottomPanel.tsx` | `llm-repository.test.ts`（1005 条→1000 条、清空计数） |
| A2 | 恢复候选「处理即清理」：`resolve` 在事务内解除替代链引用后删除该行；项目「清空生成数据」也删除恢复候选 | `recovery-candidate-repository.ts`、`project-clear-repository.ts` | `recovery-candidate-repository.test.ts`（6 例，含替代链 FK） |
| A3 | 导入历史闭环：新增 `db:import-run-list-recent` / `db:import-run-delete`（运行中/租约活跃拒绝删除；级联清理章节快照与收据，不删已导入内容与跨运行映射）；ImportNovel / 作者原稿导入 / 拆解仿写三个对话框加「导入历史」查看+删除（二次确认） | `import-run-store.ts`、`import-run-repository.ts`、`ipc-channels.ts`、`db-controller.ts`、`src/components/dialogs/ImportRunHistory.tsx` + 三个对话框 | `import-run-repository.test.ts`（32 例，新增删除/运行中拒绝/缺失）、`ImportRunHistory.browser.tsx`（2 例） |
| A4 | 章节删除操作记录：完成超过 30 天的记录在下次开始删除时清理（保留近期审计） | `chapter-deletion-repository.ts`（`begin`） | 现有章节删除测试回归 |
| A6 | 后处理跑批：同一触发源只保留最新一次 run（旧 run 与步骤级联清理，界面只读最新 run） | `post-process-repository.ts`（`createRun` 事务内 DELETE） | `post-process-repository.test.ts`（新增同源覆盖断言） |

### 仍待处理

- **A5** 已按“中期规范化”完成：四张领域收据表迁移到通用 `idempotency_keys`（90 天 TTL），
  蓝图角色同步队列完成即删；详见第八节；
- **B1** 物理文件删除能力；**B2** 通用 Tab 关闭；**B3** 设定/架构显式 clear；**B4** 审稿助手角色边界确认；
- **C1** 剧情树清空与叙事线索的语义；**C2** 项目清空范围定义；**C3** 确认快照保留策略；
- **C4** `consistency_exemptions` 逻辑删除（可接受，待文档说明）。

### 复核命令补充

```bash
# 调用日志有界 & 清理入口
grep -n "MAX_LLM_CALL_RECORDS\|static clearAll" electron/repositories/llm-repository.ts
grep -n "db:llm-calls-clear" src/shared/ipc-channels.ts electron/controllers/db-controller.ts

# 恢复候选处理即清理
grep -n "处理即清理" -A 8 electron/repositories/recovery-candidate-repository.ts

# 导入历史删除
grep -n "db:import-run-delete\|db:import-run-list-recent" src/shared/ipc-channels.ts
grep -n "deleteTerminalRun" -A 20 electron/repositories/import-run-store.ts

# 后处理同源去重
grep -n "只保留最新一次跑批" -A 6 electron/repositories/post-process-repository.ts
```

---

## 八、幂等收据规范化（2026-10-26 第三轮，A5 根治）

### 设计

- 新增通用表 `idempotency_keys(scope, key, request_hash, response_json, created_at)`：
  所有“客户端可能重试、只能生效一次”的写操作共用一张表，按 `(scope, key)` 唯一定位；
- scope 固定为四个领域：`character-roster`、`blueprint-commit`、`finalized-draft-import`、
  `import-global-facts`；`response_json` 保存首次执行结果，重试时直接复用；
- 只保留最近 **90 天**（`IDEMPOTENCY_RETENTION_DAYS`），项目打开时统一 prune，
  不再出现只增不减的收据表；
- 旧库迁移：启动时把 `character_roster_operations` / `blueprint_commit_operations` /
  `finalized_draft_import_operations` / `import_global_fact_operations` 的数据迁入
  `idempotency_keys` 后 **DROP 旧表**；迁移幂等，可重复打开项目；
- 蓝图角色同步：保留 `blueprint_character_sync_operations` 作为 **pending 队列**，
  同步完成后把完成回执合并进蓝图提交的幂等结果，并删除队列行；
  未完成阶段仍以队列行为权威证据，队列缺失/被篡改时 fail closed；
- 清空语义同步收口：清空生成数据 → `finalized-draft-import`；清空蓝图 → `blueprint-commit`
  + 同步队列；清空角色/架构 → `character-roster` + `import-global-facts`。

### 代码落点

| 文件 | 作用 |
| --- | --- |
| `src/shared/idempotency.ts` | scope / 保留期共享契约 |
| `electron/repositories/idempotency-repository.ts` | find / put / updateResponse / deleteScope / prune |
| `electron/repositories/idempotency-schema.ts` | 通用表 DDL（纯依赖，供各仓储复用） |
| `electron/services/receipt-table-migration.ts` | 四张旧表迁移 + 同步队列表重建 + 旧表 DROP |
| `electron/database-schema.ts` | 建表、启动迁移、90 天 prune |
| `character-roster-repository.ts`、`blueprint-repository.ts`、`finalized-draft-import-repository.ts`、`import-global-facts-repository.ts` | 幂等逻辑改用通用表 |
| `draft-repository.ts`、`project-clear-repository.ts` | 清空范围改为按 scope 删除幂等记录 |

### 验证

- 新增 `electron/__tests__/idempotency-migration.test.ts`（3 例）：旧表迁移与删除、
  已完成同步回执合并、pending 队列保留、90 天 TTL prune、新项目不创建旧表；
- 更新现有测试：角色名单 32 例、蓝图 19 例、定稿导入 12 例、全局事实 3 例、
  import-run effect 收据 22 例、项目清空 11 例全部通过；
- `tsc --noEmit`、ESLint 通过；全量浏览器/单元回归见提交说明。
