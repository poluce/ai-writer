export const GENERATED_GLOBAL_GUIDANCE_MAX_CHARS = 600
export const GENERATED_GLOBAL_GUIDANCE_MIN_RULES = 4
export const GENERATED_GLOBAL_GUIDANCE_MAX_RULES = 8

const CHAPTER_OUTLINE_LINE = /^(?:[-*+]\s*|\d+[.)、]\s*)?(?:第\s*[0-9一二三四五六七八九十百零〇两]+\s*(?:[-–—~～至到]\s*[0-9一二三四五六七八九十百零〇两]+\s*)?章|chapters?\s+\d+(?:\s*[-–—~]\s*\d+)?)/iu

export function generatedGlobalGuidanceRuleCount(content: string): number {
  return content
    .split(/\r?\n/u)
    .map(rule => rule.trim())
    .filter(Boolean)
    .length
}

export function isGeneratedGlobalGuidanceValid(content: string): boolean {
  const ruleCount = generatedGlobalGuidanceRuleCount(content)
  const chapterOutlineLines = content
    .split(/\r?\n/u)
    .filter(line => CHAPTER_OUTLINE_LINE.test(line.trim()))
    .length
  return Array.from(content.trim()).length <= GENERATED_GLOBAL_GUIDANCE_MAX_CHARS
    && ruleCount >= GENERATED_GLOBAL_GUIDANCE_MIN_RULES
    && ruleCount <= GENERATED_GLOBAL_GUIDANCE_MAX_RULES
    && chapterOutlineLines < 2
}

export function preserveAuthorText(existing: string | undefined, generated: string | undefined): string {
  const authorText = existing?.trim() ?? ''
  const generatedText = generated?.trim() ?? ''
  if (!authorText) return generatedText
  if (!generatedText || generatedText.includes(authorText)) return generatedText || authorText
  return `${authorText}\n\n${generatedText}`
}
