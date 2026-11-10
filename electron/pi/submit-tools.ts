import type { AgentTool } from '@earendil-works/pi-agent-core'
import { Type, type TSchema } from '@earendil-works/pi-ai'

import type { SubmitToolName } from '../../src/shared/submit-contract'
import type { AnyAgentTool } from './tool-types'

/**
 * Submit-contract tools for one-shot pi-ai calls. The model returns the
 * artifact as tool arguments; schema replaces prompt-level JSON/XML contracts.
 * Commands still run domain validators after this seam.
 */

function buildSubmitTool<TSchemaType extends TSchema>(
  name: string,
  label: string,
  description: string,
  schema: TSchemaType,
): AgentTool<TSchemaType> {
  return {
    name,
    label,
    description,
    parameters: schema,
    execute: async (_id, params) => ({
      content: [{ type: 'text', text: JSON.stringify(params) }],
      details: params,
    }),
  }
}

const CharacterRoleSchema = Type.Union([
  Type.Literal('protagonist'),
  Type.Literal('antagonist'),
  Type.Literal('supporting'),
  Type.Literal('minor'),
])

function draftSchema() {
  return Type.Object({
    title: Type.String(),
    body: Type.String(),
  })
}

function finalizationSchema() {
  return Type.Object({
    body: Type.String(),
  })
}

function reviewSchema() {
  return Type.Object({
    summary: Type.String(),
    items: Type.Array(Type.Object({
      category: Type.String(),
      severity: Type.Union([
        Type.Literal('error'),
        Type.Literal('warning'),
        Type.Literal('pass'),
      ]),
      description: Type.String(),
      quote: Type.Optional(Type.String()),
    })),
    goalReviews: Type.Optional(Type.Array(Type.Object({
      id: Type.String(),
      evidence: Type.Array(Type.Object({
        quote: Type.String(),
      })),
      description: Type.String(),
      status: Type.Union([
        Type.Literal('completed'),
        Type.Literal('unmet'),
        Type.Literal('unknown'),
      ]),
    }))),
  })
}

function outlineSchema() {
  return Type.Object({
    premise: Type.String(),
    worldbuilding: Type.String(),
    characters: Type.String(),
    synopsis: Type.String(),
  })
}

function blueprintItemSchema() {
  return Type.Object({
    chapterNumber: Type.Integer(),
    title: Type.String(),
    role: Type.String(),
    purpose: Type.String(),
    keyEvents: Type.String(),
    characters: Type.Array(Type.String()),
    relationships: Type.Array(Type.Object({
      from: Type.String(),
      to: Type.String(),
      relation: Type.String(),
    })),
    suspenseHook: Type.String(),
    newCharacterCandidates: Type.Optional(Type.Array(Type.Object({
      name: Type.String(),
      role: CharacterRoleSchema,
    }))),
  })
}

function blueprintSchema() {
  return Type.Object({
    blueprints: Type.Array(blueprintItemSchema()),
  })
}

function fieldSchema() {
  return Type.Object({
    value: Type.String(),
  })
}

function styleSchema() {
  return Type.Object({
    analysis: Type.String(),
  })
}

function textSchema() {
  return Type.Object({
    text: Type.String(),
  })
}

function novelConfigSchema() {
  return Type.Object({
    genre: Type.String(),
    targetAudience: Type.String(),
    subGenre: Type.String(),
    plotStructure: Type.Union([
      Type.Literal('three_act'),
      Type.Literal('heros_journey'),
      Type.Literal('save_the_cat'),
      Type.Literal('kishotenketsu'),
      Type.Literal('multi_thread'),
      Type.Literal('freeform'),
    ]),
    narrativePOV: Type.Union([
      Type.Literal('third_limited'),
      Type.Literal('first_person'),
      Type.Literal('third_omniscient'),
      Type.Literal('multi_pov'),
    ]),
    coreOutline: Type.String(),
    worldSetting: Type.String(),
    goldenFinger: Type.String(),
    protagonistProfile: Type.String(),
    globalGuidance: Type.String(),
    writingStyle: Type.String(),
    totalChapters: Type.Optional(Type.Integer()),
    wordsPerChapter: Type.Optional(Type.Integer()),
    referenceWorks: Type.Optional(Type.String()),
  })
}

const WorldMapDirectionSchema = Type.Union([
  Type.Literal('center'),
  Type.Literal('north'),
  Type.Literal('northeast'),
  Type.Literal('east'),
  Type.Literal('southeast'),
  Type.Literal('south'),
  Type.Literal('southwest'),
  Type.Literal('west'),
  Type.Literal('northwest'),
])

function worldMapSchema() {
  return Type.Object({
    worldName: Type.String({ description: '世界名称（短名，例如：九域）' }),
    premise: Type.String({ description: '一句话世界前提，说明这个世界的核心矛盾' }),
    tiers: Type.Array(Type.Object({
      name: Type.String({ description: '势力等级名称，例如：超一流、一流、二流、三流' }),
      order: Type.Optional(Type.Number({ description: '从 1 开始的等级顺序，1 为最高' })),
    }), { description: '势力等级阶梯；2–10 档，按强弱排序' }),
    realms: Type.Array(Type.Object({
      name: Type.String({ description: '修行境界名称，例如：练气、筑基、金丹、元婴' }),
      order: Type.Optional(Type.Number({ description: '从 1 开始的境界顺序' })),
      note: Type.Optional(Type.String({ description: '该境界的一句说明，可为空' })),
    }), { description: '修行境界阶梯；2–16 阶，按高低排序' }),
    regions: Type.Array(Type.Object({
      name: Type.String({ description: '区域名称，例如：北境' }),
      continent: Type.String({ description: '所属大陆名称，例如：玄洲' }),
      direction: WorldMapDirectionSchema,
      terrain: Type.String({ description: '地形，例如：雪山、群岛、荒漠' }),
      summary: Type.String({ description: '区域一句话设定' }),
      adjacent: Type.Array(Type.String(), { description: '相邻区域名称；必须在本数组内存在' }),
      controllingFaction: Type.Optional(Type.String({ description: '实际控制该区域的势力名称；必须在本数组内存在' })),
    }), { description: '世界区域；2–24 个，覆盖大陆与海域' }),
    factions: Type.Array(Type.Object({
      name: Type.String({ description: '势力名称，例如：天枢宗' }),
      kind: Type.Union([
        Type.Literal('sect'),
        Type.Literal('dynasty'),
        Type.Literal('organization'),
      ], { description: '势力类型：sect=宗门，dynasty=王朝，organization=其他组织' }),
      region: Type.String({ description: '所在地区域名称，必须存在于 regions' }),
      tier: Type.String({ description: '势力等级名称，必须存在于 tiers' }),
      resource: Type.String({ description: '掌控的核心资源或权柄' }),
      summary: Type.String({ description: '势力一句话定位' }),
      leader: Type.Optional(Type.String({ description: '掌门/首领姓名' })),
      realm: Type.Optional(Type.String({ description: '首领境界名称，必须存在于 realms' })),
    }), { description: '势力；1–40 个，至少包含两个相互竞争的势力' }),
    relations: Type.Array(Type.Object({
      from: Type.String({ description: '起点势力名称' }),
      to: Type.String({ description: '终点势力名称' }),
      kind: Type.Union([
        Type.Literal('ally'),
        Type.Literal('enemy'),
        Type.Literal('neutral'),
      ], { description: '关系类型：ally=同盟，enemy=敌对，neutral=中立' }),
      note: Type.Optional(Type.String({ description: '关系原因的一句话说明' })),
    }), { description: '势力关系；0–60 条，只写会影响剧情的核心关系' }),
  })
}

/** Open JSON document: the tool arguments are the artifact root. */
function jsonSchema() {
  return Type.Unknown()
}

/** Full novel configuration artifact. */
export function submitNovelConfigTool(): AgentTool<ReturnType<typeof novelConfigSchema>> {
  return buildSubmitTool(
    'submit_novel_config',
    'Submit Novel Config',
    'Submit the verified full novel configuration artifact.',
    novelConfigSchema(),
  )
}

/** Draft / revision: title + full body. */
export function submitDraftTool(): AgentTool<ReturnType<typeof draftSchema>> {
  return buildSubmitTool(
    'submit_draft',
    'Submit Draft',
    'Submit the chapter draft as the artifact: a title and the full body text.',
    draftSchema(),
  )
}

/** Same contract as draft; used by refine-draft / refine-from-review. */
export function submitRevisionTool(): AgentTool<ReturnType<typeof draftSchema>> {
  return buildSubmitTool(
    'submit_revision',
    'Submit Revision',
    'Submit the revised chapter as the artifact: a title and the full body text.',
    draftSchema(),
  )
}

/** Finalized chapter body. */
export function submitFinalizationTool(): AgentTool<ReturnType<typeof finalizationSchema>> {
  return buildSubmitTool(
    'submit_finalization',
    'Submit Finalization',
    'Submit the finalized chapter body as the artifact.',
    finalizationSchema(),
  )
}

/** Review: summary + items + optional goalReviews (Issue #205). */
export function submitReviewTool(): AgentTool<ReturnType<typeof reviewSchema>> {
  return buildSubmitTool(
    'submit_review',
    'Submit Review',
    'Submit the chapter review: summary, items (category/severity/description/optional quote), and optional goalReviews.',
    reviewSchema(),
  )
}

/** Architecture four-part outline. */
export function submitOutlineTool(): AgentTool<ReturnType<typeof outlineSchema>> {
  return buildSubmitTool(
    'submit_outline',
    'Submit Outline',
    'Submit the story architecture: premise, worldbuilding, character graph, and plot synopsis.',
    outlineSchema(),
  )
}

/** Chapter blueprint batch matching the semantic contract. */
export function submitBlueprintTool(): AgentTool<ReturnType<typeof blueprintSchema>> {
  return buildSubmitTool(
    'submit_blueprint',
    'Submit Blueprint',
    'Submit chapter blueprints as {"blueprints":[...]} with chapterNumber, title, role, purpose, keyEvents, characters, relationships, and suspenseHook.',
    blueprintSchema(),
  )
}

/** Single generated field (goldfinger / world / protagonist archive). */
export function submitFieldTool(): AgentTool<ReturnType<typeof fieldSchema>> {
  return buildSubmitTool(
    'submit_field',
    'Submit Field',
    'Submit the generated field value as the artifact.',
    fieldSchema(),
  )
}

/** Style analysis prose. */
export function submitStyleAnalysisTool(): AgentTool<ReturnType<typeof styleSchema>> {
  return buildSubmitTool(
    'submit_style_analysis',
    'Submit Style Analysis',
    'Submit the style analysis as the artifact.',
    styleSchema(),
  )
}

/** Visible-text one-shot (editor selection, free-form). */
export function submitTextTool(): AgentTool<ReturnType<typeof textSchema>> {
  return buildSubmitTool(
    'submit_text',
    'Submit Text',
    'Submit a visible-text artifact. Use this when the product expects prose rather than a structured record.',
    textSchema(),
  )
}

/** Structured JSON whose root object is the command artifact. */
export function submitJsonTool(): AgentTool<ReturnType<typeof jsonSchema>> {
  return buildSubmitTool(
    'submit_json',
    'Submit JSON',
    'Submit a JSON object artifact. The tool arguments are the document root, not a wrapped string.',
    jsonSchema(),
  )
}

/** 世界地图：世界名、区域、势力、双阶梯与关系。 */
export function submitWorldMapTool(): AgentTool<ReturnType<typeof worldMapSchema>> {
  return buildSubmitTool(
    'submit_world_map',
    'Submit World Map',
    'Submit a complete world map artifact: world name, premise, regions, factions, tier ladder, realm ladder, and relations. Reference regions/factions/tiers/realms by name; the app resolves IDs.',
    worldMapSchema(),
  )
}

export function createSubmitTool(name: SubmitToolName): AnyAgentTool {
  switch (name) {
    case 'submit_draft': return submitDraftTool()
    case 'submit_revision': return submitRevisionTool()
    case 'submit_finalization': return submitFinalizationTool()
    case 'submit_review': return submitReviewTool()
    case 'submit_outline': return submitOutlineTool()
    case 'submit_blueprint': return submitBlueprintTool()
    case 'submit_field': return submitFieldTool()
    case 'submit_style_analysis': return submitStyleAnalysisTool()
    case 'submit_text': return submitTextTool()
    case 'submit_json': return submitJsonTool()
    case 'submit_novel_config': return submitNovelConfigTool()
    case 'submit_world_map': return submitWorldMapTool()
  }
}

/** Map a submit artifact onto the string the existing command layer consumes. */
export function visibleTextFromSubmitArtifact(
  name: SubmitToolName,
  artifact: Record<string, unknown> | undefined,
  text: string,
): string {
  if (!artifact) return text
  if (name === 'submit_field' && typeof artifact.value === 'string') return artifact.value
  if (name === 'submit_text' && typeof artifact.text === 'string') return artifact.text
  if (name === 'submit_style_analysis' && typeof artifact.analysis === 'string') return artifact.analysis
  if ((name === 'submit_draft' || name === 'submit_revision' || name === 'submit_finalization')
    && typeof artifact.body === 'string') {
    return artifact.body
  }
  // Structured contracts (review/blueprint/outline/…) must not be displaced by
  // interleaved visible text that providers emit alongside the tool call.
  return JSON.stringify(artifact)
}
