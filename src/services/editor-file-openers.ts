import { useEditorStore } from '../stores/editor-store'
import { readActiveProject } from './active-project'

/**
 * 打开内置编辑器 — 跨 Store 编排（读 project-store、写 editor-store）。
 * 按项目分层惯例放在 Service 层：组件层与渲染端动作编排共用，避免
 * Service 反向依赖 components。
 */
export function openBuiltinEditor(
  id: string,
  name: string,
  type: 'chapter-card' | 'character' | 'world-building' | 'synopsis' | 'narrative-thread',
  narrativeThreadView?: 'plot-tree' | 'plans',
  chapterNumber?: number,
): void {
  const projectKey = readActiveProject()?.path
  useEditorStore.getState().openFile({
    id,
    name,
    type,
    ...(type === 'narrative-thread'
      ? { narrativeThreadView: narrativeThreadView ?? 'plans' }
      : {}),
    ...(type === 'chapter-card' && chapterNumber !== undefined ? { chapterNumber } : {}),
    ...(projectKey ? { projectKey } : {})})
}