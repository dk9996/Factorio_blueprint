// Тесты схемной логики (lib/circuit/connectors.ts) на реальном каталоге
// профиля base. Запуск из factory-planner-front: node src/lib/circuitSelfTest.ts
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { checkWire, connectorPoint, directionKey, findWire, internalWires, nearestConnector, withoutEntities } from './circuit/connectors.ts'
import { classifyConnector, connectorId } from './circuit/blueprintWires.ts'
import type { Wire } from './circuit/types.ts'

let failed = 0
let passed = 0
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  OK  ${msg}`) } else { failed++; console.log(`FAIL  ${msg}`) }
}

const base = new URL('../../../factory-planner-backend/content/', import.meta.url)
const catalog = JSON.parse(readFileSync(new URL('profiles/base/entity_catalog.json', base), 'utf-8')) as {
  typeId: string; connectors: Record<string, { id: string; kind: 'single' | 'input' | 'output'; red: [number, number]; green: [number, number] }[]> | null; circuitWireMaxDistance: number | null
}[]
const cat = (n: string) => catalog.find((e) => e.typeId === n)!
const ent = (x: number, y: number, w: number, h: number, direction?: number) => ({ x, y, width: w, height: h, direction: direction as 0 | 90 | 180 | 270 | undefined })

console.log('=== Каталог: коннекторы по направлениям ===')
{
  assert(directionKey(undefined) === '0' && directionKey(90) === '4' && directionKey(180) === '8' && directionKey(270) === '12' && directionKey(-90) === '12', 'градусы -> ключи Factorio 0|4|8|12')
  const arith = cat('arithmetic-combinator')
  assert(!!arith.connectors && Object.keys(arith.connectors).join() === '0,4,8,12', 'арифметический: коннекторы для 4 направлений')
  assert(arith.connectors!['0'].map((c) => c.id).join() === 'input,output', 'арифметический: input и output')
  assert(arith.circuitWireMaxDistance === 9, 'арифметический: circuit_wire_max_distance = 9')
  assert(cat('small-electric-pole').circuitWireMaxDistance === 7.5 && cat('big-electric-pole').circuitWireMaxDistance === 32, 'столбы: maximum_wire_distance 7.5 / 32')
  assert(!cat('transport-belt').connectors === false && !cat('stone-furnace').connectors === false, 'конвейер и печь — участники сети (есть circuit_connector)')
  assert(cat('pipe').connectors === null && cat('pipe-to-ground').connectors === null, 'труба — не участник сети')
  const nonParticipants = catalog.filter((e) => !e.connectors).length
  assert(nonParticipants > 0 && catalog.filter((e) => e.connectors).length > 60, `участники определены по данным дампа, без списка по именам (не участвуют: ${nonParticipants})`)
}

console.log('=== Точки подключения и поворот ===')
{
  const arith = cat('arithmetic-combinator')
  const north = ent(100, 100, 32, 64, 0)
  const east = ent(100, 100, 64, 32, 90)
  const pIn0 = connectorPoint(north, arith, 'input', 'red')!
  const pOut0 = connectorPoint(north, arith, 'output', 'red')!
  assert(pIn0.y > pOut0.y, 'на севере вход ниже (южнее) выхода')
  const pIn90 = connectorPoint(east, arith, 'input', 'red')!
  const pOut90 = connectorPoint(east, arith, 'output', 'red')!
  assert(pIn90.x < pOut90.x, 'после поворота на 90° вход левее выхода (поток вправо)')
  assert(Math.abs(pIn0.x - pIn90.x) > 1 || Math.abs(pIn0.y - pIn90.y) > 1, 'точки проводов пересчитываются при смене направления')
  assert(connectorPoint(north, arith, 'nope', 'red') === null, 'неизвестный коннектор -> null')
  // nearest: курсор у нижней части комбинатора выбирает input, у верхней — output
  assert(nearestConnector(north, arith, { x: 116, y: 100 + 64 - 4 })?.id === 'input', 'клик у входной стороны -> input')
  assert(nearestConnector(north, arith, { x: 116, y: 100 + 4 })?.id === 'output', 'клик у выходной стороны -> output')
  assert(nearestConnector(ent(0, 0, 32, 32), cat('small-lamp'), { x: 10, y: 10 })?.id === 'single', 'лампа: единственный коннектор single')
  const pole = connectorPoint(ent(0, 0, 32, 32), cat('small-electric-pole'), 'single', 'red')!
  assert(Math.abs(pole.y - 16) < 8, `точки столба приведены к виду сверху (около центра), y=${pole.y.toFixed(1)}`)
}

console.log('=== Ограничение длины провода ===')
{
  const pole = cat('small-electric-pole')
  const a = ent(0, 0, 32, 32)
  const near = ent(32 * 6, 0, 32, 32)
  const far = ent(32 * 9, 0, 32, 32)
  const ok = checkWire({ entity: a, catalog: pole, connector: 'single' }, { entity: near, catalog: pole, connector: 'single' }, 'red', false)
  const bad = checkWire({ entity: a, catalog: pole, connector: 'single' }, { entity: far, catalog: pole, connector: 'single' }, 'red', false)
  assert(ok.ok && Math.abs((ok.distance ?? 0) - 6) < 0.1, `6 тайлов между малыми столбами (лимит 7.5) — можно (${ok.distance?.toFixed(2)})`)
  assert(!bad.ok && bad.reason === 'too-far' && bad.limit === 7.5, `9 тайлов — запрет «слишком далеко» (лимит ${bad.limit})`)
  const lamp = checkWire({ entity: a, catalog: pole, connector: 'single' }, { entity: ent(32 * 8, 0, 32, 32), catalog: cat('small-lamp'), connector: 'single' }, 'red', false)
  assert(!lamp.ok && lamp.limit === 7.5, 'столб (7.5) + лампа (9): действует минимум из двух — 7.5')
  const big = cat('big-electric-pole')
  assert(checkWire({ entity: a, catalog: big, connector: 'single' }, { entity: ent(32 * 30, 0, 32, 32), catalog: big, connector: 'single' }, 'green', false).ok, 'большие столбы: 30 тайлов (лимит 32) — можно')
  assert(checkWire({ entity: a, catalog: pole, connector: 'single' }, { entity: a, catalog: pole, connector: 'single' }, 'red', true).reason === 'same-entity', 'провод сущности к самой себе запрещён')
}

console.log('=== Дубликаты и внутренние провода ===')
{
  const w: Wire[] = [
    { id: '1', color: 'red', a: { entityId: 1, connector: 'output' }, b: { entityId: 2, connector: 'input' } },
    { id: '2', color: 'green', a: { entityId: 1, connector: 'output' }, b: { entityId: 2, connector: 'input' } },
    { id: '3', color: 'red', a: { entityId: 2, connector: 'single' }, b: { entityId: 3, connector: 'single' } },
  ]
  assert(findWire(w, 'red', { entityId: 2, connector: 'input' }, { entityId: 1, connector: 'output' })?.id === '1', 'поиск провода не зависит от порядка концов')
  assert(findWire(w, 'red', { entityId: 1, connector: 'input' }, { entityId: 2, connector: 'input' }) === undefined, 'другая пара коннекторов — не тот же провод')
  assert(internalWires(w, new Set([1, 2])).length === 2, 'внутренние провода группы {1,2}: 2 (внешний к 3 не копируется)')
  assert(withoutEntities(w, new Set([2])).length === 0, 'удаление сущности 2 убирает все её провода')
}

console.log('=== Идентификаторы коннекторов blueprint ===')
{
  assert(classifyConnector('lamp', 1)?.color === 'red' && classifyConnector('lamp', 2)?.color === 'green', 'circuit_red=1 / circuit_green=2')
  assert(classifyConnector('arithmetic-combinator', 3)?.connector === 'input' && classifyConnector('arithmetic-combinator', 6)?.connector === 'output', 'combinator_input=3/4, output=5/6')
  assert(classifyConnector('electric-pole', 5) === null, 'pole_copper=5 у столба — не схемный провод')
  assert(classifyConnector('lamp', 5) === null, '5 у не-комбинатора — не схемный провод (сохраняется как есть)')
  assert(connectorId('arithmetic-combinator', 'output', 'green') === 6 && connectorId('lamp', 'single', 'red') === 1, 'обратное кодирование')
}

console.log(`\n=== Итого: ${passed} OK, ${failed} FAIL ===`)
if (failed > 0) process.exit(1)
