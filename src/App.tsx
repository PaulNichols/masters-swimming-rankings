import { useEffect, useMemo, useState } from 'react';
import { seedStore } from './data';
import { loadGitHubData } from './githubData';
import { buildEventTrends, eventKey, formatDate, formatSeconds, latestSnapshot, movementText, ordinal, summarizeCompetitions } from './metrics';
import type { CompetitionResult, RankingEntry, RankingsStore } from './types';

type PointResult = {
  result: CompetitionResult;
  points: number;
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
    setSelectedCompetitionName('all');
    setSelectedCompetitionCourse('all');
    setSelectedCompetitionEvent('all');
  }, [selectedSwimmerId, selectedYear, selectedAgeGroup]);

  const selectedSwimmer = store.swimmers.find((swimmer) => swimmer.id === selectedSwimmerId) ?? store.swimmers[0];
  const sortedSwimmers = [...store.swimmers].sort((a, b) => a.name.localeCompare(b.name));
  const swimmerSnapshots = store.snapshots.filter((snapshot) => snapshot.swimmerId === selectedSwimmer?.id);
  const swimmerCompetitions = store.competitions.filter((result) => result.swimmerId === selectedSwimmer?.id);
  const years = [...new Set(swimmerCompetitions.map((result) => result.year ?? new Date(result.date).getFullYear()))]
    .sort((a, b) => b - a);
  const ageGroups = [...new Set([
    ...swimmerSnapshots.map((snapshot) => snapshot.ageGroup),
    ...swimmerCompetitions.map((result) => normalizeAgeGroup(result.ageGroup)),
  ])].sort();
  const filteredCompetitions = swimmerCompetitions
    .filter((result) => selectedYear === 'all' || String(result.year ?? new Date(result.date).getFullYear()) === selectedYear)
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
  const competitionResults = filteredCompetitions
    .filter((result) => selectedCompetitionName === 'all' || result.competition === selectedCompetitionName)
    .filter((result) => selectedCompetitionCourse === 'all' || result.course === selectedCompetitionCourse)
    .filter((result) => selectedCompetitionEvent === 'all' || result.event === selectedCompetitionEvent);
  const competitionGroups = summarizeCompetitions(competitionResults);
  const ageGroup = latest?.ageGroup ?? selectedSwimmer?.ageGroups[0] ?? 'No age group yet';

  const allPointResults = pointResults(swimmerCompetitions);
  const filteredPointResults = pointResults(filteredCompetitions);
  const currentAgePointResults = allPointResults.filter((item) => normalizeAgeGroup(item.result.ageGroup) === ageGroup);
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

  const currentEntries = useMemo(
    () => [...(latest?.entries ?? [])]
      .filter((entry) => selectedRankingScope === 'all' || entry.scope === selectedRankingScope)
      .sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || scopeLabel(a).localeCompare(scopeLabel(b))),
    [latest, selectedRankingScope],
  );

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

  const bestEver = trends.find((trend) => trend.bestPlace != null);

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
            <p className="subtle">{selectedSwimmer?.club ?? 'Add a swimmer to start tracking'} · {ageGroup} · Data refreshed {formatDate(store.updatedAt)}</p>
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
              <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>
                <option value="all">All years</option>
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
            <label className="field compact">
              <span>Age group</span>
              <select value={selectedAgeGroup} onChange={(event) => setSelectedAgeGroup(event.target.value)}>
                <option value="all">All age groups</option>
                {ageGroups.map((group) => (
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
              <span>Best ever</span>
              <strong>{bestEver ? `${ordinal(bestEver.bestPlace)} ${bestEver.label}` : 'n/a'}</strong>
            </article>
            <article>
              <span>Average point score</span>
              <strong>{formatPoints(averagePoints)}</strong>
            </article>
            <article>
              <span>Best point score</span>
              <strong>{bestPointResult ? `${bestPointResult.points} ${bestPointResult.result.course} ${bestPointResult.result.event}` : 'n/a'}</strong>
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

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Points</p>
                <h2>Point score</h2>
              </div>
              <span className="subtle">Official MSARC result-history points</span>
            </div>
            <div className="point-grid">
              <article>
                <span>All-results average</span>
                <strong>{formatPoints(averagePoints)}</strong>
                <p>{allPointResults.length} scored swims</p>
              </article>
              <article>
                <span>Current age/sex average</span>
                <strong>{formatPoints(currentAgeAveragePoints)}</strong>
                <p>{ageGroup}</p>
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

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Current snapshot</p>
                <h2>Best positions first</h2>
              </div>
              <span>{latest ? formatDate(latest.checkedAt) : ''}</span>
            </div>
            <div className="rank-list">
              {currentEntries.map((entry) => {
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
              })}
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Movement</p>
                <h2>Ranking history</h2>
              </div>
            </div>
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
          </section>

          <section className="panel two-column">
            <div>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Progress</p>
                  <h2>Times by event</h2>
                </div>
              </div>
              <div className="time-table">
                {trends.filter((trend) => trend.bestTimeSeconds != null).map((trend) => (
                  <div key={trend.key}>
                    <span>{trend.label}</span>
                    <strong>{formatSeconds(trend.bestTimeSeconds)}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Competitions</p>
                  <h2>Placings and medals</h2>
                </div>
                <div className="section-controls">
                  <label className="field compact">
                    <span>Competition</span>
                    <select value={selectedCompetitionName} onChange={(event) => setSelectedCompetitionName(event.target.value)}>
                      <option value="all">All competitions</option>
                      {competitionNames.map((competition) => (
                        <option key={competition} value={competition}>{competition}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field compact">
                    <span>Course</span>
                    <select value={selectedCompetitionCourse} onChange={(event) => setSelectedCompetitionCourse(event.target.value)}>
                      <option value="all">All courses</option>
                      {competitionCourses.map((course) => (
                        <option key={course} value={course}>{course}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field compact">
                    <span>Event</span>
                    <select value={selectedCompetitionEvent} onChange={(event) => setSelectedCompetitionEvent(event.target.value)}>
                      <option value="all">All events</option>
                      {competitionEvents.map((eventName) => (
                        <option key={eventName} value={eventName}>{eventName}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="competition-list">
                {[...competitionGroups.entries()].map(([key, results]) => (
                  <article key={key}>
                    <strong>{key}</strong>
                    {results.map((result) => (
                      <p key={result.id}>{result.event} · {result.time ?? 'no time'} · {result.points ?? '-'} pts · {result.placing ?? result.location ?? 'placing needed'} · Medal {result.medal ?? 'Unknown'}</p>
                    ))}
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Official MSARC history</p>
                <h2>Previous years and age groups</h2>
              </div>
            </div>
            <div className="history-table">
              <div className="history-head">
                <span>Date</span>
                <span>Age</span>
                <span>Event</span>
                <span>Time</span>
                <span>Points</span>
                <span>Location</span>
              </div>
              {filteredCompetitions.map((result) => (
                <div key={result.id}>
                  <span>{formatDate(result.date)}</span>
                  <span>{normalizeAgeGroup(result.ageGroup)}</span>
                  <span>{result.course} {result.event}</span>
                  <strong>{result.time || 'n/a'}</strong>
                  <span>{result.points ?? '-'}</span>
                  <span>{result.location ?? result.competition}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

    </main>
  );
}
