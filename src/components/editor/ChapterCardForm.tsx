/**
 * 章节卡片/蓝图详情编辑表单 — 单章信息编辑、微操指导、要点与快捷操作。
 * 从 ChapterCardEditor 拆出的受控展示与表单组件。
 */

import { BookOpen, PenLine, Save, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Label } from '../ui/Label'
import { NativeSelect } from '../ui/NativeSelect'
import { Textarea } from '../ui/Textarea'
import { useLocaleStore } from '../../stores/locale-store'
import type { ChapterBlueprint } from '../../services/workflows/directory-workflow'
import type { EditableChapterBlueprintField } from '../../stores/chapter-card-draft-ledger'
import { ROLES, roleLabel } from './chapter-card-shared'

export interface ChapterCardFormProps {
  selected: ChapterBlueprint | null
  nextWritableBlueprint?: ChapterBlueprint | null
  onUpdateField: (field: EditableChapterBlueprintField, value: any) => void
  onWriteChapter: (blueprint: ChapterBlueprint) => void
  onDeleteChapter: () => void
  onSaveOne: () => void
  saving: boolean
}

export function ChapterCardForm({
  selected,
  nextWritableBlueprint,
  onUpdateField,
  onWriteChapter,
  onDeleteChapter,
  onSaveOne,
  saving,
}: ChapterCardFormProps) {
  const text = useLocaleStore(s => s.text)
  const locale = useLocaleStore(s => s.locale)

  if (!selected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 opacity-30">
        <BookOpen size={36} />
        <span className="text-sm">{text('在左侧选择一章开始编辑', 'Choose a chapter on the left to start editing')}</span>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-5 py-4">
      {/* 编辑区头部 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
          {text(
            `第 ${selected.chapterNumber} 章：${selected.title || '未命名'}`,
            `Chapter ${selected.chapterNumber}: ${selected.title || 'Untitled'}`,
          )}
        </h3>
        <div className="flex items-center gap-1.5">
          {/* 仅下一章允许写作 */}
          {nextWritableBlueprint && selected.chapterNumber === nextWritableBlueprint.chapterNumber && (
            <Button
              variant="ai"
              size="sm"
              onClick={() => onWriteChapter(selected)}
              title={text('以当前蓝图信息生成草稿', 'Create a draft from this blueprint')}
            >
              <PenLine size={12} /> {text('写作此章', 'Write this chapter')}
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={onDeleteChapter} title={text('删除此章', 'Delete this chapter')}>
            <Trash2 size={12} />
            {text('删除此章', 'Delete chapter')}
          </Button>
          <Button variant="outline" size="sm" onClick={onSaveOne} disabled={saving}>
            <Save size={12} /> {saving ? text('保存中...', 'Saving...') : text('保存', 'Save')}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {/* 基本信息 */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>{text('章节号', 'Chapter number')}</Label>
            <Input
              type="number"
              value={selected.chapterNumber}
              readOnly
              aria-readonly="true"
              title={text('章节号是现有内容的稳定标识，不能在普通编辑中修改', 'The chapter number is a stable identifier and cannot be changed in ordinary editing.')}
            />
          </div>
          <div className="col-span-2">
            <Label>{text('章节标题', 'Chapter title')}</Label>
            <Input
              value={selected.title}
              onChange={e => onUpdateField('title', e.target.value)}
              placeholder={text('引人入胜的章节标题', 'A compelling chapter title')}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{text('章节定位', 'Chapter role')}</Label>
            <NativeSelect value={selected.role} onChange={e => onUpdateField('role', e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{roleLabel(r, text)}</option>)}
            </NativeSelect>
          </div>
          <div>
            <Label>{text('出场关键人（逗号分隔）', 'Key characters (comma-separated)')}</Label>
            <Input
              value={selected.characters.join('、')}
              onChange={e => onUpdateField('characters', e.target.value.split(/[,，、\s]+/).filter(Boolean))}
              placeholder={text('如：主角、反派A', 'For example: protagonist, antagonist A')}
            />
          </div>
        </div>

        <div>
          <Label>{text('主角小目标（本章最想解决的事）', 'Protagonist goal (the main thing to resolve in this chapter)')}</Label>
          <Textarea
            value={selected.purpose}
            onChange={e => onUpdateField('purpose', e.target.value)}
            placeholder={text('本章主角最迫切要解决的一件事...', 'The most urgent thing the protagonist needs to resolve in this chapter...')}
            rows={2}
          />
        </div>

        <div>
          <Label>{text('实质冲突与转折', 'Core conflict and turning point')}</Label>
          <Textarea
            value={selected.keyEvents}
            onChange={e => onUpdateField('keyEvents', e.target.value)}
            placeholder={text('主角做了什么，遭遇了什么反转，金手指怎么用的...', 'What the protagonist does, the reversal they encounter, and how special abilities are used...')}
            rows={4}
          />
        </div>

        <div>
          <Label>{text('末尾悬念钩子', 'Ending suspense hook')}</Label>
          <Textarea
            value={selected.suspenseHook}
            onChange={e => onUpdateField('suspenseHook', e.target.value)}
            placeholder={text('一句话说明结尾留了什么悬念...', 'In one sentence, describe the suspense left at the end...')}
            rows={2}
          />
        </div>

        {/* 作者微操指导 — 特别标注，写稿时注入为最高优先级 */}
        <div
          className="p-3 rounded-lg border"
          style={{
            borderColor: 'var(--color-accent)',
            backgroundColor: 'rgba(var(--accent-rgb, 99 102 241), 0.06)',
          }}
        >
          <Label className="flex items-center gap-1.5">
            <span>{text('作者微操指导', 'Author guidance')}</span>
            <span
              className="text-[0.7rem] font-normal"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {text('（写稿时会作为最高优先级注入 AI — 可覆盖蓝图）', '(Used as the highest-priority instruction during drafting; it can override the blueprint.)')}
            </span>
          </Label>
          <Textarea
            value={selected.userGuidance}
            onChange={e => onUpdateField('userGuidance', e.target.value)}
            placeholder={text(
              '我想在这章加入一个意外的背叛...\n让反派在这章露出破绽...\n（不填则完全按蓝图走）',
              'Add an unexpected betrayal in this chapter...\nLet the antagonist reveal a weakness...\n(Leave blank to follow the blueprint exactly.)',
            )}
            rows={3}
            style={{ marginTop: 6 }}
          />
        </div>

        {/* 章节要点（定稿后自动生成，也可手动编辑） */}
        <div
          className="p-3 rounded-lg border"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'rgba(34,197,94,0.04)',
          }}
        >
          <Label className="flex items-center gap-1.5">
            <span>{text('章节要点', 'Chapter notes')}</span>
            <span
              className="text-[0.7rem] font-normal"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {selected.notesUpdatedAt
                ? text(
                  `（定稿后自动生成 — ${new Date(selected.notesUpdatedAt).toLocaleDateString(locale)}）`,
                  `(Generated after finalization — ${new Date(selected.notesUpdatedAt).toLocaleDateString(locale)})`,
                )
                : text('（定稿后自动生成，也可手动填写）', '(Generated after finalization, or enter it manually.)')
              }
            </span>
          </Label>
          <Textarea
            value={selected.notes || ''}
            onChange={e => onUpdateField('notes', e.target.value)}
            placeholder={text(
              '定稿后 AI 会自动填充本章要点（事件进展/角色变化/伏笔埋点），也可以提前手动输入给 AI 作参考',
              'After finalization, AI fills these notes with plot progress, character changes, and foreshadowing. You can also enter them beforehand as AI reference.',
            )}
            rows={4}
          />
        </div>
      </div>
    </div>
  )
}
