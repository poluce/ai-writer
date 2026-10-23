# 主 Agent 架构 · 代码现状与差距（CODE-REVIEW）

> 基线：`main` 分支 `a17bddf`（v0.1.4，2026-10-23），`ui-dev` 已同步。

这份文档不看设计稿，只回答三个问题：现在代码到底在做什么、主 Agent 架构缺什么、要改哪些文件。

---

## 一句话结论

你要的架构**后端已经存在大半**：主助手（general）本来就有直接写正文的工具，也有 `delegate_to_assistant` 可以委派架构/蓝图助手，子会话复用、忙碌排队、计划/写作模式、确认卡都已实现。

真正缺的是三块：

1. **委托的结果没有结构化**：委派完成后只回一段工具文本，主会话里是一张普通 Tool 卡，没有委托卡、没有子会话链接、没有汇总变更；
2. **子助手写入绕过了确认**：委派执行被强制切到 writing 模式，子助手的领域工具直接落盘，用户没有统一确认的机会；
3. **面板之间没有父子关系**：架构/蓝图助手是三个并列的右侧视图，不能从主会话的委托进入对应子会话，也没有"返回主对话"的语义。

另外发现一处现存断链：编辑器里的**行内 diff 提案实际不生效**，因为判断用的工具名 `replace_draft_excerpt` 与真实工具名 `manage_drafts` 对不上（见第 4 节）。

---

## 1. 现有后端行为

### 1.1 四类助手与各自工具集（0.1.4）

- 类型：`general`（项目助手）、`architect`（架构助手）、`blueprint`（章节蓝图助手）、`review`（审稿助手）。
  见 `src/shared/agent-conversation-archive.ts:16`、`assistantTypeFromConversationId`。
- 唯一分发点：`buildToolsForAssistantType(assistantType, ...)`。
  见 `electron/pi/tool-builder.ts:183-208`。
- 通用助手：完整项目工具 + `delegate_to_assistant` + Pi 执行工具 `read/write/edit/bash`。
  见 `electron/pi/tool-builder.ts:64-100`、`execution-tools.ts:26-35`。
- 架构助手：领域工具，不挂 `write/edit/bash/manage_drafts`。
  见 `tool-builder.ts:126-150`、`agent-session-manager.ts:402-410`。
- 蓝图助手：`propose_chapter_blueprint`、`manage_characters`、读取类工具，不挂底层写工具。
  见 `tool-builder.ts:158-175`。
- **审稿助手（0.1.4 新增）**：只读审查角色。工具为 `read_project_state`、`read_architecture`、`read_blueprint`、`read_continuity_facts`、`manage_drafts(readOnly)`、`manage_characters(readOnly)`、`search_knowledge`、`read_file`、`open_editor`，**唯一写工具是 `submit_chapter_review`**；不挂执行工具。
  见 `tool-builder.ts:152-177`、`tools/submit-chapter-review.tool.ts`、`agent-system-prompt.ts:121-146`。
- 主助手系统提示词仍只描述 architect / blueprint 两种委派对象；审稿助手不在委派枚举里。
  见 `agent-system-prompt.ts:44-60`、`tools/delegate-to-assistant.tool.ts:13-17`。

### 1.2 委派机制（已存在）

- 工具：`delegate_to_assistant({ assistant: 'architect' | 'blueprint', task, context })`，`isWriteOperation: true`。
  见 `electron/pi/tools/delegate-to-assistant.tool.ts:39-80`。
- 执行：`delegateTask()` 查找目标助手的会话；有则复用最近一个，没有才新建；忙碌时压入目标会话的 FIFO 队列。
  见 `electron/pi/agent-session-manager.ts:198-252`、`electron/pi/conversation-queue.ts`。
- **强制 writing 模式**："委派执行强制使用 writing 模式（自动执行领域工具落盘，避免弹窗阻断委派流）"。
  见 `electron/pi/agent-session-manager.ts:269-270`。
- 返回：子助手完整回复文本 + `conversationId`，作为工具结果回给主助手继续。
  见 `electron/pi/tools/delegate-to-assistant.tool.ts:73-85`、`agent-session-manager.ts:281-287`。
- 取消：主会话 abort 时，通过内存里的 `delegatedChildren` 映射联动终止子会话与排队任务。
  见 `electron/pi/agent-session-manager.ts:88-89, 173-180`。
- **没有持久化的父子关系**：`delegatedChildren` 只在内存里，进程重启后父子关系丢失；会话元数据只有 `assistantType`。
  见 `electron/pi/agent-session-manager.ts:88-89`、`src/shared/agent-conversation-archive.ts:16-31`。
- **委派目标仍只有 architect / blueprint**：审稿助手 `review` 不能被主助手调用，只能由用户切到审稿面板使用。
  见 `electron/pi/tools/delegate-to-assistant.tool.ts:13-17`、`tool-builder.ts:183-208`。

### 1.3 确认与执行模式

- 会话级 `executionMode: 'plan' | 'writing'`，默认 plan（localStorage 持久化）。
  见 `electron/pi/agent-session.ts:145, 476`、`src/stores/agent-store.ts:306-325`。
- **writing 模式**：除 `bash` 与 MCP/技能安装外，所有创作工具自动放行、不弹确认。
  见 `electron/pi/agent-session.ts:320-324`。
- **plan 模式**：工具在 `confirmationToolNames` 名单里、且 `isWriteOperation()` 判定为写时才确认。
  见 `electron/pi/agent-session.ts:326-338`、`electron/pi/tool-builder.ts:180-200`。
- 委派工具本身也在确认名单里：plan 模式下主助手委派前会先让用户确认。
- 确认事件：`tool_call_confirm` 发给渲染层，用户点批准后 `agent:confirm` 回到对应会话。
  见 `src/shared/agent-events.ts:13-21`、`src/stores/agent-store.ts:900-935`。

### 1.4 主助手"直接修改"的路径

- 正文：`manage_drafts` 工具（`write` 新建版本 / `replace_excerpt` 局部替换 / `delete` 等）。
  见 `electron/pi/tools/manage-drafts.tool.ts`。
- 文件：Pi harness 的 `write/edit`，走 `ConfinedExecutionEnv` 原子写，逐次确认。
  见 `electron/pi/execution-tools.ts:26-35`、`electron/pi/agent-session.ts:344-353`。
- 领域事实：`novel_config`、`story_architecture`、`propose_chapter_blueprint` 等受控 Seam。
- 写入后通过 `rendererAction` 让前端刷新编辑器/数据库视图。
  见 `src/services/agent/renderer-actions.ts:40-75`、`src/shared/agent-events.ts:35-52`。

### 1.5 0.1.4 主要变化

- 新增只读审稿助手 `review`，接管原工作流的 AI 审稿链路（旧链路已移除）；审稿报告以 `src/shared/review-contract.ts` 为唯一合同，`submit_chapter_review` 绑定草稿版本（`expectedSource`），草稿中途变化会被拒绝。
- 模型路由：`review` 走创作环节 `review`；`architect` / `blueprint` 走 `planning`；`general` 走 `general`（`agent-ipc.ts:35-40`、`agent-session-manager.ts:384-392`）。
- 工具分发与助手类型收口：`buildToolsForAssistantType()` 成为唯一分发点，会话类型可由 ID 前缀解析（`assistantTypeFromConversationId`）。
- 架构重构：新增 `test/layering-contract.test.ts` 守护分层（Store/Service/Shared 不得依赖 components；`src/shared` 是叶子；主进程运行时不得进入渲染层；运行时依赖图无环；弹窗统一走 `dialog-port`）。
- 新增共享合同：`review-contract.ts`、`domain-data.ts`、`workflow-status.ts`。

---

## 2. 现有前端行为

### 2.1 四个并列的助手面板

- `RightToolWindowBar` 现在提供五个入口：AI 助手、架构助手、蓝图助手、审稿助手、AI 输出。
  见 `src/components/layout/RightToolWindowBar.tsx`、`src/stores/layout-store.ts:10`（`RightView` 已含 `review`）。
- `App.tsx` 根据 `rightView` 只渲染其中一个面板，审稿面板为 `ReviewPanel`。
  见 `src/App.tsx:313-322`。
- 四个助手面板共用 `AgentConversation` + `AgentHeader`，类型文案集中在 `assistant-ui-copy.ts`。
  见 `src/components/panels/ReviewPanel.tsx`、`ArchitectPanel.tsx`、`BlueprintPanel.tsx`、`agent/assistant-ui-copy.ts`。
- 每个助手各自维护活跃会话：`activeConversationId` / `activeArchitectConversationId` / `activeBlueprintConversationId`。
  见 `src/stores/agent-store.ts:89-96, 342-356`。

### 2.2 会话与消息渲染

- 消息里的工具调用统一渲染成 `ToolCallBlock`（Wrench + 工具名 + 状态 + 展开 JSON/结果）或 `ConfirmCard`。
  见 `src/components/panels/agent/AgentMessage.tsx:74-76`、`ToolCallBlock.tsx:15-100`。
- `delegate_to_assistant` **没有专门渲染**：它和别的工具一样是一张普通工具卡，子助手返回的长文本塞在结果里。
- 产物卡片只识别 `write/edit`、`open_editor`、工作流启动等；`delegate_to_assistant` 的 `details` 里有 `assistant / conversationId / result`，但没有映射成 UI。
  见 `src/shared/agent-artifacts.ts:60-100`、`delegate-to-assistant.tool.ts:73-85`。
- 确认卡对 `novel_config`、`propose_chapter_blueprint` 会渲染字段 diff；对 `manage_drafts` 只显示参数描述。
  见 `src/components/panels/agent/ConfirmCard.tsx:70-130`、`DomainProposalDiff.tsx`。

### 2.3 会话存储

- 会话是 Pi 原生 JSONL；元数据只有标题、模型、思考等级、`assistantType`。
  见 `src/shared/agent-conversation-archive.ts:16-31`、`electron/pi/agent-conversation-store.ts:368-386`。
- 没有 `parentConversationId`、`delegatedBy`、`delegationId` 这类字段，重启后无法还原"这条子会话来自哪次委派"。

---

## 3. 目标架构 vs 现状

| 目标能力 | 现状 | 差距 |
| :--- | :--- | :--- |
| 用户只和主助手对话 | 右栏可在 AI 助手/架构/蓝图之间切换，默认 AI 助手 | 三个入口并列，子助手会"出现"在界面上；需要明确主助手为唯一默认入口 |
| 主助手直接修改 | `manage_drafts`、`write/edit`、领域工具都已具备 | 缺少"变更卡 / 文档内标注 / 撤销"的统一表现；直接修改在 writing 模式下无确认 |
| 主助手委托子助手 | `delegate_to_assistant` 已实现，会话复用 + FIFO 排队 | 委托结果只是一段 tool 文本；主会话里没有委托卡、进度、结果摘要、跳转 |
| 子助手修改内容 | 子助手可调用领域工具，但被强制 writing 模式直接落盘 | 没有统一确认；用户看不到子助手改了什么；失败/冲突处理弱 |
| 统一确认 | 每个会话各自弹确认；委派绕过确认 | 需要把子助手写入降级为提案，或把子会话确认上抛到主会话 |
| 下钻到子助手 | 可切换右侧面板，但与会话无父子链接 | 无法从委托卡进入对应子会话；无"返回主对话"；返回后没有结论回流 |
| 审稿助手 | 独立只读面板，`submit_chapter_review` 落报告 | 主助手无法委派审稿；是否允许主助手调用需要产品决定 |
| 子助手问题回主助手 | 子助手只在自己的会话里说话 | 无上抛/转述机制 |
| 作者归属 | 无文档级归属 | 只能从工具卡推断；编辑器里没有作者标记与逐条撤销 |

---

## 4. 读代码时发现的现存问题

1. **行内 diff 提案断链**：`useDraftDiffProposals` 与 `ConfirmCard` 判断的工具名是 `replace_draft_excerpt`，但真实 Agent 工具名是 `manage_drafts`（`replace_excerpt` 是它的 action，`replace_draft_excerpt` 只是 renderer action 类型）。
   见 `src/components/editor/use-draft-diff-proposals.ts:25`、`src/components/panels/agent/ConfirmCard.tsx:89,123,249`、`electron/pi/tools/manage-drafts.tool.ts:350`。
   结果：主助手修改草稿时，编辑器里的行内红绿 diff 实际不会出现，确认卡也走通用描述。
2. **委派是同步阻塞**：`delegate_to_assistant.execute` 直接 await `delegateTask`，而 `delegateTask` 在目标会话忙碌时会排队等待；这期间主助手这一轮卡住，渲染层只看到一张 running 的工具卡，没有排队/进度信息。
3. **子助手写入不可逆地先落盘**：writing 模式下领域工具直接提交，主助手只能事后转述；用户想拒绝只能去数据库/编辑器里撤。
4. **父子关系不持久**：进程重启后委托关系丢失，无法恢复"下钻"入口。
5. **队列不可见**：FIFO 队列没有状态事件，UI 无法显示"排队中 / 前面还有 N 个任务"。
6. **会话模式是全局的**：`executionMode` 存在 store 里全局共享，切到架构/蓝图/审稿面板时也是同一个模式值；不是每会话独立。
7. **分层契约现在是硬约束**：`test/layering-contract.test.ts` 禁止 Store/Service/Shared 依赖 components、禁止 `src/shared` 依赖业务层、禁止运行时依赖环。任何"委托卡/下钻"实现都必须把 UI 数据合同放进 `src/shared`，导航动作不能由 store 直接 import 组件或弹窗。
8. **旧审稿链路已移除**：0.1.4 用只读审稿助手替代工作流审稿；之前的"审稿是工作流一环"的设计假设需要更新。

---

## 5. 最小改动路径（建议）

### P0 · 让委托"可见"

- `delegate-to-assistant.tool.ts`：`details` 增加 `summary`、`status`、`artifacts`、`proposals`；
- 新增 `DelegateCard` 组件，在 `AgentMessage` 中按 `toolName === 'delegate_to_assistant'` 渲染：目标助手、任务、状态（排队/运行/完成/失败）、结果摘要、`查看会话`、`直接对话`；
- `agent-store` 增加 `openDelegatedConversation(conversationId)`：切到对应面板并设置活跃会话；
- 这一步**不动后端语义**，只补表现层。

### P1 · 统一确认（需要后端改动）

三选一，需要你拍板：

- **现成参考**：审稿助手的 `submit_chapter_review` + `review-contract.ts` + `expectedSource` 版本绑定，就是"只出结构化报告、不直接改正文"的现成范式；提案模式可以复用同样的合同思路。
- **A. 提案模式（推荐）**：委派增加 `mode: 'propose' | 'apply'`；默认 propose 时子助手跑 plan 模式，领域写工具被拦截为"提案"返回主助手，由主助手汇总后统一确认；apply 时才允许直接落盘。
- **B. 回执模式（最快）**：保留 writing 直接落盘，但子助手返回结构化"写入回执"（改了哪些表/文件、diff 摘要），主会话展示可撤销的变更集。
- **C. 确认上抛**：子助手的确认卡上抛到主会话，用户在主会话批准；实现复杂，且会打断主会话节奏。

### 实现约束（0.1.4 分层）

- 委托卡的数据结构放 `src/shared`（新合同），`ToolCallInfo.details` 只携带可序列化字段；
- 导航动作（切到子会话/切回主会话）由组件层发起，store 只维护会话 id 与视图枚举，禁止 store import components；
- 需要弹窗时走 `dialog-port`；
- 新增依赖必须通过 `test/layering-contract.test.ts`，且不引入运行时循环。

### P2 · 下钻

- 会话元数据增加 `parentConversationId` 与 `delegationId`（JSONL meta 或 conversation archive）；
- 右侧面板新增"下钻态"：上方保留主助手收起条，下方渲染目标子会话；返回时把结论摘要作为一条系统消息写回主会话；
- 复用现有 `AgentConversation`，只需传入目标 `conversationId`，不要新建组件。

### P3 · 主助手直接修改的 diff 与归属

- 修复 `manage_drafts` 的工具名判断，让行内 diff 提案真正生效；
- 增加文档级变更记录（谁改的、可撤销），与 `rendererAction` 的提交结果对齐。

### P4 · 队列/取消/失败可见

- `ConversationQueue` 增加状态事件（queued/running/finished/failed）并在委托卡上展示；
- 失败时把错误摘要回传主助手，由主助手决定重试还是换子助手。

---

## 6. 需要拍板的问题

1. 子助手修改内容：**提案优先**（P1-A）还是**先落盘再回执**（P1-B）？
2. 委派是否保持同步阻塞？若要异步，需要额外的任务/事件模型，改动较大。
3. 下钻时主助手是否暂停？若不暂停，两个会话可以并行，但上下文会各说各话。
4. 行内 diff 修复是否纳入本轮（它直接影响"主助手直接修改"的体验）。
5. 审稿助手要不要开放给主助手委派？目前 delegate 枚举只有 architect/blueprint；若开放，审稿仍是只读 + 报告，不会改正文。
