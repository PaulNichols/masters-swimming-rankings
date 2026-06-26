import { useEffect, useMemo, useState } from 'react';
import { seedStore } from './data';
import { loadGitHubData } from './githubData';
import { buildEventTrends, eventKey, formatDate, formatSeconds, latestSnapshot, movementText, ordinal, summarizeCompetitions } from './metrics';
import type { CompetitionResult, Course, RankingEntry, RankingsStore } from './types';

type PointResult = {
  result: CompetitionResult;
  points: number;
};

type PointOpportunity = {
  course: 'LC' | 'SC';
  event: string;
  points: number;
  time?: string;
  date: string;
  gapToAverage: number | null;
};

type RankingOpportunity = RankingEntry & {
  course: 'LC' | 'SC';
};

type ResultTrend = {
  key: string;
  label: string;
  entries: Array<{
    date: string;
    points: number;
    time?: string;
    seconds?: number;
  }>;
  bestPoints: number;
  latestPoints: number;
  bestTimeSeconds: number | null;
  latestTimeSeconds: number | null;
};

function scopeLabel(entry: RankingEntry): string {
  if (entry.scope === 'World') {
    return 'World';
  }

  const scope = entry.scope === 'Australia' ? 'National' : entry.scope;
  return `${scope} ${entry.course}`;
}

function compactChartDate(value: string): string {
  const date = new Date(value);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()];

  return `${date.getDate().toString().padStart(2, '0')} ${month} ${date.getFullYear().toString().slice(-2)}`;
}

function normalizeAgeGroup(value: string): string {
  return `Men ${value.replace(/^Men\s+/i, '')}`;
}

function competitionYear(result: CompetitionResult): number {
  return result.year ?? new Date(result.date).getFullYear();
}

function numericPoints(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const points = Number(value);
  return Number.isFinite(points) ? points : null;
}

function pointResults(results: CompetitionResult[]): PointResult[] {
  return results.flatMap((result) => {
    const points = numericPoints(result.points);
    return points == null ? [] : [{ result, points }];
  });
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function formatPoints(value: number | null | undefined): string {
  return value == null ? 'n/a' : Math.round(value).toString();
}

function resultSeconds(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const minutesMatch = value.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (minutesMatch) {
    return Number(minutesMatch[1]) * 60 + Number(minutesMatch[2]);
  }

  if (/^\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return undefined;
}

function isPoolCourse(course: Course): course is 'LC' | 'SC' {
  return course === 'LC' || course === 'SC';
}

function byCourse<T extends { course: 'LC' | 'SC' }>(items: T[], perCourse: number): T[] {
  return (['SC', 'LC'] as const).flatMap((course) => (
    items.filter((item) => item.course === course).slice(0, perCourse)
  ));
}

function currentAgeGroupFor(store: RankingsStore, swimmerId: string): string {
  const latest = latestSnapshot(store.snapshots.filter((snapshot) => snapshot.swimmerId === swimmerId));
  const swimmer = store.swimmers.find((item) => item.id === swimmerId);

  return latest?.ageGroup ?? swimmer?.ageGroups.at(-1) ?? 'all';
}

function TrendChart({ entries }: { entries: Array<RankingEntry & { checkedAt: string }> }) {
  const ranked = entries.filter((entry) => entry.place != null);

  if (ranked.length < 2) {
    return <div className="empty-chart">More snapshots needed</div>;
  }

  const width = 380;
  const height = 150;
  const horizontalPad = 30;
  const plotTop = 24;
  const plotBottom = 108;
  const dateY = 136;
  const maxPlace = Math.max(10, ...ranked.map((entry) => entry.place!));
  const points = ranked.map((entry, index) => {
    const x = ranked.length === 1 ? width / 2 : (index / (ranked.length - 1)) * (width - horizontalPad * 2) + horizontalPad;
    const y = ((entry.place! - 1) / (maxPlace - 1)) * (plotBottom - plotTop) + plotTop;
    return { x, y, entry };
  });
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');

  return (
    <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Ranking trend chart">
      <line x1={horizontalPad} y1={plotTop} x2={width - horizontalPad} y2={plotTop} />
      <line x1={horizontalPad} y1={plotBottom} x2={width - horizontalPad} y2={plotBottom} />
      <path d={path} />
      {points.map((point) => (
        <g key={`${point.entry.checkedAt}-${point.entry.place}`}>
          <circle cx={point.x} cy={point.y} r="5" />
          <text x={point.x} y={point.y - 10}>{ordinal(point.entry.place)}</text>
          <text className="date-label" x={point.x} y={dateY}>{compactChartDate(point.entry.checkedAt)}</text>
        </g>
      ))}
    </svg>
  );
}

function PointsChart({ entries }: { entries: ResultTrend['entries'] }) {
  const ranked = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  if (ranked.length < 2) {
    return <div className="empty-chart">One result recorded</div>;
  }

  const width = 380;
  const height = 150;
  const horizontalPad = 30;
  const plotTop = 24;
  const plotBottom = 108;
  const dateY = 136;
  const minPoints = Math.min(...ranked.map((entry) => entry.points));
  const maxPoints = Math.max(...ranked.map((entry) => entry.points));
  const range = Math.max(1, maxPoints - minPoints);
  const chartPoints = ranked.map((entry, index) => {
    const x = ranked.length === 1 ? width / 2 : (index / (ranked.length - 1)) * (width - horizontalPad * 2) + horizontalPad;
    const y = plotBottom - ((entry.points - minPoints) / range) * (plotBottom - plotTop);
    return { x, y, entry };
  });
  const path = chartPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');

  return (
    <svg className="trend-chart points-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Points trend chart">
      <line x1={horizontalPad} y1={plotTop} x2={width - horizontalPad} y2={plotTop} />
      <line x1={horizontalPad} y1={plotBottom} x2={width - horizontalPad} y2={plotBottom} />
      <path d={path} />
      {chartPoints.map((point) => (
        <g key={`${point.entry.date}-${point.entry.points}-${point.entry.time}`}>
          <circle cx={point.x} cy={point.y} r="5" />
          <text x={point.x} y={point.y - 10}>{point.entry.points}</text>
          <text className="date-label" x={point.x} y={dateY}>{compactChartDate(point.entry.date)}</text>
        </g>
      ))}
    </svg>
  );
}

export function App() {
  const initialSwimmerId = seedStore.swimmers[0]?.id ?? '';
  const [store, setStore] = useState<RankingsStore>(() => seedStore);
  const [selectedSwimmerId, setSelectedSwimmerId] = useState(initialSwimmerId);
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(() => currentAgeGroupFor(seedStore, initialSwimmerId));
  const [selectedRankingScope, setSelectedRankingScope] = useState('all');
  const [selectedCompetitionName, setSelectedCompetitionName] = useState('all');
  const [selectedCompetitionCourse, setSelectedCompetitionCourse] = useState('all');
  const [selectedCompetitionEvent, setSelectedCompetitionEvent] = useState('all');

  useEffect(() => {
    loadGitHubData()
      .then((githubStore) => {
        const nextSwimmerId = githubStore.swimmers[0]?.id ?? '';
        setStore(githubStore);
        setSelectedSwimmerId(nextSwimmerId);
        setSelectedAgeGroup(currentAgeGroupFor(githubStore, nextSwimmerId));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setSelectedCompetitionName('');
    setSelectedCompetitionCourse('');
    setSelectedCompetitionEvent('');
  }, [selectedSwimmerId, selectedYear, selectedAgeGroup]);

  const selectedSwimmer = store.swimmers.find((swimmer) => swimmer.id === selectedSwimmerId) ?? store.swimmers[0];
  const sortedSwimmers = [...store.swimmers].sort((a, b) => a.name.localeCompare(b.name));
  const swimmerSnapshots = store.snapshots.filter((snapshot) => snapshot.swimmerId === selectedSwimmer?.id);
  const swimmerCompetitions = store.competitions.filter((result) => result.swimmerId === selectedSwimmer?.id);
  const swimmerAchievements = (store.achievements ?? [])
    .filter((achievement) => achievement.swimmerId === selectedSwimmer?.id)
    .sort((a, b) => b.year - a.year || a.title.localeCompare(b.title));
  const yearAgePairs = [
    ...swimmerSnapshots.map((snapshot) => ({
      year: new Date(snapshot.checkedAt).getFullYear(),
      ageGroup: snapshot.ageGroup,
    })),
    ...swimmerCompetitions.map((result) => ({
      year: competitionYear(result),
      ageGroup: normalizeAgeGroup(result.ageGroup),
    })),
  ];
  const years = [...new Set(yearAgePairs.map((pair) => pair.year))]
    .sort((a, b) => b - a);
  const ageGroups = [...new Set(yearAgePairs.map((pair) => pair.ageGroup))].sort();
  const yearOptions = selectedAgeGroup === 'all'
    ? years
    : [...new Set(yearAgePairs.filter((pair) => pair.ageGroup === selectedAgeGroup).map((pair) => pair.year))].sort((a, b) => b - a);
  const ageGroupOptions = ageGroups;
  const hasYearAgeData = (year: string, ageGroupValue: string): boolean => (
    (year === 'all' || years.includes(Number(year)))
    && (ageGroupValue === 'all' || ageGroups.includes(ageGroupValue))
    && (year === 'all' || ageGroupValue === 'all' || yearAgePairs.some((pair) => String(pair.year) === year && pair.ageGroup === ageGroupValue))
  );
  const bestAgeGroupForYear = (year: string): string => {
    const currentAgeGroup = currentAgeGroupFor(store, selectedSwimmerId);
    const options = year === 'all'
      ? ageGroups
      : [...new Set(yearAgePairs.filter((pair) => String(pair.year) === year).map((pair) => pair.ageGroup))].sort();

    return options.includes(currentAgeGroup) ? currentAgeGroup : options[0] ?? 'all';
  };

  useEffect(() => {
    if (!hasYearAgeData(selectedYear, selectedAgeGroup)) {
      setSelectedAgeGroup(bestAgeGroupForYear(selectedYear));
    }
  });

  const filteredCompetitions = swimmerCompetitions
    .filter((result) => selectedYear === 'all' || String(competitionYear(result)) === selectedYear)
    .filter((result) => selectedAgeGroup === 'all' || normalizeAgeGroup(result.ageGroup) === selectedAgeGroup)
    .sort((a, b) => b.date.localeCompare(a.date) || a.event.localeCompare(b.event));
  const filteredSnapshots = swimmerSnapshots
    .filter((snapshot) => selectedYear === 'all' || String(new Date(snapshot.checkedAt).getFullYear()) === selectedYear)
    .filter((snapshot) => selectedAgeGroup === 'all' || snapshot.ageGroup === selectedAgeGroup);
  const latest = latestSnapshot(filteredSnapshots);
  const allTrends = buildEventTrends(filteredSnapshots);
  const trends = selectedRankingScope === 'all'
    ? allTrends
    : allTrends.filter((trend) => trend.entries.some((entry) => entry.scope === selectedRankingScope));
  const competitionNames = [...new Set(filteredCompetitions.map((result) => result.competition))].sort();
  const competitionCourses = [...new Set(filteredCompetitions.map((result) => result.course))].sort();
  const competitionEvents = [...new Set(filteredCompetitions.map((result) => result.event))].sort();
  const hasCompetitionFilter = Boolean(selectedCompetitionName || selectedCompetitionCourse || selectedCompetitionEvent);
  const competitionResults = hasCompetitionFilter
    ? filteredCompetitions
      .filter((result) => !selectedCompetitionName || result.competition === selectedCompetitionName)
      .filter((result) => !selectedCompetitionCourse || result.course === selectedCompetitionCourse)
      .filter((result) => !selectedCompetitionEvent || result.event === selectedCompetitionEvent)
    : [];
  const competitionGroups = summarizeCompetitions(competitionResults);
  const currentAgeGroup = currentAgeGroupFor(store, selectedSwimmerId);
  const displayAgeGroup = selectedAgeGroup === 'all' ? currentAgeGroup : selectedAgeGroup;

  const allPointResults = pointResults(swimmerCompetitions);
  const filteredPointResults = pointResults(filteredCompetitions);
  const currentAgePointResults = allPointResults.filter((item) => normalizeAgeGroup(item.result.ageGroup) === currentAgeGroup);
  const bestPointResult = [...allPointResults].sort((a, b) => b.points - a.points)[0];
  const latestPointResult = [...allPointResults].sort((a, b) => b.result.date.localeCompare(a.result.date))[0];
  const latestMeetPointResults = latestPointResult
    ? allPointResults.filter((item) => item.result.date === latestPointResult.result.date)
    : [];
  const averagePoints = average(allPointResults.map((item) => item.points));
  const filteredAveragePoints = average(filteredPointResults.map((item) => item.points));
  const currentAgeAveragePoints = average(currentAgePointResults.map((item) => item.points));
  const latestMeetAveragePoints = average(latestMeetPointResults.map((item) => item.points));
  const ageGroupPointSummaries = [...allPointResults.reduce((groups, item) => {
    const key = normalizeAgeGroup(item.result.ageGroup);
    groups.set(key, [...(groups.get(key) ?? []), item]);
    return groups;
  }, new Map<string, typeof allPointResults>())]
    .map(([group, results]) => ({
      group,
      count: results.length,
      average: average(results.map((item) => item.points)),
      best: [...results].sort((a, b) => b.points - a.points)[0],
      latest: [...results].sort((a, b) => b.result.date.localeCompare(a.result.date))[0],
    }))
    .sort((a, b) => b.group.localeCompare(a.group));

  const resultTrends = useMemo(() => {
    const grouped = filteredPointResults.reduce((groups, item) => {
      if (!isPoolCourse(item.result.course)) {
        return groups;
      }

      const key = `${item.result.course}|${item.result.event}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
      return groups;
    }, new Map<string, PointResult[]>());

    return [...grouped.entries()]
      .map(([key, results]): ResultTrend => {
        const entries = results
          .map((item) => ({
            date: item.result.date,
            points: item.points,
            time: item.result.time,
            seconds: resultSeconds(item.result.time),
          }))
          .sort((a, b) => a.date.localeCompare(b.date));
        const timed = entries.filter((entry) => entry.seconds != null);

        return {
          key,
          label: key.replace('|', ' - '),
          entries,
          bestPoints: Math.max(...entries.map((entry) => entry.points)),
          latestPoints: entries.at(-1)?.points ?? 0,
          bestTimeSeconds: timed.length ? Math.min(...timed.map((entry) => entry.seconds!)) : null,
          latestTimeSeconds: timed.at(-1)?.seconds ?? null,
        };
      })
      .sort((a, b) => b.bestPoints - a.bestPoints || a.label.localeCompare(b.label));
  }, [filteredPointResults]);

  const currentEntries = useMemo(
    () => [...(latest?.entries ?? [])]
      .filter((entry) => selectedRankingScope === 'all' || entry.scope === selectedRankingScope)
      .sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || scopeLabel(a).localeCompare(scopeLabel(b))),
    [latest, selectedRankingScope],
  );

  const pointOpportunities = useMemo(() => {
    const weakestByEvent = new Map<string, PointOpportunity>();

    filteredPointResults
      .forEach((item) => {
        if (!isPoolCourse(item.result.course)) {
          return;
        }

        const course = item.result.course;
        const key = `${course}|${item.result.event}`;
        const current = weakestByEvent.get(key);

        if (current && current.points <= item.points) {
          return;
        }

        weakestByEvent.set(key, {
          course,
          event: item.result.event,
          points: item.points,
          time: item.result.time,
          date: item.result.date,
          gapToAverage: filteredAveragePoints == null ? null : Math.max(0, filteredAveragePoints - item.points),
        });
      });

    return byCourse(
      [...weakestByEvent.values()].sort((a, b) => a.points - b.points || a.event.localeCompare(b.event)),
      2,
    );
  }, [filteredPointResults, filteredAveragePoints]);

  const rankingOpportunities = useMemo(() => byCourse(
    currentEntries
      .filter((entry): entry is RankingOpportunity => (
        isPoolCourse(entry.course)
        && entry.place != null
        && entry.place > 1
        && entry.gapSeconds != null
        && entry.gapSeconds > 0
      ))
      .sort((a, b) => (a.gapSeconds ?? 99) - (b.gapSeconds ?? 99) || (a.place ?? 99) - (b.place ?? 99)),
    2,
  ), [currentEntries]);

  const latestMovement = useMemo(() => {
    const ordered = [...filteredSnapshots].sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
    const current = ordered.at(-1);
    const previous = ordered.at(-2);

    if (!current || !previous) {
      return { improved: 0, dropped: 0 };
    }

    const previousPlaces = new Map(previous.entries.map((entry) => [eventKey(entry), entry.place]));

    return current.entries
      .filter((entry) => selectedRankingScope === 'all' || entry.scope === selectedRankingScope)
      .reduce((summary, entry) => {
      const previousPlace = previousPlaces.get(eventKey(entry));

      if (entry.place == null || previousPlace == null || entry.place === previousPlace) {
        return summary;
      }

      if (entry.place < previousPlace) {
        summary.improved += 1;
      } else {
        summary.dropped += 1;
      }

      return summary;
    }, { improved: 0, dropped: 0 });
  }, [filteredSnapshots, selectedRankingScope]);

  const bestRankingInView = trends.find((trend) => trend.bestPlace != null);

  return (
    <main>
      <section className="top-shell">
        <div className="pool-visual" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="top-content">
          <div>
            <p className="eyebrow">Masters Swimming Rankings</p>
            <h1>{selectedSwimmer?.name ?? 'No swimmer selected'}</h1>
            <p className="subtle">{selectedSwimmer?.club ?? 'Add a swimmer to start tracking'} · {displayAgeGroup}</p>
            <p className="subtle refresh-date">Data refreshed {formatDate(store.updatedAt)}</p>
          </div>
          <div className="top-controls">
            <label className="field">
              <span>Swimmer</span>
              <select value={selectedSwimmerId} onChange={(event) => {
                const nextSwimmerId = event.target.value;
                setSelectedSwimmerId(nextSwimmerId);
                setSelectedAgeGroup(currentAgeGroupFor(store, nextSwimmerId));
              }}>
                {sortedSwimmers.map((swimmer) => (
                  <option key={swimmer.id} value={swimmer.id}>{swimmer.name}</option>
                ))}
              </select>
            </label>
            <label className="field compact">
              <span>Year</span>
              <select value={selectedYear} onChange={(event) => {
                const nextYear = event.target.value;
                setSelectedYear(nextYear);

                if (!hasYearAgeData(nextYear, selectedAgeGroup)) {
                  setSelectedAgeGroup(bestAgeGroupForYear(nextYear));
                }
              }}>
                <option value="all">All years</option>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
            <label className="field compact">
              <span>Age group</span>
              <select value={selectedAgeGroup} onChange={(event) => {
                const nextAgeGroup = event.target.value;
                setSelectedAgeGroup(nextAgeGroup);

                if (!hasYearAgeData(selectedYear, nextAgeGroup)) {
                  setSelectedYear('all');
                }
              }}>
                <option value="all">All age groups</option>
                {ageGroupOptions.map((group) => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </label>
            <label className="field compact">
              <span>Region</span>
              <select value={selectedRankingScope} onChange={(event) => setSelectedRankingScope(event.target.value)}>
                <option value="all">Queensland + National</option>
                <option value="Queensland">Queensland</option>
                <option value="Australia">National</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      {swimmerSnapshots.length === 0 ? (
        <section className="empty-state">
          <h2>No ranking history yet</h2>
          <p>{selectedSwimmer?.name} is seeded as a club member, but no official ranking snapshots have been imported for them yet.</p>
        </section>
      ) : (
        <>
          <section className="stats-grid">
            <article>
              <span>Best ranking in view</span>
              <strong>{bestRankingInView ? `${ordinal(bestRankingInView.bestPlace)} ${bestRankingInView.label}` : 'n/a'}</strong>
            </article>
            <article>
              <span>Improved since prior run</span>
              <strong>{latestMovement.improved}</strong>
            </article>
            <article>
              <span>Dropped since prior run</span>
              <strong>{latestMovement.dropped}</strong>
            </article>
          </section>

          {swimmerAchievements.length > 0 && (
            <section className="panel achievement-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Endurance</p>
                  <h2>Million Metres and challenges</h2>
                </div>
              </div>
              <div className="achievement-list">
                {swimmerAchievements.map((achievement) => (
                  <article key={achievement.id}>
                    <div>
                      <span>{achievement.year}</span>
                      <strong>{achievement.award}</strong>
                    </div>
                    <div>
                      <strong>{achievement.title}</strong>
                      <p>
                        {achievement.minimumMetres ? `At least ${achievement.minimumMetres.toLocaleString('en-AU')} m logged` : 'Logged endurance challenge result'}
                        {achievement.notes ? ` · ${achievement.notes}` : ''}
                      </p>
                    </div>
                    <a href={achievement.sourceUrl} target="_blank" rel="noreferrer">{achievement.sourceName}</a>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="panel">
            <div className="point-grid">
              <article>
                <span>All-time best</span>
                <strong>{bestPointResult ? `${bestPointResult.points} pts` : 'n/a'}</strong>
                <p>{bestPointResult ? `${normalizeAgeGroup(bestPointResult.result.ageGroup)} · ${bestPointResult.result.course} ${bestPointResult.result.event}` : 'No scored swim yet'}</p>
              </article>
              <article>
                <span>All-results average</span>
                <strong>{formatPoints(averagePoints)}</strong>
                <p>{allPointResults.length} scored swims</p>
              </article>
              <article>
                <span>Current age/sex average</span>
                <strong>{formatPoints(currentAgeAveragePoints)}</strong>
                <p>{currentAgeGroup}</p>
              </article>
              <article>
                <span>Filtered average</span>
                <strong>{formatPoints(filteredAveragePoints)}</strong>
                <p>{selectedYear === 'all' ? 'All years' : selectedYear} · {selectedAgeGroup === 'all' ? 'All age groups' : selectedAgeGroup}</p>
              </article>
              <article>
                <span>Latest meet average</span>
                <strong>{formatPoints(latestMeetAveragePoints)}</strong>
                <p>{latestPointResult ? `${formatDate(latestPointResult.result.date)} · ${latestMeetPointResults.length} scored swims` : 'No scored meet yet'}</p>
              </article>
            </div>
            <div className="point-table">
              <div className="point-head">
                <span>Age/sex</span>
                <span>Average</span>
                <span>Best</span>
                <span>Latest</span>
                <span>Scored swims</span>
              </div>
              {ageGroupPointSummaries.map((summary) => (
                <div key={summary.group}>
                  <strong>{summary.group}</strong>
                  <span>{formatPoints(summary.average)}</span>
                  <span>{summary.best ? `${summary.best.points} · ${summary.best.result.course} ${summary.best.result.event}` : 'n/a'}</span>
                  <span>{summary.latest ? `${summary.latest.points} · ${formatDate(summary.latest.result.date)}` : 'n/a'}</span>
                  <span>{summary.count}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel opportunities-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Race choice</p>
                <h2>Opportunities</h2>
              </div>
            </div>
            <div className="opportunity-grid">
              <div className="opportunity-column">
                <h3>Lift point average</h3>
                <div className="opportunity-list">
                  {pointOpportunities.length ? pointOpportunities.map((item) => (
                    <article key={`points-${item.course}-${item.event}-${item.date}`}>
                      <span className="course-chip">{item.course}</span>
                      <div>
                        <strong>{item.event}</strong>
                        <p>{item.points} pts{item.time ? ` · ${item.time}` : ''} · {formatDate(item.date)}</p>
                      </div>
                      <span className="opportunity-note">
                        {item.gapToAverage != null && item.gapToAverage >= 1 ? `${Math.round(item.gapToAverage)} below avg` : 'Lowest scored swim'}
                      </span>
                    </article>
                  )) : (
                    <div className="inline-empty">No scored swims in this filtered view.</div>
                  )}
                </div>
              </div>
              <div className="opportunity-column">
                <h3>Close ranking moves</h3>
                <div className="opportunity-list">
                  {rankingOpportunities.length ? rankingOpportunities.map((entry) => (
                    <article key={`ranking-${entry.scope}-${entry.course}-${entry.event}`}>
                      <span className="course-chip">{entry.course}</span>
                      <div>
                        <strong>{entry.event}</strong>
                        <p>
                          {scopeLabel(entry)} · {ordinal(entry.place)} now · {formatSeconds(entry.gapSeconds)} to {ordinal((entry.place ?? 1) - 1)}
                        </p>
                      </div>
                      <span className="opportunity-note">
                        {entry.aheadName ? `${entry.aheadName}${entry.aheadTime ? ` ${entry.aheadTime}` : ''}` : 'Swimmer ahead'}
                      </span>
                    </article>
                  )) : (
                    <div className="inline-empty">No close ranking gaps in this filtered view.</div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="rank-list">
              {currentEntries.length ? currentEntries.map((entry) => {
                const entryPointResult = allPointResults.find((item) => (
                  item.result.course === entry.course
                  && item.result.event === entry.event
                  && item.result.date === entry.resultDate
                  && item.result.time === entry.time
                ));

                return (
                  <article key={`${entry.scope}-${entry.course}-${entry.event}`} className="rank-row">
                    <div className="rank-place">{ordinal(entry.place)}</div>
                    <div>
                      <strong>{entry.event}</strong>
                      <span>
                        {scopeLabel(entry)}
                        {entry.time ? ` · ${entry.time}` : ''}
                        {entryPointResult ? ` · ${entryPointResult.points} pts` : ''}
                      </span>
                    </div>
                    <div className="gap">
                      {entry.gapSeconds != null
                        ? `${entry.gapSeconds.toFixed(2)}s behind ${entry.aheadName}`
                        : entry.place === 1
                          ? 'Leading'
                          : 'No official 2026 position listed'}
                    </div>
                  </article>
                );
              }) : (
                <div className="inline-empty">No ranking snapshot is imported for this filtered view.</div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{trends.length ? 'Movement' : 'Historical results'}</p>
                <h2>{trends.length ? 'Ranking history' : 'Result history'}</h2>
              </div>
            </div>
            {trends.length ? (
              <div className="trend-grid">
                {trends.map((trend) => (
                  <article key={trend.key} className="trend-card">
                    <div className="trend-card-head">
                      <strong>{trend.label}</strong>
                      <span className={trend.movement && trend.movement < 0 ? 'down' : trend.movement && trend.movement > 0 ? 'up' : ''}>
                        {movementText(trend.movement)}
                      </span>
                    </div>
                    <TrendChart entries={trend.entries} />
                    <div className="trend-meta">
                      <span>Best {ordinal(trend.bestPlace)}</span>
                      <span>Latest {ordinal(trend.latestPlace)}</span>
                      <span>Best time {formatSeconds(trend.bestTimeSeconds)}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : resultTrends.length ? (
              <div className="trend-grid">
                {resultTrends.map((trend) => (
                  <article key={trend.key} className="trend-card result-trend-card">
                    <div className="trend-card-head">
                      <strong>{trend.label}</strong>
                      <span>{trend.entries.length} swims</span>
                    </div>
                    <PointsChart entries={trend.entries} />
                    <div className="trend-meta">
                      <span>Best {trend.bestPoints} pts</span>
                      <span>Latest {trend.latestPoints} pts</span>
                      <span>Best time {formatSeconds(trend.bestTimeSeconds)}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="inline-empty">No ranking snapshots or scored result history in this filtered view.</div>
            )}
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Competitions</p>
                <h2>Placings and medals</h2>
              </div>
              <div className="section-controls">
                <label className="field compact">
                  <span>Competition</span>
                  <select value={selectedCompetitionName} onChange={(event) => setSelectedCompetitionName(event.target.value)}>
                    <option value="">Select competition</option>
                    {competitionNames.map((competition) => (
                      <option key={competition} value={competition}>{competition}</option>
                    ))}
                  </select>
                </label>
                <label className="field compact">
                  <span>Course</span>
                  <select value={selectedCompetitionCourse} onChange={(event) => setSelectedCompetitionCourse(event.target.value)}>
                    <option value="">Select course</option>
                    {competitionCourses.map((course) => (
                      <option key={course} value={course}>{course}</option>
                    ))}
                  </select>
                </label>
                <label className="field compact">
                  <span>Event</span>
                  <select value={selectedCompetitionEvent} onChange={(event) => setSelectedCompetitionEvent(event.target.value)}>
                    <option value="">Select event</option>
                    {competitionEvents.map((eventName) => (
                      <option key={eventName} value={eventName}>{eventName}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="competition-list">
              {!hasCompetitionFilter ? (
                <div className="inline-empty">Select a competition, course, or event to show results.</div>
              ) : [...competitionGroups.entries()].map(([key, results]) => (
                  <article key={key}>
                    <strong>{key}</strong>
                    {results.map((result) => (
                      <p key={result.id}>{result.event} · {result.time ?? 'no time'} · {result.points ?? '-'} pts · {result.placing ?? result.location ?? 'placing needed'} · Medal {result.medal ?? 'Unknown'}</p>
                    ))}
                  </article>
                ))}
            </div>
          </section>
        </>
      )}

    </main>
  );
}
