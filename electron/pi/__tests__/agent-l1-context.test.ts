import { describe, expect, it } from 'vitest'

import {
  buildAppContextEnvelope,
  buildL1AgentContext,
  composeUserMessageWithAppContext,
  extractAuthorMessageText,
} from '../agent-l1-context'

describe('buildL1AgentContext', () => {
  it('states that no novel project is open', () => {
    const text = buildL1AgentContext({
      tabs: [],
      project: { open: false },
      layout: {
        sidebarView: 'project',
        rightView: 'agent',
        bottomPanelOpen: false,
        bottomTab: 'tasks',
        settingsOpen: false,
        newProjectOpen: false,
        importNovelOpen: false,
        chapterCreationOpen: false,
      },
    }, 'zh-CN')

    expect(text).toContain('## 应用状态')
    expect(text).toContain('当前小说项目：未打开')
    expect(text).toContain('左侧栏: 项目')
  })

  it('names the file the user is viewing without injecting its body', () => {
    const text = buildL1AgentContext({
      tabs: [
        { name: '第1章', type: 'chapter', active: true, unsaved: true },
        { name: '角色卡', type: 'character', active: false, unsaved: false },
      ],
      project: { open: true, name: '测试书' },
    }, 'zh-CN')

    expect(text).toContain('当前小说项目：已打开「测试书」')
    expect(text).toContain('## 编辑器状态')
    expect(text).toContain('第1章 (chapter) [当前活跃] [未保存]')
    expect(text).toContain('角色卡 (character)')
    expect(text).toContain('用户正在查看「第1章」')
    expect(text).toContain('需要正文时请用工具读取')
    expect(text).not.toContain('当前活跃文件内容')
    expect(text).not.toContain('林舟')
    expect(text).not.toContain('<tool_call>')
  })

  it('localizes labels and uses the workflow type in English', () => {
    const text = buildL1AgentContext({
      tabs: [{ name: 'Chapter 1', type: 'chapter', active: true, unsaved: false }],
      workflow: { title: '起草第一章', type: 'chapter_creation', currentStepIndex: 0, stepCount: 3 },
      project: { open: true, name: 'Book' },
      changes: [{ kind: 'project', from: 'closed', to: 'open:/tmp/book' }],
    }, 'en-US')

    expect(text).toContain('App state')
    expect(text).toContain('Editor state')
    expect(text).toContain('[active]')
    expect(text).toContain('Workflow status')
    expect(text).toContain('chapter_creation')
    expect(text).toContain('progress')
    expect(text).toContain('UI changes since the last turn')
    expect(text).not.toContain('起草第一章')
    expect(text).not.toContain('编辑器状态')
  })
})

describe('buildAppContextEnvelope', () => {
  it('wraps the snapshot in XML and marks it as system-attached, not author speech', () => {
    const envelope = buildAppContextEnvelope({
      tabs: [],
      project: { open: true, name: '测试书' },
    }, 'zh-CN')

    expect(envelope).toContain('<system_context>')
    expect(envelope).toContain('</system_context>')
    expect(envelope).toContain('不是作者的发言')
    expect(envelope).toContain('当前小说项目：已打开「测试书」')
  })

  it('returns null when there is no snapshot to inject', () => {
    expect(buildAppContextEnvelope(null, 'zh-CN')).toBeNull()
    expect(buildAppContextEnvelope(undefined, 'en-US')).toBeNull()
  })
})

describe('composeUserMessageWithAppContext / extractAuthorMessageText', () => {
  it('round-trips the author text while keeping the context block in the stored message', () => {
    const envelope = '<system_context>\n状态\n</system_context>'
    const wrapped = composeUserMessageWithAppContext('写第三章', envelope)

    expect(wrapped).toContain('<user_message>\n写第三章\n</user_message>')
    expect(wrapped.indexOf('<system_context>')).toBeLessThan(wrapped.indexOf('<user_message>'))
    expect(extractAuthorMessageText(wrapped)).toBe('写第三章')
  })

  it('leaves legacy messages without an envelope untouched', () => {
    expect(extractAuthorMessageText('随便聊聊')).toBe('随便聊聊')
  })
})
