// Список typeId сущностей, которые сейчас проверяются после починки
// спрайтов. Кнопка "🧪 Тест" в тулбаре раскладывает их все в ряд на
// новом чертеже, чтобы не искать каждую по отдельности в палитре.
// Список редактируется вручную — добавляй/убирай сущности по мере того,
// что чинишь и проверяешь. Если сущности нет в текущем каталоге (мод
// выключен, опечатка в typeId и т.п.) — она просто пропускается, без
// ошибки.
export const TEST_ENTITY_TYPE_IDS: string[] = [
  // Группа 1 — отсутствующий/частичный спрайт
  'se-space-probe-rocket-silo',
  'cargo-landing-pad',
  'rocket-silo',
  'straight-rail',
  'se-space-straight-rail',
  'kr-singularity-beacon',
  'se-compact-beacon-2',
  'centrifuge',
  'beacon',
  'kr-antimatter-reactor',
  'se-big-turbine',
  'se-kr-advanced-condenser-turbine',
  'shield-projector',

  // Группа 2 — турели (частичный спрайт)
  'gun-turret',
  'kr-laser-artillery-turret',
  'flamethrower-turret',
  'kr-rocket-turret',
  'artillery-turret',
  'kr-railgun-turret',

  // Группа 3 — рассинхрон кадров (size: [w,h] вместо width/height)
  'fi_fiberer',
  'fi_miner',
  'fi_crafter',
  'fi_crusher',
  'gr_crafter',

  // Группа 5 — направление не совпадало с хитбоксом
  'se-energy-transmitter-chamber',
  'se-naquium-heat-pipe-long--t--',
  'se-naquium-heat-pipe-long--t-----t--',
]