import type { AssistantType } from './agent-conversation-archive'

/** 预览面板里的一块系统提示；顺序即最终拼装顺序。 */
export interface AssistantPromptBlockView {
  kind: 'hard_rules' | 'identity' | 'work_rules' | 'skill_catalog' | 'project_facts'
  /** 已按项目写作语言本地化的块名。 */
  label: string
  /** 可编辑块来自哪一层；自动块固定 auto。 */
  source: 'builtin' | 'global' | 'project' | 'auto'
  /** 硬规则 / 身份 / 工作规范可编辑；技能目录与项目信息只读。 */
  editable: boolean
  chars: number
  text: string
}

export interface AssistantPromptPreview {
  prompt: string
  blocks: AssistantPromptBlockView[]
  assistantType: AssistantType
}
