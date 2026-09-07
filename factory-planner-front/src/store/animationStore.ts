import { create } from 'zustand'

interface AnimationStore {
  tick: number
  advance: () => void
}

// Один общий "тик" на всё приложение вместо таймера на каждую сущность —
// дешевле и все станки анимируются синхронно, как в самой игре.
export const useAnimationStore = create<AnimationStore>((set) => ({
  tick: 0,
  advance: () => set((s) => ({ tick: s.tick + 1 })),
}))
