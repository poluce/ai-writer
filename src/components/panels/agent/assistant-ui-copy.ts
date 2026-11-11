import type { AssistantType } from '../../../shared/agent-conversation-archive'

export type AssistantTextFn = (zhCN: string, enUSText: string) => string

export interface AssistantStarter {
  titleZh: string
  titleEn: string
  descZh: string
  descEn: string
  promptZh: string
  promptEn: string
}

/**
 * 助手面板的类型化文案与入口配置。
 * 新增助手类型时只改这一张表，避免在组件里堆四层三元表达式。
 */
export interface AssistantUiCopy {
  /** 面板标题。 */
  title: (text: AssistantTextFn) => string
  /** 空状态顶部说明。 */
  description: (text: AssistantTextFn) => string
  /** 输入框 placeholder。 */
  placeholder: (text: AssistantTextFn) => string
  /** 关闭按钮 title。 */
  closeTitle: (text: AssistantTextFn) => string
  /** 空状态“查看全部…”链接文案。 */
  historyLinkLabel: (text: AssistantTextFn) => string
  /** 历史面板标题。 */
  historyTitle: (text: AssistantTextFn) => string
  /** 快速起点分组标题；空数组表示没有起点。 */
  starterHeading: (text: AssistantTextFn) => string
  starters: readonly AssistantStarter[]
  /** 未显式选择模型时，按哪一类创作环节解析默认模型。 */
  modelTaskKey: 'assistant' | 'planning' | 'drafting' | 'review'
}

const ARCHITECT_STARTERS: readonly AssistantStarter[] = [
  {
    titleZh: '梳理核心前提与戏剧冲突',
    titleEn: 'Clarify Premise & Stakes',
    descZh: '推演主角核心动机、阻碍与核心困境',
    descEn: 'Deduce protagonist desires and central dilemma',
    promptZh: '请协助我梳理当前小说的核心前提（主角欲望、外部阻碍、核心困境与不可逆代价），增强开篇的故事动力。',
    promptEn: 'Please help me clarify the core premise of this novel (protagonist desire, obstacles, central dilemma, and irreversible stakes).',
  },
  {
    titleZh: '规划分卷大纲与高潮起伏',
    titleEn: 'Outline Volume Arc & Climax',
    descZh: '运用起承转合编织全书主线与第一卷高潮',
    descEn: 'Structure volume arcs and first volume climax',
    promptZh: '请根据当前设定，帮我规划全书的分卷大纲架构，并设计第一卷的高潮起伏与关键转折节拍。',
    promptEn: 'Please help me outline the overarching multi-volume arcs and design the first volume climax beats.',
  },
  {
    titleZh: '设计世界观与力量体系',
    titleEn: 'Design Worldbuilding & Power System',
    descZh: '构建严密自洽的社会、阵营与力量层级',
    descEn: 'Build cohesive factions and power rules',
    promptZh: '请帮我设计一套严密自洽的世界观规则与力量升级体系，包含层级划分、代价值与潜在矛盾。',
    promptEn: 'Please help me design a cohesive worldbuilding ruleset and power progression system with clear tiering and stakes.',
  },
  {
    titleZh: '拆解黄金前三章剧情蓝图',
    titleEn: 'Decompose Opening Chapter Blueprint',
    descZh: '细化前三章事件、出场人物与钩子悬念',
    descEn: 'Map opening scenes, characters, and cliffhangers',
    promptZh: '请结合核心大纲，帮我拆解前三章的剧情细纲蓝图（每章核心事件、出场人物、情节点与钩子悬念）。',
    promptEn: 'Please decompose the opening three chapters into concrete blueprints with core events, characters, and cliffhangers.',
  },
]

const BLUEPRINT_STARTERS: readonly AssistantStarter[] = [
  {
    titleZh: '推演下一章核心细纲',
    titleEn: 'Deduce Next Chapter Blueprint',
    descZh: '承接前文剧情，规划本章主线推进与核心事件',
    descEn: 'Continue prior events and structure main chapter beats',
    promptZh: '请结合当前最新章节事实与整体大纲，帮我推演下一章的剧情细纲（核心事件、发生地点、主导矛盾与转折）。',
    promptEn: 'Please help me deduce the next chapter blueprint based on current project state and overall outline (core event, location, central conflict, and turning point).',
  },
  {
    titleZh: '设计戏剧冲突与高潮节拍',
    titleEn: 'Design Dramatic Conflict & Beats',
    descZh: '排布起承转合，设计角色主动抉择与代价',
    descEn: 'Structure dramatic beats, active choices, and stakes',
    promptZh: '请为本章设计紧凑的戏剧冲突与情节节拍，确保主角有明确行动目标、外部强力阻碍，并在高潮处做出有代价的抉择。',
    promptEn: 'Please design tight dramatic conflict and scene beats for this chapter, ensuring clear protagonist desire, severe obstacles, and a costly choice at the climax.',
  },
  {
    titleZh: '编排登场角色与关系互动',
    titleEn: 'Orchestrate Characters & Dynamic',
    descZh: '明确出场人员、动机诉求与潜台词交锋',
    descEn: 'Specify appearing cast, scene motives, and dialogue subtext',
    promptZh: '请帮我梳理本章登场的关键角色阵容，明确各人在场的核心动机、情绪曲线走向，并设计充满潜台词的互动交锋。',
    promptEn: 'Please help me orchestrate the key characters appearing in this chapter, clarifying their immediate motives, emotional arcs, and dialogue subtext.',
  },
  {
    titleZh: '布局伏笔线索与章末悬念钩子',
    titleEn: 'Plant Clues & Cliffhanger Hooks',
    descZh: '回收/埋设线索，设计强烈章末阅读悬念',
    descEn: 'Weave clues and craft an irresistible cliffhanger hook',
    promptZh: '请帮我检查本章需要推进或埋设的信息伏笔，并精心设计一个强烈的章末悬念钩子（Cliffhanger），维持读者的翻页期待。',
    promptEn: 'Please help me review foreshadowing clues to plant or advance in this chapter, and craft a compelling cliffhanger hook to keep readers turning pages.',
  },
]

const WRITER_STARTERS: readonly AssistantStarter[] = [
  {
    titleZh: '起草下一章正文',
    titleEn: 'Draft Next Chapter',
    descZh: '读取蓝图、前文事实与人物状态，直接执笔落盘',
    descEn: 'Read the blueprint, prior facts, and character states, then draft and save the chapter',
    promptZh: '请读取当前项目的章节进度、对应章节蓝图、前文连续性事实与人物近况，执笔起草下一章正文，并通过 manage_drafts 写入保存；如有必要同步更新人物与伏笔状态。',
    promptEn: 'Please read the project progress, the matching chapter blueprint, prior continuity facts, and character states, draft the next chapter prose, save it with manage_drafts, and update character or thread states if needed.',
  },
  {
    titleZh: '按划词批注精修草稿',
    titleEn: 'Revise from Annotations',
    descZh: '读取当前章节正文与作者批注，逐处精准替换并归档',
    descEn: 'Read the current chapter draft and author notes, then apply targeted edits and resolve them',
    promptZh: '请读取我当前打开的章节草稿与待处理批注，对照上下文逐处精修正文并用 replace_excerpt 写入，修改完成后将已处理的批注标记为已解决。',
    promptEn: 'Please read my currently open chapter draft and active annotations, apply targeted revisions with replace_excerpt, and mark resolved annotations.',
  },
  {
    titleZh: '扩写当前场景与动作细节',
    titleEn: 'Expand Scene & Action',
    descZh: '围绕因果、感官细节与情绪张力充实章节画面感',
    descEn: 'Enrich the current scene with sensory detail, action, and tension',
    promptZh: '请读取当前章节草稿与本章蓝图，针对薄弱或偏概括的段落补充具体动作、环境感官与潜台词交锋，保持项目既有文风并通过 replace_excerpt 写入。',
    promptEn: 'Please read the current chapter draft and blueprint, expand thin passages with concrete action, sensory detail, and subtext while matching the project writing style, and persist changes with replace_excerpt.',
  },
  {
    titleZh: '润色人物对白与节奏张力',
    titleEn: 'Polish Dialogue & Pacing',
    descZh: '让人物说话贴合性格动机，拉紧段落节奏推进冲突',
    descEn: 'Sharpen character voice in dialogue and tighten scene pacing',
    promptZh: '请读取当前章节草稿和登场人物档案，润色不自然或同质化的人物对白，理顺节奏起伏，并用 replace_excerpt 局部写入更新。',
    promptEn: 'Please read the current chapter draft and appearing character dossiers, polish flat dialogue to fit each voice, tighten pacing, and save targeted replacements with replace_excerpt.',
  },
]

const REVIEW_STARTERS: readonly AssistantStarter[] = [
  {
    titleZh: '审当前章',
    titleEn: 'Review Current Chapter',
    descZh: '一致性、人物、情节逻辑与文字基础全维度审查',
    descEn: 'Full review across continuity, characters, logic, and craft',
    promptZh: '请审查我当前打开的章节草稿。先用工具读取最新草稿、本章蓝图与已定稿的连续性事实，再按设定一致性、人物动机、情节逻辑、节奏与文字基础逐项检查；每条问题引用原文，最后调用 submit_chapter_review 提交审稿报告。',
    promptEn: 'Please review the chapter draft I currently have open. Read the latest draft, this chapter\'s blueprint, and finalized continuity facts first, then check continuity, character motivation, plot logic, pacing, and craft. Quote the draft for each issue, and finish by submitting the review report with submit_chapter_review.',
  },
  {
    titleZh: '只查设定与连续性冲突',
    titleEn: 'Continuity-Only Pass',
    descZh: '对照世界观、角色状态与已定稿事实挑前后矛盾',
    descEn: 'Flag contradictions against established settings and history',
    promptZh: '请只做设定与连续性专项审查：对照世界观、角色档案与当前状态、已定稿章节事实和本章蓝图，找出前后矛盾之处。每条问题引用草稿原文并说明冲突事实的来源，最后用 submit_chapter_review 提交报告。',
    promptEn: 'Run a continuity-only review: compare the draft against worldbuilding, character dossiers and current states, finalized chapter facts, and this chapter\'s blueprint, then flag contradictions. Quote the draft and cite the source of each conflicting fact, and submit with submit_chapter_review.',
  },
  {
    titleZh: '只查节奏与章末钩子',
    titleEn: 'Pacing & Hook Pass',
    descZh: '检查信息密度、场景推进与章末悬念是否有效',
    descEn: 'Check information density, scene momentum, and the hook',
    promptZh: '请只做节奏与章末钩子专项审查：评估场景推进是否拖沓或跳跃、信息密度是否失衡、对白是否推进剧情，以及章末悬念是否有效。引用原文说明问题，最后用 submit_chapter_review 提交报告。',
    promptEn: 'Run a pacing-and-hook-only review: assess whether scenes drag or jump, whether information density is balanced, whether dialogue advances the plot, and whether the cliffhanger lands. Quote the draft for each issue, and submit with submit_chapter_review.',
  },
]

export const ASSISTANT_UI_COPY: Record<AssistantType, AssistantUiCopy> = {
  general: {
    title: text => text('AI 助手', 'AI Assistant'),
    description: text => text(
      '主助手 — 统筹调度架构、蓝图、写作与审稿，支持 / 命令和 @ 引用',
      'Lead assistant — coordinates Architect, Blueprint, Writing, and Review; use / commands and @ mentions',
    ),
    placeholder: text => text(
      '输入消息，@ 提及，/ 使用工作流...',
      'Type a message, @ mention, or / use a workflow...',
    ),
    closeTitle: text => text('关闭助手面板', 'Close Assistant panel'),
    historyLinkLabel: text => text('查看全部对话', 'View all conversations'),
    historyTitle: text => text('全部对话', 'All conversations'),
    starterHeading: text => text('创作起点', 'Creative kickstarts'),
    starters: [],
    modelTaskKey: 'assistant',
  },
  architect: {
    title: text => text('AI 架构助手', 'AI Architecture Assistant'),
    description: text => text(
      '架构助手 — 专注世界观、全书大纲、战力体系与角色推演',
      'Architecture Assistant — Focus on worldbuilding, outline, power systems, and characters',
    ),
    placeholder: text => text(
      '探讨世界观、大纲、设定与冲突推演...（Enter 发送）',
      'Discuss worldbuilding, outline, setting, and plot beats... (Enter to send)',
    ),
    closeTitle: text => text('关闭架构助手', 'Close Architecture panel'),
    historyLinkLabel: text => text('查看全部架构推演记录', 'View all architecture discussions'),
    historyTitle: text => text('全部架构推演记录', 'All architecture discussions'),
    starterHeading: text => text('架构推演起点', 'Architecture Kickstarts'),
    starters: ARCHITECT_STARTERS,
    modelTaskKey: 'planning',
  },
  blueprint: {
    title: text => text('AI 蓝图助手', 'AI Blueprint Assistant'),
    description: text => text(
      '蓝图助手 — 专注单章细纲推演、场景节拍设计、伏笔回收与章末悬念',
      'Blueprint Assistant — Focus on chapter blueprints, scene beats, foreshadowing, and cliffhangers',
    ),
    placeholder: text => text(
      '推演章节细纲、核心事件、角色登场与章末悬念...（Enter 发送）',
      'Deduce chapter blueprint, events, characters, and cliffhangers... (Enter to send)',
    ),
    closeTitle: text => text('关闭蓝图助手', 'Close Blueprint panel'),
    historyLinkLabel: text => text('查看全部蓝图推演记录', 'View all blueprint discussions'),
    historyTitle: text => text('全部章节蓝图推演记录', 'All chapter blueprint discussions'),
    starterHeading: text => text('蓝图推演起点', 'Blueprint Kickstarts'),
    starters: BLUEPRINT_STARTERS,
    modelTaskKey: 'planning',
  },
  writer: {
    title: text => text('AI 写作助手', 'AI Writing Assistant'),
    description: text => text(
      '写作助手 — 专注章节正文起草、改写润色，并同步人物状态与伏笔进度',
      'Writing Assistant — Drafts and refines chapter prose while keeping characters and threads in sync',
    ),
    placeholder: text => text(
      '告诉我写哪一章、扩写哪段或怎么改稿...（Enter 发送）',
      'Tell me which chapter to draft, expand, or revise... (Enter to send)',
    ),
    closeTitle: text => text('关闭写作助手', 'Close Writing panel'),
    historyLinkLabel: text => text('查看全部写作记录', 'View all writing discussions'),
    historyTitle: text => text('全部写作记录', 'All writing discussions'),
    starterHeading: text => text('写作起点', 'Writing kickstarts'),
    starters: WRITER_STARTERS,
    modelTaskKey: 'drafting',
  },
  review: {
    title: text => text('AI 审稿助手', 'AI Review Assistant'),
    description: text => text(
      '审稿助手 — 只读审查章节草稿：一致性、人物、情节逻辑、节奏与文字基础',
      'Review Assistant — Read-only draft review across continuity, characters, plot logic, pacing, and craft',
    ),
    placeholder: text => text(
      '告诉我审哪一章、重点查什么...（Enter 发送）',
      'Tell me which chapter to review and what to focus on... (Enter to send)',
    ),
    closeTitle: text => text('关闭审稿助手', 'Close Review panel'),
    historyLinkLabel: text => text('查看全部审稿记录', 'View all review discussions'),
    historyTitle: text => text('全部审稿记录', 'All review discussions'),
    starterHeading: text => text('审稿起点', 'Review kickstarts'),
    starters: REVIEW_STARTERS,
    modelTaskKey: 'review',
  },
}
