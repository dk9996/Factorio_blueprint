import { useMemo } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { useRecipeCatalogStore } from '../../store/recipeCatalogStore'
import type { CatalogEntity } from '../../store/entityCatalogStore'
import type { Network } from '../../lib/networks'
import { matchFluidForPort } from '../../lib/ioHints'

interface Props {
  network: Network
  catalogByTypeId: Map<string, CatalogEntity>
  connectedPorts: Map<string, string>
  onClose: () => void
}

/**
 * Статистика по автоматической группе (сети) конвейеров/труб — см.
 * src/lib/networks.ts. Показывается, когда текущее выделение в точности
 * совпадает по составу с одной из вычисленных групп (см. BlueprintCanvas,
 * selectedNetwork). Позиционируется у правого верхнего угла bounding box
 * группы — тот же визуальный язык, что у StatPopover.
 */
export function GroupStatsPanel({ network, catalogByTypeId, connectedPorts, onClose }: Props) {
  const entities = useCanvasStore((s) => s.entities)
  const recipes = useRecipeCatalogStore((s) => s.recipes)

  const members = useMemo(
    () => network.ids.map((id) => entities.find((e) => e.id === id)).filter((e): e is NonNullable<typeof e> => !!e),
    [network, entities],
  )

  const bounds = useMemo(() => {
    if (members.length === 0) return { left: 0, top: 0 }
    const maxX = Math.max(...members.map((e) => e.x + e.width))
    const minY = Math.min(...members.map((e) => e.y))
    return { left: maxX + 12, top: minY }
  }, [members])

  const beltStats = useMemo(() => {
    if (network.kind !== 'belt') return null
    let minSpeed: number | null = null
    const typeIds = new Set<string>()
    for (const e of members) {
      typeIds.add(e.typeId)
      const speed = catalogByTypeId.get(e.typeId)?.speed
      if (typeof speed === 'number') minSpeed = minSpeed === null ? speed : Math.min(minSpeed, speed)
    }
    const tierLabel =
      typeIds.size === 1 ? (catalogByTypeId.get(members[0]?.typeId ?? '')?.label ?? null) : 'смешанный тир'
    return {
      tierLabel,
      throughput: minSpeed !== null ? minSpeed * 480 : null,
    }
  }, [network, members, catalogByTypeId])

  const fluidLabel = useMemo(() => {
    if (network.kind !== 'pipe') return null
    const found = new Set<string>()
    for (const machineId of network.connectedMachines) {
      const machine = entities.find((e) => e.id === machineId)
      if (!machine) continue
      const catalogEntry = catalogByTypeId.get(machine.typeId)
      const ports = catalogEntry?.ioHints?.fluidPorts
      if (!ports) continue
      for (const port of ports) {
        if (connectedPorts.get(`${machineId}:${port.index}`) !== network.id) continue
        if (port.filter) {
          found.add(port.filter.label)
          continue
        }
        if (catalogEntry?.ioHints?.kind === 'crafting' && machine.recipe && port.recipeMatchIndex !== null) {
          const recipe = recipes.find((r) => r.name === machine.recipe)
          if (!recipe) continue
          const pool = port.productionType === 'input' ? recipe.ingredients : recipe.results
          const match = matchFluidForPort(pool, port.recipeMatchIndex)
          if (match) found.add(match.name)
        }
      }
    }
    return found.size === 1 ? Array.from(found)[0] : null
  }, [network, entities, catalogByTypeId, connectedPorts, recipes])

  return (
    <div className="group-stats-panel" style={{ left: bounds.left, top: bounds.top }} onClick={(e) => e.stopPropagation()}>
      <div className="gsp-head">
        <span>Группа · {network.kind === 'belt' ? 'конвейеры' : 'трубы'}</span>
        <button className="gsp-close" onClick={onClose} title="Закрыть">✕</button>
      </div>
      <div className="row">
        <span>Тайлов</span>
        <span>{network.ids.length}</span>
      </div>
      <div className="row">
        <span>Открытых концов</span>
        <span>{network.endpoints.length}</span>
      </div>
      <div className="row">
        <span>Подключено машин</span>
        <span>{network.connectedMachines.length}</span>
      </div>
      {beltStats && (
        <>
          <div className="row">
            <span>Тир</span>
            <span>{beltStats.tierLabel ?? '—'}</span>
          </div>
          <div className="row">
            <span>Пропускная сп.</span>
            <span>{beltStats.throughput !== null ? `${beltStats.throughput.toFixed(1)} предм/с` : '—'}</span>
          </div>
        </>
      )}
      {network.kind === 'pipe' && fluidLabel && (
        <div className="row">
          <span>Жидкость</span>
          <span>{fluidLabel}</span>
        </div>
      )}
      <div className="arrow" />
    </div>
  )
}
