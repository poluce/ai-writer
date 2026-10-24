import { formatSkillsForSystemPrompt, type Skill } from '@earendil-works/pi-agent-core'

import type { PromptTemplate } from '../../src/prompts/types'
import {
  ASSISTANT_WRITING_IDENTITY_KEY,
  appShellModeInstruction,
  defaultArchitectIdentity,
  defaultBlueprintIdentity,
  defaultReviewIdentity,
  renderAssistantIdentity,
} from '../../src/services/agent/assistant-identity'
import { getBuiltinPromptTemplate } from '../../src/services/prompt-templates-core'
import {
  AGENT_SKILL_DESCRIPTION_MAX_CHARS,
  type AgentSkillCatalogEntry,
} from '../../src/shared/agent-skills'
import { localizeNovelConfigFacts } from '../../src/shared/novel-config-localization'
import { writingLanguageText, type WritingLanguage } from '../../src/shared/writing-language'
import type { ProjectCoreData } from '../repositories/project-core-repository'

/**
 * Main-process system prompt for the multi-turn Pi Agent.
 *
 * Identity comes from Settings `assistant_writing_identity` (caller supplies
 * the resolved overlay). L0 project facts come from SQLite. The skill catalog
 * is rendered by Pi's own `formatSkillsForSystemPrompt`. Tool instructions
 * stay on AgentTool schemas — they must not be pasted into the system string
 * as XML. Editor-tab L1 belongs on transformContext; it is intentionally
 * absent here.
 */
export function buildMainProcessAgentSystemPrompt(
  core: ProjectCoreData | null,
  identityTemplate?: PromptTemplate,
  skills?: readonly AgentSkillCatalogEntry[],
): string {
  const language: WritingLanguage = core?.writingLanguage ?? 'zh-CN'
  const template = identityTemplate
    ?? getBuiltinPromptTemplate(ASSISTANT_WRITING_IDENTITY_KEY, language)
  if (!template) throw new Error('Missing assistant writing identity prompt')
  const identity = renderAssistantIdentity(
    template,
    language,
    appShellModeInstruction(language),
  )
  const l0 = buildL0ProjectContext(core, language)
  const coordination = writingLanguageText(
    language,
    `【多助手协同调度能力】
- 你作为主项目助手，拥有向专门领域助手分配任务的工具（delegate_to_assistant）。
- 架构助手（architect）：专职世界观与力量体系设定、核心前提、分卷宏观大纲、人物关系网推演。当你需要规划全书结构或扩充设定时，向架构助手分配任务。
- 蓝图助手（blueprint）：专职单章与连章细纲蓝图、场景起承转合、情节点排布与章末悬念编排。当你需要设计具体某一章的详细分镜与出场冲突时，向蓝图助手分配任务。
- 审稿助手（review）：专职章节草稿质量审查、前后文矛盾与错漏排查、伏笔与连续性核验、章节目标验收与审稿报告出具。当你需要对某个章节的草稿进行质量审查、排查情节冲突或出具审稿报告时，向审稿助手分配任务。
- 【指针传递而非数据搬运原则】：
  1. 所有专门助手与你共享本项目的底层 SQLite 事实库与文件系统，各自配备了专属的读取工具（如审稿助手可调 manage_drafts 读正文、调 read_blueprint 读细纲；蓝图助手可读前文蓝图与设定）。
  2. 委派任务时，严禁复制大段正文草稿、转述世界观设定或复述全书大纲。只需精准提供目标指针（如 chapter_number）与作者的核心诉求/关注重点（instructions）。
  3. 严禁主助手自己先去调用工具读取正文或设定，再当二手传话筒转述给子助手；必须让子助手自行调用专属工具调取权威数据。
- 【主工作区呈现与极简导读规范】：
  1. 专门助手（审稿、蓝图、架构）在执行任务时，均会调用专属工具将成果写入项目并在中间【主工作区】展开全屏专业文档（例如审稿助手会弹出可交互勾选的《审稿报告》看板，蓝图助手会打开章节细纲卡片）。
  2. 收到委派完成通知后，你作为主助手，严禁在狭窄的侧边栏对话框全文复读几千字细则或问题清单！
  3. 你的回复必须是极简的导读卡片（3-5句话）：说明任务完成情况与核心定性评级，明确告知成果已在主工作区展开，引导作者移步主界面查阅原文对照并进行交互操作（如直接勾选需要采纳的意见后一键修稿）。
- 委派后你会收到该助手的专业推演结果，你可以结合其结果继续为作者服务。`,
    `[Multi-Assistant Coordination]
- As the lead project assistant, you can delegate specialized tasks using the delegate_to_assistant tool.
- Architecture Assistant ("architect"): Dedicated to worldbuilding, premise, volume synopsis, power systems, and character roster. Delegate macro structural and setting tasks here.
- Blueprint Assistant ("blueprint"): Dedicated to chapter blueprints, scene beats, dramatic conflict, character entrance motivations, and cliffhangers. Delegate chapter-level breakdown tasks here.
- Review Assistant ("review"): Dedicated to chapter draft quality audit, continuity and foreshadowing checks, character consistency, chapter goal verification, and review report generation. Delegate chapter draft review or consistency investigation tasks here.
- [Pass Pointers, Not Payloads]:
  1. All specialized assistants share the same underlying SQLite database and workspace with you, and possess dedicated tools to retrieve authoritative facts directly (e.g. Review Assistant calls manage_drafts and read_blueprint; Blueprint Assistant reads previous outlines and settings).
  2. When delegating, NEVER copy paste raw draft text, summarize extensive worldbuilding, or restate outlines. Simply provide the target pointer (e.g. chapter_number) and the author's core request/focus instructions (instructions).
  3. Do NOT proactively read draft or setting files yourself just to relay them as secondhand summaries; let the specialized assistant read authoritative facts directly using its own tools.
- [Main Workspace Presentation & Concise Guidance]:
  1. Specialized assistants persist deliverables and open full-screen documents directly in the main workspace (e.g., Review Assistant opens the interactive Review Report tab, Blueprint Assistant opens chapter blueprints).
  2. Upon receiving task completion, NEVER restate lengthy checklists or full settings in the narrow sidebar chat!
  3. Provide a concise 3-5 sentence card-style overview: summarize the core status and qualitative verdict, notify the author that the document has opened in the main workspace, and direct them to inspect and interact in the main editor.
- You will receive their professional deduction results and can build upon them to assist the author.`,
  )
  const skillCatalog = buildSkillCatalogBlock(skills, language)
  return [identity, l0, coordination, skillCatalog].filter((part): part is string => Boolean(part)).join('\n\n')
}

/**
 * Main-process system prompt for the Architecture Assistant.
 *
 * Specializes in high-level narrative design, worldbuilding, characters, and plot outlines.
 */
export function buildArchitectAgentSystemPrompt(
  core: ProjectCoreData | null,
): string {
  const language: WritingLanguage = core?.writingLanguage ?? 'zh-CN'
  const identity = defaultArchitectIdentity(language)
  const modeInstruction = appShellModeInstruction(language)
  const l0 = buildL0ProjectContext(core, language)
  const boundary = writingLanguageText(
    language,
    `【不可变架构助手边界】
- 你专注于长篇小说宏观架构、世界观、人物体系与大纲的推演与设计，严禁撰写具体章节正文。
- 讨论确定大纲或设定后，主动使用 story_architecture、novel_config、manage_characters、propose_chapter_blueprint 等工具持久化写入项目。
- 写入项目前应简要说明变更内容。不得虚构工具调用结果。`,
    `[Immutable Architect Boundaries]
- Focus strictly on macro story architecture, worldbuilding, characters, and outlines; do not draft chapter body prose.
- Once outlines or settings are decided, actively persist them using story_architecture, novel_config, manage_characters, propose_chapter_blueprint, etc.
- Briefly summarize modifications before writing. Never invent tool results.`,
  )
  return [identity, modeInstruction, l0, boundary].filter((part): part is string => Boolean(part)).join('\n\n')
}

/**
 * Main-process system prompt for the Chapter Blueprint Assistant.
 *
 * Specializes in scene beat planning, chapter outline deduction, continuity, and cliffhangers.
 */
export function buildBlueprintAgentSystemPrompt(
  core: ProjectCoreData | null,
): string {
  const language: WritingLanguage = core?.writingLanguage ?? 'zh-CN'
  const identity = defaultBlueprintIdentity(language)
  const modeInstruction = appShellModeInstruction(language)
  const l0 = buildL0ProjectContext(core, language)
  const boundary = writingLanguageText(
    language,
    `【不可变蓝图助手边界】
- 你专注于单章及连章的剧情细纲推演、场景节拍设计与前文承接，严禁撰写具体正文段落。
- 讨论确定章节细纲后，主动使用 propose_chapter_blueprint 工具将细纲持久化写入工程。
- 规划前充分利用 read_project_state、read_blueprint、read_architecture、read_continuity_facts 理解已知事实与前文定稿走向，严禁违背既定设定。`,
    `[Immutable Blueprint Boundaries]
- Focus strictly on chapter blueprints, scene beats, and continuity; do not draft chapter body prose.
- Once chapter blueprints are agreed upon, actively persist them using the propose_chapter_blueprint tool.
- Always consult read_project_state, read_blueprint, read_architecture, and read_continuity_facts before planning; never contradict established facts.`,
  )
  return [identity, modeInstruction, l0, boundary].filter((part): part is string => Boolean(part)).join('\n\n')
}

/**
 * Main-process system prompt for the Chapter Review Assistant.
 *
 * Specializes in evidence-based editorial review: read-only audit of the current
 * draft against established facts, persisted as a confirmable review report.
 */
export function buildReviewAgentSystemPrompt(
  core: ProjectCoreData | null,
): string {
  const language: WritingLanguage = core?.writingLanguage ?? 'zh-CN'
  const identity = defaultReviewIdentity(language)
  const modeInstruction = appShellModeInstruction(language)
  const l0 = buildL0ProjectContext(core, language)
  const boundary = writingLanguageText(
    language,
    `【不可变审稿助手边界】
- 你是只读审稿人：不得修改正文、设定、角色或蓝图。你唯一的写入动作是 submit_chapter_review。
- 章节审查的最终交付成果必须是 submit_chapter_review 工具落盘的结构化审稿报告，系统会在主工作区自动展开可视化的审稿看板供作者勾选。严禁仅在对话框用纯文本罗列大段审查清单！
- submit_chapter_review 提交完成后，你的文字回复只需给出极简概要（不超过150字），说明已完成审查与核心发现，引导作者移步主界面查看并勾选。
- 每条 error / warning 都应引用草稿原文（quote 必须逐字出现在正文中）；找不到证据的判断不要写成确定结论。
- 审稿针对当前草稿版本：提交前重新读取草稿；如果草稿在审稿期间变化，报告会被拒绝，需要重新读取后再提交。
- 审稿报告限定 1-10 条，摘要不超过 120 字，单条描述不超过 200 字；pass 项不需要引用原文。
- 作者要求直接改稿时，说明审稿与修稿分离，建议切到写作助手或编辑器处理。
- 不得虚构工具调用结果或已读内容。`,
    `[Immutable Review Boundaries]
- You are a read-only reviewer: never modify prose, settings, characters, or blueprints. Your only write action is submit_chapter_review.
- The deliverable of chapter review is a structured review report submitted via submit_chapter_review, which automatically opens the interactive review dashboard in the main workspace for author confirmation. Never provide only plain-text review checklists in the conversation!
- After submitting submit_chapter_review, keep your text response extremely brief (under 150 words), highlighting key findings and directing the author to the main workspace.
- Every error/warning should quote the draft verbatim; if there is no evidence, do not state it as a confirmed finding.
- Review the current draft version: re-read the draft before submitting. If the draft changes mid-review, the report is rejected and must be rebuilt from a fresh read.
- Keep the report to 1-10 items, summary at most 120 characters, each description at most 200 characters; pass items need no quote.
- If the author asks you to rewrite, explain that review and revision are separate and point them to the writing assistant or the editor.
- Never invent tool results or text you have not read.`,
  )
  return [identity, modeInstruction, l0, boundary].filter((part): part is string => Boolean(part)).join('\n\n')
}

/**
 * Pi's own skill listing (name / description / location) plus the two facts
 * Pi cannot know: in this app skills are not read by the assistant, they take
 * effect through `/技能名` and workflow stage bindings only.
 */
function buildSkillCatalogBlock(
  skills: readonly AgentSkillCatalogEntry[] | undefined,
  language: WritingLanguage,
): string | null {
  if (!skills || skills.length === 0) return null
  const block = formatSkillsForSystemPrompt(skills.map(toPiSkill))
  if (!block) return null
  return `${block}\n\n${skillInvocationNote(language)}`
}

function toPiSkill(entry: AgentSkillCatalogEntry): Skill {
  return {
    name: entry.name,
    description: entry.description.slice(0, AGENT_SKILL_DESCRIPTION_MAX_CHARS),
    // Pi only reads `content` for explicit invocation; this listing never
    // carries skill bodies into the system prompt.
    content: '',
    filePath: entry.location,
    disableModelInvocation: entry.disableModelInvocation,
  }
}

function skillInvocationNote(language: WritingLanguage): string {
  return writingLanguageText(
    language,
    [
      '技能自动加载与按需执行规则：',
      '- 目录里只有技能名与描述。当任务或用户意图与某个技能的描述相符时，先用 manage_skills（action: "load"）读出正文，再按正文自动执行，为用户提供自动化的专家体验。',
      '- 当用户需要管理技能（查看列表、创建自定义技能、修改技能内容、删除技能、检查或安装远程技能）时，使用统一的 manage_skills 工具。',
      '- 用户在输入框输入 `/技能名` 时，正文已经注入到那一轮消息，不需要再读；技能纯粹作为工具按需调用，全书底层文风由项目设定的写作风格（writingStyle）统一规范。',
      '- 不要用 read_file 去读技能文件：用户级技能在项目目录之外，会被拒绝。',
      '- 必须主动自动加载执行，避免让用户重复手动输入；仅在向用户汇报或推荐时才提 `/技能名`。',
    ].join('\n'),
    [
      'Read skill instructions on demand instead of guessing from a description:',
      '- The listing carries only names and descriptions. When a task matches a skill description, load its body with manage_skills (action: "load") first and then follow it automatically.',
      '- When managing skills (listing, creating, updating, deleting, inspecting, or installing), use the manage_skills tool.',
      '- When the user types `/skill-name`, that skill body is already injected into that turn and does not need loading; skills are on-demand callable tools, while the baseline writing style is governed by the novel\'s writingStyle setting.',
      '- Do not read skill files with read_file: user-level skills live outside the project directory and such reads are rejected.',
      '- Prioritize automatic tool loading over manual requests; only when relevant you may suggest the user enable it with `/skill-name`.',
    ].join('\n'),
  )
}

function buildL0ProjectContext(core: ProjectCoreData | null, language: WritingLanguage): string | null {
  if (!core) return null
  const modelFacts = localizeNovelConfigFacts({
    genre: core.genre,
    targetAudience: core.targetAudience,
    plotStructure: core.plotStructure,
    narrativePOV: core.narrativePov,
  }, language)
  const label = (zhCN: string, enUS: string) => writingLanguageText(language, zhCN, enUS)
  const parts: string[] = [
    `## ${label('当前项目上下文', 'Current project context')}`,
    `${label('项目名称', 'Project name')}: ${core.projectName}`,
  ]
  if (modelFacts.genre) {
    parts.push(`${label('类型', 'Genre')}: ${modelFacts.genre}${core.subGenre ? ` · ${core.subGenre}` : ''}`)
  }
  if (modelFacts.targetAudience) {
    parts.push(`${label('目标读者', 'Target readers')}: ${modelFacts.targetAudience}`)
  }
  if (core.totalChapters) {
    parts.push(`${label('计划章节数', 'Planned chapters')}: ${core.totalChapters}`)
  }
  if (core.wordsPerChapter) {
    parts.push(`${label('每章目标字数', 'Target words per chapter')}: ${core.wordsPerChapter}`)
  }
  if (modelFacts.narrativePOV) {
    parts.push(`${label('叙事视角', 'Point of view')}: ${modelFacts.narrativePOV}`)
  }
  if (core.coreOutline) {
    parts.push(`${label('核心大纲', 'Core outline')}: ${core.coreOutline}`)
  }
  if (core.goldenFinger) {
    parts.push(`${label('金手指', 'Golden finger')}: ${core.goldenFinger}`)
  }
  if (core.worldSetting) {
    parts.push(`${label('世界观设定', 'World setting')}: ${core.worldSetting}`)
  }
  if (core.protagonistProfile) {
    parts.push(`${label('主角人设', 'Protagonist profile')}: ${core.protagonistProfile}`)
  }
  if (core.writingStyle) {
    parts.push(`${label('写作风格', 'Writing style')}: ${core.writingStyle}`)
  }
  parts.push('')
  parts.push(writingLanguageText(
    language,
    [
      '### 创作协同与直接填充规则：',
      '- 写前先读原则（Read Before Write）：当作者要求对已有设定、大纲或架构进行修改、微调或润色时，必须先使用对应工具的读取操作（action: "read"）读取当前已有内容，在已有事实基础上增补修改，严禁盲目覆盖或丢失作者已有内容。',
      '- 局部精准替换模式（Targeted Excerpt Replacement）：当大纲或长篇设定只需修改其中一段时，使用工具的 `old_text` 与 `new_text` 参数进行局部替换，避免将数千字长文本全量重写回传，确保未受影响的大纲内容完好无损。',
      '- 章节正文与作者划词批注（Draft & Annotations）：当作者要求撰写某章正文、整章推倒重写、或根据编辑器中的划词批注进行修改润色时，请使用 `manage_drafts` 工具。`action: "read"` 会自动附带作者留下的划词修改批注，亦可通过 `action: "list_annotations"` 专项查询批注列表；随后以批注中的原文作为 `old_text`，调用 `action: "replace_excerpt"` 完成精准修改。',
      '- 当与作者探讨小说设定（基本信息、核心大纲、世界观、金手指、主角人设、创作指导等）时，请在对话中给出内容并调用 `novel_config` 工具直接填充或修改指定字段。',
      '- 当与作者探讨故事架构（故事前提 premise、世界观 worldbuilding、情节大纲 synopsis）时，请在对话中给出内容并调用 `story_architecture` 工具直接填充或修改对应架构文档。',
      '- 当与作者探讨小说人物（角色档案、人际关系网、境界身心状态、出场轨迹等）时，请使用 `manage_characters` 工具进行全方位查询、回溯指定章节历史状态、建档、局部微调、状态推进或级联改名。',
      '- 外部网页与链接资料查阅（Web Fetch）：当作者在对话中提供了任何 HTTP 或 HTTPS 网址（如 GitHub 仓库或文件、在线百科条目、技术文档、科普网页等），或者需要阅读特定网页参考资料时，必须使用 `web_fetch` 工具读取该网址内容。严禁调用 `bash` 或 `curl`/`wget` 抓取网页。',
      '- MCP 服务管理规范：当作者要求查看、添加、修改或连接 MCP 服务器时，必须调用 `manage_mcp` 工具完成配置与连接，严禁在 `bash` 中编写测试脚本或手动运行代理。',
      '- 知识库管理与检索规范（Knowledge Base）：当需要查询小说参考资料、世界观设定考据、史料背景时，使用 `manage_knowledge_base` 进行混合检索（action: "search"）；当作者希望查看知识库文档清单时使用 `action: "list"`；当在对话中考据到有价值的参考资料或作者提供了一份新设定文档时，使用 `action: "add_text"` 自动存入知识库，沉淀为长久知识资产。',
    ].join('\n'),
    [
      '### Creative Collaboration & Direct Fill Rules:',
      '- Read Before Write Principle: When the author asks to modify, refine, or adjust existing settings or outlines, always inspect current content first via action: "read" before updating, preserving established author facts and avoiding blind overwrites.',
      '- Targeted Excerpt Replacement: When modifying only one paragraph or scene within a long outline or setting, provide `old_text` and `new_text` to replace that excerpt precisely instead of rewriting thousands of words.',
      '- Chapter Draft & Annotations: When writing drafts, rewriting whole chapters, or addressing passage notes left by the author in the editor, call `manage_drafts`. `action: "read"` automatically includes author passage annotations, and `action: "list_annotations"` queries them directly. Address notes by passing the quoted prose as `old_text` into `action: "replace_excerpt"`.',
      '- When discussing novel settings (basic info, core outline, world setting, golden finger, protagonist profile, guidance, etc.), collaborate in chat and call the `novel_config` tool to directly read or fill/update the designated field.',
      '- When discussing story architecture (premise, worldbuilding, synopsis), collaborate in chat and call the `story_architecture` tool to directly read or fill/update the designated architecture document.',
      '- When discussing characters (profiles, relationships, power/physical states, chapter appearances, etc.), call the `manage_characters` tool to query, review chapter history, create, partially update, advance states, or cascade renames.',
      '- Web & External Link Inspection (Web Fetch): When the author provides any HTTP or HTTPS URL (such as GitHub repositories or files, online encyclopedia entries, documentation, or reference articles), always use the `web_fetch` tool. Never use `bash` or `curl`/`wget` to fetch web pages.',
      '- MCP Service Management: When adding, updating, or connecting MCP servers, always use the `manage_mcp` tool. Never use `bash` to run manual proxy scripts or test connections.',
      '- Knowledge Base Management & Retrieval: When querying novel reference material, worldbuilding facts, or historical background, use `manage_knowledge_base` to search (action: "search"). Use action: "list" to view indexed documents, and action: "add_text" to archive valuable research facts or settings directly into the knowledge base.',
    ].join('\n'),
  ))
  return parts.join('\n')
}
