import type { RankingsStore } from './types';

export async function loadGitHubData(): Promise<RankingsStore> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/rankings.json`, {
    cache: 'no-cache',
  });

  if (!response.ok) {
    throw new Error(`Could not load GitHub rankings JSON (${response.status}).`);
  }

  const data = await response.json() as RankingsStore;

  if (!Array.isArray(data.swimmers) || !Array.isArray(data.snapshots) || !Array.isArray(data.competitions)) {
    throw new Error('GitHub rankings JSON has an invalid shape.');
  }

  return data;
}
