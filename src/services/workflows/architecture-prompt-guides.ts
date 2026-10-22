/**
 * 架构生成指导文本 — 纯函数叶子模块。
 *
 * 从 architecture-workflow 拆出：plot-architecture 命令在构造提示词时消费
 * 这些指导文本；独立成模块后命令不再回引工作流编排，消除运行时环。
 */

import type { WritingLanguage } from '../../shared/writing-language'
import { promptLanguageText } from '../prompt-language'

export function getPlotStructureGuide(
  structure: string,
  totalChapters: number,
  writingLanguage: WritingLanguage,
): string {
  const language = writingLanguage
  const ch20 = Math.round(totalChapters * 0.2)
  const ch25 = Math.round(totalChapters * 0.25)
  const ch50 = Math.round(totalChapters * 0.5)
  const ch75 = Math.round(totalChapters * 0.75)

  switch (structure) {
    case 'heros_journey':
      return promptLanguageText(language, `【英雄之旅·十二阶段】（严格按以下阶段组织大纲）\n建议章节分配：全书共 ${totalChapters} 章...`, `[Hero's journey — twelve stages]\nOrganize the outline across exactly ${totalChapters} chapters.`)
    case 'save_the_cat':
      return promptLanguageText(language, `【节拍表·十五拍】（严格按以下节拍组织大纲）\n建议章节分配：全书共 ${totalChapters} 章...`, `[Save the Cat — fifteen beats]\nOrganize the beats across exactly ${totalChapters} chapters.`)
    case 'kishotenketsu':
      return promptLanguageText(language, `【起承转合·四段式】（严格按以下四段组织大纲）
建议章节分配：全书共 ${totalChapters} 章
起（约第1章~第${ch25}章，占总篇幅约25%）：介绍世界、角色和日常，建立读者认同
承（约第${ch25 + 1}章~第${ch50}章，占总篇幅约25%）：延续与深化，展现角色关系和冲突苗头
转（约第${ch50 + 1}章~第${ch75}章，占总篇幅约25%）：核心转折，出人意料的变化打破既有格局
合（约第${ch75 + 1}章~第${totalChapters}章，占总篇幅约25%）：收束所有线索，揭示主题，给出结局`, `[Kishōtenketsu — four parts]
Ki, chapters 1–${ch25}: establish the world and characters.
Shō, chapters ${ch25 + 1}–${ch50}: develop relationships and emerging tensions.
Ten, chapters ${ch50 + 1}–${ch75}: introduce the central reversal.
Ketsu, chapters ${ch75 + 1}–${totalChapters}: connect the threads, reveal the theme, and resolve the story.`)
    case 'multi_thread':
      return promptLanguageText(language, `【多线叙事】（按多条故事线并行推进的方式组织大纲）
建议章节分配：全书共 ${totalChapters} 章
需要明确以下要素：
1. 主线数量：设定2-4条独立又交织的故事线，每条有独立主角或视角
2. 交汇节点：每条线在第${ch25}章、第${ch50}章、第${ch75}章左右安排交汇碰撞
3. 节奏编排：各线交替出现的节奏，避免某条线长期消失
4. 最终合流：在第${ch75}章前后所有线索开始汇聚，走向统一高潮`, `[Multi-thread structure]
Plan 2–4 distinct but intersecting lines across ${totalChapters} chapters.
Create collisions near chapters ${ch25}, ${ch50}, and ${ch75}; rotate viewpoints without abandoning a line; begin the final convergence near chapter ${ch75}.`)
    case 'freeform':
      return promptLanguageText(language, `【自由结构】（不限定特定叙事框架，根据故事内容自然编排）
全书共 ${totalChapters} 章。
请根据故事类型和内容特点自行设计最合适的叙事节奏。
核心原则：
1. 保证每10-20章有一个小高潮或悬念释放点
2. 全书应有清晰的开篇建置（前10-15%）和收尾段落（后10-15%）
3. 中段避免节奏单一，适时安排转折点
4. 允许插叙、倒叙、片段式叙事等灵活手法`, `[Freeform structure]
Design the most suitable rhythm across ${totalChapters} chapters. Establish a clear opening and ending, vary the middle, release suspense regularly, and use nonlinear techniques only when they serve the story.`)
    case 'three_act':
    default:
      return promptLanguageText(language, `【三幕结构】（严格按以下结构组织大纲）
建议章节分配：全书共 ${totalChapters} 章
第一幕：建置（约第1章~第${ch20}章，占总篇幅约20%）
第二幕：对抗与发展（约第${ch20 + 1}章~第${ch75}章，占总篇幅约55%）
第三幕：高潮与结局（约第${ch75 + 1}章~第${totalChapters}章，占总篇幅约25%）`, `[Three-act structure]
Act I — setup: chapters 1–${ch20}.
Act II — confrontation and development: chapters ${ch20 + 1}–${ch75}.
Act III — climax and resolution: chapters ${ch75 + 1}–${totalChapters}.`)
  }
}

export function getNarrativePOVLabel(pov: string, writingLanguage: WritingLanguage): string {
  const language = writingLanguage
  const labels: Record<WritingLanguage, Record<string, string>> = {
    'zh-CN': {
    first_person: '第一人称',
    third_limited: '第三人称有限视角',
    third_omniscient: '第三人称全知视角',
    multi_pov: '多视角轮换',
    },
    'en-US': {
      first_person: 'first person',
      third_limited: 'third-person limited',
      third_omniscient: 'third-person omniscient',
      multi_pov: 'rotating multiple viewpoints',
    },
  }
  return labels[language][pov] || pov
}