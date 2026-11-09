export type AssistantSurface = 'panel' | 'rail'

/**
 * 右侧助手区的两种形态：
 *
 * - 已打开项目且面板处于展开态 → 展开的面板（五个视图由面板头部切换器承担）；
 * - 其余情况 → 收起的窄图标条，保证入口常驻；
 *   未打开项目时图标条整体置灰，助手视图依赖项目事实，先把项目建起来。
 */
export function resolveAssistantSurface(aiPanelOpen: boolean, hasOpenProject: boolean): AssistantSurface {
  return aiPanelOpen && hasOpenProject ? 'panel' : 'rail'
}
