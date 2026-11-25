import type { EntityNets, SimModel, SimTopology, WireColor } from './types.ts'

// Сеть = связная компонента проводов ОДНОГО цвета (union-find по
// коннекторам). У комбинатора input и output — разные узлы: выход и вход
// одного комбинатора не соединены. Красные и зелёные сети не смешиваются.
class UnionFind {
  private parent = new Map<string, string>()
  find(x: string): string {
    let root = x
    while ((this.parent.get(root) ?? root) !== root) root = this.parent.get(root)!
    let cur = x
    while (cur !== root) {
      const next = this.parent.get(cur) ?? cur
      this.parent.set(cur, root)
      cur = next
    }
    if (!this.parent.has(root)) this.parent.set(root, root)
    return root
  }
  union(a: string, b: string): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

const nodeId = (color: WireColor, entityId: number, connector: string) => `${color}|${entityId}|${connector}`

export function buildTopology(model: SimModel): SimTopology {
  const uf = new UnionFind()
  const nodes = new Set<string>()
  const known = new Set(model.entities.map((e) => e.id))

  for (const w of model.wires) {
    if (!known.has(w.a.entityId) || !known.has(w.b.entityId)) continue
    const a = nodeId(w.color, w.a.entityId, w.a.connector)
    const b = nodeId(w.color, w.b.entityId, w.b.connector)
    nodes.add(a)
    nodes.add(b)
    uf.union(a, b)
  }

  const netOfRoot = new Map<string, number>()
  const netColor: Record<number, WireColor> = {}
  const netOf = (node: string): number => {
    const root = uf.find(node)
    let id = netOfRoot.get(root)
    if (id === undefined) {
      id = netOfRoot.size
      netOfRoot.set(root, id)
      netColor[id] = node.startsWith('red|') ? 'red' : 'green'
    }
    return id
  }

  const entityNets: Record<number, EntityNets> = {}
  for (const node of [...nodes].sort()) {
    const [color, idStr, connector] = node.split('|') as [WireColor, string, string]
    const id = Number(idStr)
    const rec = (entityNets[id] ??= { red: {}, green: {} })
    rec[color][connector] = netOf(node)
  }

  const wireNet: Record<string, number> = {}
  for (const w of model.wires) {
    if (!known.has(w.a.entityId) || !known.has(w.b.entityId)) continue
    wireNet[w.id] = netOf(nodeId(w.color, w.a.entityId, w.a.connector))
  }

  return { netCount: netOfRoot.size, netColor, wireNet, entityNets }
}
