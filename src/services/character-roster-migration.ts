import { randomUUID } from '../utils/id'
import { useLocaleStore } from '../stores/locale-store'
import { useProjectStore } from '../stores/project-store'
import {
  projectSessionContextFromProject,
  sameProjectPathKey,
  sameProjectSessionContext,
} from '../shared/project-session-context'
import { requireWorkflowProjectSession } from './workflows/workflow-project-session'

/**
 * 旧角色名单迁移的显式、安全入口。它会根据持久化状态执行“旧 Markdown
 * 迁移”为结构化名单，或“已有角色卡采用”为只读投影；正常角色架构不会
 * 启动 Markdown 提取。唯一写路径是 RepairLegacyCharacterRosterCommand 的
 * 结构化 roster commit。
 */
export async function migrateLegacyCharacterRoster(projectPath: string): Promise<void> {
  const text = useLocaleStore.getState().text
  const project = useProjectStore.getState().currentProject
  const projectSession = projectSessionContextFromProject(project)
  if (!project || !projectSession || !sameProjectPathKey(project.path, projectPath)) {
    throw new Error(text('当前项目已切换，请在原项目中重试', 'The project changed. Return to the original project and try again.'))
  }
  if (!sameProjectSessionContext(
    projectSession,
    projectSessionContextFromProject(useProjectStore.getState().currentProject),
  )) {
    throw new Error(text('当前项目已切换，请在原项目中重试', 'The project changed. Return to the original project and try again.'))
  }

  const { useWorkflowStore, workflowResourceKey } = await import('../stores/workflow-store')
  const runId = randomUUID()
  const completedRunId = await useWorkflowStore.getState().startWorkflow({
    runId,
    type: 'post_process',
    title: text('修复：旧角色名单', 'Repair: legacy character roster'),
    projectPath,
    projectSession,
    resourceKeys: [workflowResourceKey('character-roster')],
    steps: [{
      name: text('安全修复旧角色图谱', 'Safely repair the legacy character graph'),
      description: text(
        '只将保留的旧图谱原文转换为结构化角色名单；失败时不改动任何角色数据',
        'Convert preserved legacy graph evidence into a structured roster; failures leave all character data unchanged.',
      ),
      executor: async (_step, context, callbacks) => {
        const { RepairLegacyCharacterRosterCommand } = await import('./workflows/commands/legacy-character-roster-repair.command')
        const currentProject = useProjectStore.getState().currentProject
        const genre = sameProjectSessionContext(
          requireWorkflowProjectSession(context),
          projectSessionContextFromProject(currentProject),
        ) ? currentProject?.novelConfig.genre ?? '' : ''
        return new RepairLegacyCharacterRosterCommand({
          expectedProjectPath: projectPath,
          genre,
        }).execute({ step: _step, context, callbacks })
      },
    }],
  })
  const completedRun = useWorkflowStore.getState().history.find(run => run.id === completedRunId)
  if (!completedRun || completedRun.status !== 'completed') {
    throw new Error(completedRun?.error || text(
      '旧角色图谱修复未完成；原始图谱和已有角色卡均未被覆盖。',
      'Legacy character-graph repair did not complete; the original graph and existing cards were not overwritten.',
    ))
  }
}
