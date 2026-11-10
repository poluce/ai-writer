import { useId, useMemo, useRef, useState } from 'react'

import type { WorldMapData } from '../../../shared/world-map'
import {
  WORLD_MAP_GLOBE,
  buildWorldMapGlobe,
  globeLinePaths,
  globePolygonPath,
  globeRelationPoints,
  projectGlobeVector,
  type GlobeRotation,
} from './world-map-globe'

interface WorldMapGlobeProps {
  data: WorldMapData
  selectedFactionId?: string
  onSelectFaction?: (factionId: string) => void
  className?: string
  text?: (zh: string, en: string) => string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export default function WorldMapGlobe({
  data,
  selectedFactionId,
  onSelectFaction,
  className,
  text = (zh: string) => zh,
}: WorldMapGlobeProps) {
  const layout = useMemo(() => buildWorldMapGlobe(data), [data])
  const [rotation, setRotation] = useState<GlobeRotation>({ longitude: 0.08, latitude: 0.14 })
  const [zoom, setZoom] = useState(1)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    longitude: number
    latitude: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)
  const prefix = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const clipId = `world-map-globe-clip-${prefix}`
  const oceanId = `world-map-globe-ocean-${prefix}`
  const shadeId = `world-map-globe-shade-${prefix}`

  const rendered = useMemo(() => {
    const regionPaths = layout.regions.flatMap((region) => {
      const path = globePolygonPath(region.polygon, rotation, zoom)
      if (!path) return []
      const label = projectGlobeVector(region.label, rotation, zoom)
      return [{
        region,
        path,
        label: label.depth > 0.24 ? label : null,
      }]
    })
    const factions = layout.factions
      .map(faction => ({
        faction,
        point: projectGlobeVector(faction.point, rotation, zoom),
      }))
      .filter(item => item.point.depth > 0.05)
      .sort((left, right) => left.point.depth - right.point.depth)
    const relations = layout.relations.flatMap(relation => (
      globeLinePaths(globeRelationPoints(relation.from, relation.to), rotation, zoom)
        .map(path => ({ path, kind: relation.kind }))
    ))
    const graticule = [
      ...layout.graticuleLat.flatMap(line => globeLinePaths(line, rotation, zoom)),
      ...layout.graticuleLon.flatMap(line => globeLinePaths(line, rotation, zoom)),
    ]
    return { regionPaths, factions, relations, graticule }
  }, [layout, rotation, zoom])

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      longitude: rotation.longitude,
      latitude: rotation.latitude,
      moved: false,
    }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.hypot(dx, dy) > 3) drag.moved = true
    setRotation({
      longitude: drag.longitude - dx * 0.0075,
      latitude: clamp(drag.latitude + dy * 0.006, -1.18, 1.18),
    })
  }

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    suppressClickRef.current = drag.moved
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (drag.moved) {
      window.setTimeout(() => { suppressClickRef.current = false }, 0)
    }
  }

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    setZoom(previous => clamp(previous * Math.exp(-event.deltaY * 0.0012), 0.82, 1.6))
  }

  const radius = WORLD_MAP_GLOBE.radius * zoom

  return (
    <svg
      className={`world-map-globe${dragging ? ' dragging' : ''}${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${WORLD_MAP_GLOBE.width} ${WORLD_MAP_GLOBE.height}`}
      role="img"
      aria-label={`${data.worldName}${text('世界地图 · 球体', 'world map · globe')}`}
      data-world-map-globe
      data-globe-longitude={rotation.longitude.toFixed(3)}
      data-globe-latitude={rotation.latitude.toFixed(3)}
      data-globe-zoom={zoom.toFixed(2)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={handleWheel}
      style={{ touchAction: 'none' }}
    >
      <title>{`${data.worldName} · ${text('球体世界地图', 'globe world map')}`}</title>
      <defs>
        <clipPath id={clipId}>
          <circle cx={WORLD_MAP_GLOBE.center.x} cy={WORLD_MAP_GLOBE.center.y} r={radius} />
        </clipPath>
        <radialGradient id={oceanId} cx="35%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#F7FAFD" />
          <stop offset="62%" stopColor="#E6EDF4" />
          <stop offset="100%" stopColor="#D3DDE8" />
        </radialGradient>
        <radialGradient id={shadeId} cx="42%" cy="36%" r="70%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.22)" />
          <stop offset="58%" stopColor="rgba(255, 255, 255, 0)" />
          <stop offset="100%" stopColor="rgba(48, 62, 79, 0.18)" />
        </radialGradient>
      </defs>

      <circle
        cx={WORLD_MAP_GLOBE.center.x}
        cy={WORLD_MAP_GLOBE.center.y}
        r={radius + 7}
        fill="rgba(48, 62, 79, 0.08)"
      />
      <circle
        cx={WORLD_MAP_GLOBE.center.x}
        cy={WORLD_MAP_GLOBE.center.y}
        r={radius}
        fill={`url(#${oceanId})`}
      />

      <g clipPath={`url(#${clipId})`}>
        <g className="world-map-globe-graticule" aria-hidden="true">
          {rendered.graticule.map((path, index) => <path d={path} key={`g-${index}`} />)}
        </g>

        <g className="world-map-globe-regions">
          {rendered.regionPaths.map(({ region, path }) => (
            <path
              key={region.region.id}
              d={path}
              fill={region.fill}
              stroke="rgba(120, 139, 160, 0.62)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ))}
        </g>

        <g className="world-map-globe-relations">
          {rendered.relations.map((relation, index) => (
            <path
              key={`r-${index}`}
              d={relation.path}
              className={`world-map-globe-relation ${relation.kind}`}
            />
          ))}
        </g>

        <circle
          cx={WORLD_MAP_GLOBE.center.x}
          cy={WORLD_MAP_GLOBE.center.y}
          r={radius}
          fill={`url(#${shadeId})`}
          pointerEvents="none"
        />

        <g className="world-map-globe-labels" aria-hidden="true">
          {rendered.regionPaths.map(({ region, label }) => label ? (
            <text
              key={`l-${region.region.id}`}
              x={label.x}
              y={label.y + 5}
              textAnchor="middle"
              className="world-map-globe-region-label"
            >
              {region.region.name}
            </text>
          ) : null)}
        </g>

        <g className="world-map-globe-factions">
          {rendered.factions.map(({ faction, point }) => {
            const selected = faction.faction.id === selectedFactionId
            const labelAnchor = point.x < WORLD_MAP_GLOBE.center.x - 18
              ? 'start'
              : point.x > WORLD_MAP_GLOBE.center.x + 18 ? 'end' : 'middle'
            const showLabel = point.depth > 0.2
              && (selected || data.factions.length <= 8 || faction.tierRank <= 2)
            return (
              <g
                key={faction.faction.id}
                transform={`translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`}
                className={`world-map-globe-faction${selected ? ' selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={faction.faction.name}
                aria-pressed={selected}
                onClick={() => {
                  if (suppressClickRef.current) return
                  onSelectFaction?.(faction.faction.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectFaction?.(faction.faction.id)
                  }
                }}
              >
                {selected ? (
                  <circle r={10} fill="none" stroke={faction.color} strokeOpacity={0.28} strokeWidth={5} />
                ) : null}
                <circle r={selected ? 7.5 : 6} fill="#F9FAFC" stroke={faction.color} strokeWidth={selected ? 2.2 : 1.6} />
                <circle r={2.2} fill={faction.color} />
                {showLabel ? (
                  <text
                    x={labelAnchor === 'start' ? 8 : labelAnchor === 'end' ? -8 : 0}
                    y={-13}
                    textAnchor={labelAnchor}
                    className={`world-map-globe-faction-label${selected ? ' selected' : ''}`}
                  >
                    {faction.faction.name}
                  </text>
                ) : null}
              </g>
            )
          })}
        </g>
      </g>

      <circle
        cx={WORLD_MAP_GLOBE.center.x}
        cy={WORLD_MAP_GLOBE.center.y}
        r={radius}
        fill="none"
        stroke="rgba(120, 139, 160, 0.72)"
        strokeWidth={1.2}
        pointerEvents="none"
      />
      <text x={24} y={WORLD_MAP_GLOBE.height - 22} className="world-map-globe-hint">
        {text('拖动旋转 · 滚轮缩放', 'Drag to rotate · scroll to zoom')}
      </text>
    </svg>
  )
}
