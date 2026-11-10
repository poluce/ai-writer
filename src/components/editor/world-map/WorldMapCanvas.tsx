import { useMemo } from 'react'

import type { WorldMapData } from '../../../shared/world-map'
import { buildWorldMapLayout, factionTierColor, WORLD_MAP_VIEWBOX } from './world-map-layout'

interface WorldMapCanvasProps {
  data: WorldMapData
  selectedFactionId?: string
  onSelectFaction?: (factionId: string) => void
  className?: string
  text?: (zh: string, en: string) => string
}

/**
 * 世界地图 SVG。布局完全由数据推导，点击只改变选中项，不修改世界事实。
 */
export default function WorldMapCanvas({
  data,
  selectedFactionId,
  onSelectFaction,
  className,
  text = (zh: string) => zh,
}: WorldMapCanvasProps) {
  const layout = useMemo(() => buildWorldMapLayout(data), [data])
  const tierNames = useMemo(() => new Map(data.tiers.map(tier => [tier.id, tier.name])), [data.tiers])
  const tierLegend = useMemo(() => ([...data.tiers].sort((left, right) => left.order - right.order).slice(0, 4).map(tier => ({
    name: tier.name,
    color: factionTierColor(tier.order, data.tiers.length),
  }))), [data.tiers])
  const relationLabel = (kind: 'ally' | 'enemy' | 'neutral') => (
    kind === 'ally' ? text('同盟', 'Ally') : kind === 'enemy' ? text('敌对', 'Enemy') : text('中立', 'Neutral')
  )

  return (
    <svg
      className={className}
      viewBox={`0 0 ${WORLD_MAP_VIEWBOX.width} ${WORLD_MAP_VIEWBOX.height}`}
      role="img"
      aria-label={`${data.worldName}${text('世界地图', 'world map')}`}
      data-world-map-canvas
    >
      <defs>
        <pattern id="world-map-grid" width="38" height="38" patternUnits="userSpaceOnUse">
          <path d="M38 0H0V38" fill="none" stroke="rgba(96, 110, 126, 0.10)" strokeWidth="1" />
        </pattern>
        <radialGradient id="world-map-sea" cx="45%" cy="38%" r="75%">
          <stop offset="0%" stopColor="#F1F4F8" />
          <stop offset="100%" stopColor="#E3E8EF" />
        </radialGradient>
      </defs>

      <rect width={WORLD_MAP_VIEWBOX.width} height={WORLD_MAP_VIEWBOX.height} fill="url(#world-map-sea)" />
      <rect width={WORLD_MAP_VIEWBOX.width} height={WORLD_MAP_VIEWBOX.height} fill="url(#world-map-grid)" />

      {layout.continents.map(continent => (
        <g key={continent.name} className="world-map-continent">
          <path d={continent.path} fill="#F7F9FC" stroke="#C2CBD6" strokeWidth={1.15} opacity={0.88} />
        </g>
      ))}

      {layout.regions.map(shape => (
        <g key={shape.region.id} className="world-map-region">
          <path
            d={shape.path}
            fill={shape.fill}
            stroke="#B6C0CC"
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.96}
          />
          <text
            x={shape.label.x}
            y={shape.label.y}
            textAnchor="middle"
            className="world-map-region-label"
          >
            {shape.region.name}
          </text>
        </g>
      ))}

      {layout.continents.map(continent => (
        <text
          key={`label-${continent.name}`}
          x={continent.label.x}
          y={continent.label.y}
          textAnchor="middle"
          className="world-map-continent-label"
        >
          {continent.name}
        </text>
      ))}

      {layout.relations.map(({ relation, from, to }) => (
        <g key={relation.id} className={`world-map-relation ${relation.kind}`}>
          <line
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={relation.kind === 'ally' ? '#6E8662' : relation.kind === 'enemy' ? '#A45A45' : '#8B93A2'}
            strokeWidth={1.25}
            strokeDasharray={relation.kind === 'enemy' ? '5 5' : relation.kind === 'neutral' ? '2 5' : undefined}
            strokeLinecap="round"
            opacity={0.82}
          />
          <title>{`${relationLabel(relation.kind)}${relation.note ? `：${relation.note}` : ''}`}</title>
        </g>
      ))}

      {layout.factions.map(pin => {
        const color = factionTierColor(pin.tierRank, data.tiers.length)
        const selected = pin.faction.id === selectedFactionId
        const tierName = tierNames.get(pin.faction.tierId) ?? ''
        const showLabel = selected || data.factions.length <= 8 || pin.tierRank <= 2
        return (
          <g
            key={pin.faction.id}
            className={`world-map-faction${selected ? ' selected' : ''}`}
            transform={`translate(${pin.point.x} ${pin.point.y})`}
            onClick={() => onSelectFaction?.(pin.faction.id)}
            role={onSelectFaction ? 'button' : undefined}
            tabIndex={onSelectFaction ? 0 : undefined}
            aria-label={`${pin.faction.name}，${tierName}，${pin.region.name}`}
            onKeyDown={(event) => {
              if (!onSelectFaction) return
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelectFaction(pin.faction.id)
              }
            }}
          >
            {selected && <circle r={17} fill={color} opacity={0.1} />}
            <circle r={selected ? 9 : 6.5} fill="#F9FAFC" stroke={color} strokeWidth={selected ? 2 : 1.5} />
            <circle r={selected ? 3.2 : 2.3} fill={color} />
            {showLabel ? (
              <text
                x={0}
                y={-13}
                textAnchor="middle"
                className={`world-map-faction-label${selected ? ' selected' : ''}`}
              >
                {pin.faction.name}
              </text>
            ) : null}
          </g>
        )
      })}

      <g transform={`translate(${WORLD_MAP_VIEWBOX.width - 54} ${WORLD_MAP_VIEWBOX.height - 62})`} className="world-map-compass">
        <circle r={15} fill="none" stroke="#77808D" strokeWidth={1} opacity={0.8} />
        <path d="M0-10 4 5 0 2-4 5Z" fill="#66707D" stroke="none" />
        <text x={0} y={-21} textAnchor="middle" className="world-map-compass-label">{text('北', 'N')}</text>
      </g>

      <g transform={`translate(18 ${WORLD_MAP_VIEWBOX.height - 26})`} className="world-map-legend">
        <text x={0} y={0} className="world-map-legend-label">{text('势力', 'Tiers')}</text>
        {tierLegend.map((tier, index) => (
          <g key={tier.name} transform={`translate(${34 + index * 62} 0)`}>
            <circle r={3.2} fill="none" stroke={tier.color} strokeWidth={1.4} />
            <text x={7} y={3} className="world-map-legend-value">{tier.name}</text>
          </g>
        ))}
        <g transform="translate(286 0)">
          <line x1={0} y1={-3} x2={16} y2={-3} stroke="#A45A45" strokeWidth={1.2} strokeDasharray="4 4" />
          <text x={21} y={0} className="world-map-legend-value">{text('敌对', 'Enemy')}</text>
          <line x1={54} y1={-3} x2={70} y2={-3} stroke="#6E8662" strokeWidth={1.2} />
          <text x={75} y={0} className="world-map-legend-value">{text('同盟', 'Ally')}</text>
        </g>
      </g>
    </svg>
  )
}

