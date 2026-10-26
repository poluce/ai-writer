import { describe, expect, it } from 'vitest'

import { createRendererConsoleRecord } from '../renderer-console'

describe('createRendererConsoleRecord', () => {
  it('drops renderer info and verbose console output from the diagnostic file', () => {
    expect(createRendererConsoleRecord(0, 'verbose message', 1, 'app.js')).toBeNull()
    expect(createRendererConsoleRecord(1, 'info message', 1, 'app.js')).toBeNull()
  })

  it('keeps renderer warnings and errors with their location', () => {
    const warning = createRendererConsoleRecord(2, 'React warning', 42, 'app.js')
    const error = createRendererConsoleRecord(3, 'Uncaught TypeError', 43, 'app.js')

    expect(warning).toMatchObject({ level: 'info', scope: 'RendererConsole', event: 'React warning', line: 42 })
    expect(error).toMatchObject({ level: 'error', event: 'Uncaught TypeError', sourceId: 'app.js' })
  })

  it('skips structured [Vela ...] failures that already reach the log via the diagnostic sink', () => {
    expect(createRendererConsoleRecord(3, '[Vela Agent] prompt failed', 1, 'app.js')).toBeNull()
  })

  it('ignores blank messages and clips very long console output', () => {
    expect(createRendererConsoleRecord(3, '   ', 1, 'app.js')).toBeNull()
    const record = createRendererConsoleRecord(3, 'e'.repeat(10_000), 1, 'app.js')
    expect(record?.event.length).toBeLessThan(4_200)
    expect(record?.event).toContain('truncated')
  })
})
