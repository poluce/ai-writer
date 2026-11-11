import { Bot, ClipboardCheck, DraftingCompass, ListTree, PenLine } from 'lucide-react'
import type { RightView } from '../../../stores/layout-store'

/** 右侧面板的五个助手视图；顺序即展示顺序。 */
export const ASSISTANT_VIEWS: ReadonlyArray<{
  id: RightView
  zh: string
  en: string
  Icon: typeof Bot
}> = [
  { id: 'agent', zh: '助手', en: 'Assistant', Icon: Bot },
  { id: 'architect', zh: '架构', en: 'Architect', Icon: DraftingCompass },
  { id: 'blueprint', zh: '蓝图', en: 'Blueprint', Icon: ListTree },
  { id: 'writer', zh: '写作', en: 'Write', Icon: PenLine },
  { id: 'review', zh: '审稿', en: 'Review', Icon: ClipboardCheck },
]
