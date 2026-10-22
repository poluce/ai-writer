import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 分层契约测试 — 模块间低耦合的可执行守护（fitness function）。
 *
 * 每条规则对应一条架构不变量，违规时直接红灯并打印证据路径：
 *  R1 状态层/服务层/共享层不得依赖视图层（components）
 *  R2 共享契约层不得依赖任何业务上层（stores/services/components）
 *  R3 主进程的运行时闭包不得进入渲染层传输/状态/视图（ipc-client、stores、components）
 *  R4 根级辅助层（hooks/utils/lib/tokens/i18n）不得依赖业务层
 *  R5 运行时（值）依赖图约束：
 *     R5a shared 与 electron 子图必须是无环 DAG
 *     R5b 全图（src + electron）无环——新增任何静态值边或动态 import() 环都会红灯
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SOURCE_ROOTS = ['src', 'electron']
const SKIP_DIRS = new Set(['node_modules', '__tests__', 'stories'])

const VALUE_EDGE_ROOTS = ['src/shared', 'electron']

interface ImportEdge {
  target: string
  kind: 'value' | 'type'
}

interface SourceFile {
  /** 仓库相对路径，统一正斜杠 */
  rel: string
  imports: ImportEdge[]
}

function isSkippedDir(name: string): boolean {
  return name.startsWith('.') || SKIP_DIRS.has(name)
}

function collectSourceFiles(): string[] {
  const files: string[] = []
  for (const root of SOURCE_ROOTS) {
    const walk = (dir: string): void => {
      for (const entry of readdirSync(path.join(repositoryRoot, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`
        if (entry.isDirectory()) {
          if (!isSkippedDir(entry.name)) walk(rel)
        } else if (/\.(ts|tsx)$/.test(entry.name)
          && !/\.test\.|\.browser\.|\.d\.ts/.test(entry.name)) {
          files.push(rel)
        }
      }
    }
    walk(root)
  }
  return files
}

function parseImportEdges(source: string): ImportEdge[] {
  const edges: ImportEdge[] = []

  // 动态 import('...') 永远是运行时边（即使只解构类型，也会真实加载模块）。
  for (const match of source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    edges.push({ target: match[1], kind: 'value' })
  }

  // 静态 import/export...from 语句：以行首 import/export 锚定，from 终结一条语句。
  for (const match of source.matchAll(/(?:^|\n)\s*(?:import|export)\b[\s\S]*?from\s+['"]([^'"]+)['"]/g)) {
    const statement = match[0]
    const target = match[1]
    if (/import\s*\(/.test(statement)) continue
    const isTypeOnly = /^\s*(?:import|export)\s+type\b/.test(statement)
      || isNamedTypeOnlyImport(statement)
    edges.push({ target, kind: isTypeOnly ? 'type' : 'value' })
  }

  return edges
}

function isNamedTypeOnlyImport(statement: string): boolean {
  const named = statement.match(/\n?\s*import\s*\{([^}]*)\}/)
  if (!named) return false
  const bindings = named[1].split(',').map(item => item.trim()).filter(Boolean)
  return bindings.length > 0 && bindings.every(item => /^type\s/.test(item))
}

function resolveTarget(fromRel: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null
  const fromAbs = path.resolve(repositoryRoot, fromRel)
  const base = path.resolve(path.dirname(fromAbs), specifier)
  for (const candidate of [base + '.ts', base + '.tsx', base + '.mts',
    path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    const rel = path.relative(repositoryRoot, candidate)
    if (rel && !rel.startsWith('..')) return rel.split(path.sep).join('/')
  }
  return null
}

function loadSources(): SourceFile[] {
  return collectSourceFiles().map(rel => ({
    rel,
    imports: parseImportEdges(readFileSync(path.join(repositoryRoot, rel), 'utf8'))
      .map(edge => ({ ...edge, target: resolveTarget(rel, edge.target) ?? '' }))
      .filter(edge => edge.target !== ''),
  }))
}

function layerOf(rel: string): string {
  if (rel.startsWith('electron/')) return 'electron'
  if (rel.startsWith('src/components/')) return 'components'
  if (rel.startsWith('src/stores/')) return 'stores'
  if (rel.startsWith('src/services/')) return 'services'
  if (rel.startsWith('src/shared/')) return 'shared'
  if (/^src\/(hooks|utils|lib|tokens|i18n)\//.test(rel)) return 'helpers'
  if (rel.startsWith('src/prompts/')) return 'prompts'
  return 'other'
}

const FORBIDDEN_VIEW_LAYERS: Record<string, string[]> = {
  stores: ['src/components/'],
  services: ['src/components/'],
  shared: ['src/components/'],
}
const SHARED_FORBIDDEN_PREFIXES = ['src/stores/', 'src/services/', 'src/components/']
const HELPERS_FORBIDDEN_PREFIXES = ['src/components/', 'src/stores/', 'src/services/']

function buildValueGraph(sources: SourceFile[]): Map<string, string[]> {
  const graph = new Map<string, string[]>()
  for (const file of sources) {
    graph.set(file.rel, file.imports
      .filter(edge => edge.kind === 'value')
      .map(edge => edge.target))
  }
  return graph
}

function tarjanSccs(graph: Map<string, string[]>): string[][] {
  const nodes = [...graph.keys()]
  const index = new Map<string, number>(nodes.map((node, i) => [node, i]))
  const ids = nodes.map(() => -1)
  const low = nodes.map(() => 0)
  const onStack = nodes.map(() => false)
  const stack: number[] = []
  const sccs: string[][] = []
  let counter = 0

  const dfs = (u: number): void => {
    low[u] = ids[u] = counter++
    onStack[u] = true
    stack.push(u)
    for (const target of graph.get(nodes[u]) ?? []) {
      const v = index.get(target)
      if (v === undefined) continue
      if (ids[v] === -1) dfs(v)
      if (onStack[v]) low[u] = Math.min(low[u], low[v])
    }
    if (low[u] === ids[u]) {
      const component: string[] = []
      let v: number
      do {
        v = stack.pop() as number
        onStack[v] = false
        component.push(nodes[v])
      } while (v !== u)
      if (component.length > 1) sccs.push(component.sort())
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    if (ids[i] === -1) dfs(i)
  }
  return sccs
}

function reachableTargets(graph: Map<string, string[]>, from: string): Set<string> {
  const visited = new Set<string>()
  const queue = [...(graph.get(from) ?? [])]
  while (queue.length > 0) {
    const current = queue.pop() as string
    if (visited.has(current)) continue
    visited.add(current)
    for (const next of graph.get(current) ?? []) queue.push(next)
  }
  return visited
}

describe('layering contract', () => {
  const sources = loadSources()

  it('R1: 状态层/服务层/共享层不得依赖视图层 components', () => {
    const violations: string[] = []
    for (const file of sources) {
      const forbidden = FORBIDDEN_VIEW_LAYERS[layerOf(file.rel)]
      if (!forbidden) continue
      for (const edge of file.imports) {
        if (forbidden.some(prefix => edge.target.startsWith(prefix))) {
          violations.push(`${file.rel} -> ${edge.target} [${edge.kind}]`)
        }
      }
    }
    expect(violations, `发现视图层反向依赖：\n${violations.join('\n')}`).toEqual([])
  })

  it('R2: 共享契约层不得依赖 stores/services/components（含类型边）', () => {
    const violations: string[] = []
    for (const file of sources) {
      if (layerOf(file.rel) !== 'shared') continue
      for (const edge of file.imports) {
        if (SHARED_FORBIDDEN_PREFIXES.some(prefix => edge.target.startsWith(prefix))) {
          violations.push(`${file.rel} -> ${edge.target} [${edge.kind}]`)
        }
      }
    }
    expect(violations, `共享层依赖了业务上层：\n${violations.join('\n')}`).toEqual([])
  })

  it('R4: 根级辅助层不得依赖 components/stores/services', () => {
    const violations: string[] = []
    for (const file of sources) {
      if (layerOf(file.rel) !== 'helpers') continue
      for (const edge of file.imports) {
        if (HELPERS_FORBIDDEN_PREFIXES.some(prefix => edge.target.startsWith(prefix))) {
          violations.push(`${file.rel} -> ${edge.target} [${edge.kind}]`)
        }
      }
    }
    expect(violations, `辅助层依赖了业务层：\n${violations.join('\n')}`).toEqual([])
  })

  it('R3: 主进程运行时闭包不得进入渲染层传输/状态/视图', () => {
    const valueGraph = buildValueGraph(sources)
    const violations: string[] = []
    for (const file of sources) {
      if (layerOf(file.rel) !== 'electron') continue
      for (const reached of reachableTargets(valueGraph, file.rel)) {
        const isRendererTransport = reached === 'src/services/ipc-client.ts'
        const isRendererStateOrView = reached.startsWith('src/stores/') || reached.startsWith('src/components/')
        if (isRendererTransport || isRendererStateOrView) {
          violations.push(`${file.rel} 运行时闭包包含 ${reached}`)
        }
      }
    }
    expect(violations, `主进程闭包进入渲染层：\n${[...new Set(violations)].join('\n')}`).toEqual([])
  })

  it('R5a: shared 与 electron 的运行时依赖图必须无环', () => {
    const valueGraph = buildValueGraph(sources.filter(file =>
      VALUE_EDGE_ROOTS.some(prefix => file.rel.startsWith(prefix))))
    const sccs = tarjanSccs(valueGraph)
    expect(sccs, `shared/electron 出现运行时环：\n${sccs.map(c => c.join(' <-> ')).join('\n')}`).toEqual([])
  })

  it('R5b: 运行时（值）依赖图全图无环', () => {
    const valueGraph = buildValueGraph(sources)
    const sccs = tarjanSccs(valueGraph)
    expect(sccs, `运行时依赖图出现环：\n${sccs.map(c => c.join(' <-> ')).join('\n')}`).toEqual([])
  })
})