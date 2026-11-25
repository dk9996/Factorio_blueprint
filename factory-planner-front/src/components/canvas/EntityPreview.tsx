import type { PlacedEntity } from '../../store/canvasStore'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { ItemIcon } from '../common/ItemIcon'

// Превью в шапке панели сущности. У сущностей, взятых из палитры/хотбара,
// PlacedEntity.icon — это спрайтшит с кадрами анимации (для холста), и в
// превью он выглядел как сетка копий; берём обычную иконку из каталога.
export function EntityPreview({ entity }: { entity: PlacedEntity }) {
  const icon = useEntityCatalogStore((s) => s.entities.find((e) => e.typeId === entity.typeId)?.icon)
  return <ItemIcon src={icon ?? entity.icon} alt={entity.label} quality={entity.quality} className="mm-preview-icon" />
}
