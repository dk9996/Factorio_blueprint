import { useCanvasStore } from '../../store/canvasStore'
import { useUiStore } from '../../store/uiStore'
import { hasSettings } from './registry'

// Открывает окно настроек для сущности: если она входит в выделение — для
// всех выделенных сущностей ТОГО ЖЕ типа, иначе только для неё. Для
// сущностей без записи в реестре не открывает ничего (возвращает false).
export function openSettingsFor(targetId: number): boolean {
  const { entities, placing } = useCanvasStore.getState()
  if (placing) return false
  const ui = useUiStore.getState()
  if (ui.wireTool) return false
  const wires = useCanvasStore.getState().wires
  const wired = new Set(wires.flatMap((w) => [w.a.entityId, w.b.entityId]))
  const target = entities.find((e) => e.id === targetId)
  if (!target || !hasSettings(target, wired.has(targetId))) return false
  const selected = ui.selectedEntityIds
  const ids = selected.has(targetId)
    ? entities.filter((e) => selected.has(e.id) && e.type === target.type && hasSettings(e, wired.has(e.id))).map((e) => e.id)
    : [targetId]
  ui.openEntitySettings(ids)
  return true
}
