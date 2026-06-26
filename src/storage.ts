import { seedStore } from './data';
import type { RankingsStore } from './types';

const storageKey = 'masters-swimming-rankings:v1';

export function hasSavedStore(): boolean {
  return localStorage.getItem(storageKey) != null;
}

export function loadStore(): RankingsStore {
  const raw = localStorage.getItem(storageKey);

  if (!raw) {
    return seedStore;
  }

  try {
    const parsed = JSON.parse(raw) as RankingsStore;
    return {
      swimmers: parsed.swimmers ?? seedStore.swimmers,
      snapshots: parsed.snapshots ?? seedStore.snapshots,
      competitions: parsed.competitions ?? seedStore.competitions,
      updatedAt: parsed.updatedAt ?? seedStore.updatedAt,
    };
  } catch {
    return seedStore;
  }
}

export function saveStore(store: RankingsStore): void {
  localStorage.setItem(storageKey, JSON.stringify(store));
}

export function clearSavedStore(): void {
  localStorage.removeItem(storageKey);
}

export function resetStore(): RankingsStore {
  clearSavedStore();
  return seedStore;
}
