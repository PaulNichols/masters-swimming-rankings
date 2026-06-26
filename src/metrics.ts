import type { CompetitionResult, RankingEntry, RankingSnapshot } from './types';

export type EventTrend = {
  key: string;
  label: string;
  entries: Array<RankingEntry & { checkedAt: string }>;
  bestPlace: number | null;
  latestPlace: number | null;
  previousPlace: number | null;
  movement: number | null;
  bestTimeSeconds: number | null;
  latestTimeSeconds: number | null;
};

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

export function ordinal(value: number | null | undefined): string {
  if (value == null) {
    return 'Not listed';
  }

  const suffix = value % 10 === 1 && value % 100 !== 11
    ? 'st'
    : value % 10 === 2 && value % 100 !== 12
      ? 'nd'
      : value % 10 === 3 && value % 100 !== 13
        ? 'rd'
        : 'th';

  return `${value}${suffix}`;
}

export function eventKey(entry: RankingEntry): string {
  return `${entry.scope}|${entry.course}|${entry.event}`;
}

export function eventLabel(entry: RankingEntry): string {
  return `${entry.scope} ${entry.course} - ${entry.event}`;
}

export function latestSnapshot(snapshots: RankingSnapshot[]): RankingSnapshot | undefined {
  return [...snapshots].sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0];
}

export function buildEventTrends(snapshots: RankingSnapshot[]): EventTrend[] {
  const grouped = new Map<string, EventTrend>();

  [...snapshots]
    .sort((a, b) => a.checkedAt.localeCompare(b.checkedAt))
    .forEach((snapshot) => {
      snapshot.entries.forEach((entry) => {
        const key = eventKey(entry);
        const existing = grouped.get(key);
        const trend = existing ?? {
          key,
          label: eventLabel(entry),
          entries: [],
          bestPlace: null,
          latestPlace: null,
          previousPlace: null,
          movement: null,
          bestTimeSeconds: null,
          latestTimeSeconds: null,
        };

        trend.entries.push({ ...entry, checkedAt: snapshot.checkedAt });
        grouped.set(key, trend);
      });
    });

  grouped.forEach((trend) => {
    const ranked = trend.entries.filter((entry) => entry.place != null);
    const timed = trend.entries.filter((entry) => entry.seconds != null);
    trend.bestPlace = ranked.length ? Math.min(...ranked.map((entry) => entry.place!)) : null;
    trend.latestPlace = ranked.at(-1)?.place ?? null;
    trend.previousPlace = ranked.length > 1 ? ranked.at(-2)!.place : null;
    trend.movement = trend.latestPlace != null && trend.previousPlace != null
      ? trend.previousPlace - trend.latestPlace
      : null;
    trend.bestTimeSeconds = timed.length ? Math.min(...timed.map((entry) => entry.seconds!)) : null;
    trend.latestTimeSeconds = timed.at(-1)?.seconds ?? null;
  });

  return [...grouped.values()].sort((a, b) => {
    const bestDiff = (a.bestPlace ?? 99) - (b.bestPlace ?? 99);
    return bestDiff || a.label.localeCompare(b.label);
  });
}

export function summarizeCompetitions(results: CompetitionResult[]): Map<string, CompetitionResult[]> {
  return results.reduce((map, result) => {
    const key = `${result.competition} ${result.date}`;
    map.set(key, [...(map.get(key) ?? []), result]);
    return map;
  }, new Map<string, CompetitionResult[]>());
}

export function movementText(value: number | null): string {
  if (value == null || value === 0) {
    return 'No change';
  }

  return value > 0 ? `Improved ${value}` : `Dropped ${Math.abs(value)}`;
}

export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds == null) {
    return 'n/a';
  }

  if (seconds >= 600 && Number.isInteger(seconds)) {
    return `${seconds} m`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return minutes > 0 ? `${minutes}:${remainder.toFixed(2).padStart(5, '0')}` : `${seconds.toFixed(2)}s`;
}
