import { create } from 'zustand'
import { EMPTY_NETWORKS, type NetworksResult } from '../lib/networks'

interface NetworksStore extends NetworksResult {
  setNetworks: (networks: NetworksResult) => void
}

// Держит ПОСЛЕДНИЙ результат computeNetworks (см. lib/networks.ts),
// посчитанный один раз на уровне BlueprintCanvas и раздаваемый сюда —
// EntityNode читает свой кусочек через селекторы (s.groupOf.get(id) и
// т.п. — поля NetworksResult лежат прямо на сторе, без обёртки), не
// пересчитывает сам.
export const useNetworksStore = create<NetworksStore>((set) => ({
  ...EMPTY_NETWORKS,
  setNetworks: (networks) => set(networks),
}))
