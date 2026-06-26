import { useEffect, useMemo, useState } from 'react';
import { seedStore } from './data';
import { loadGitHubData } from './githubData';
import { buildEventTrends, eventKey, formatDate, formatSeconds, latestSnapshot, movementText, ordinal, summarizeCompetitions } from './metrics';
import type { RankingEntry, RankingsStore } from './types';

function scopeLabel(entry: RankingEntry): string {
  return entry.scope === 'World' ? 'World' : `${entry.scope} ${entry.course}`;
}

function compactChartDate(value: string): string {
  const date = new Date(value);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()];

  return `${date.getDate().toString().padStart(2, '0')} ${month} ${date.getFullYear().toString().slice(-2)}`;
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
  const [store, setStore] = useState<RankingsStore>(() => seedStore);
  const [selectedSwimmerId, setSelectedSwimmerId] = useState(seedStore.swimmers[0]?.id ?? '');
  const [selectedTrendKey, setSelectedTrendKey] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState('all');
  const [dataSource, setDataSource] = useState('Bundled seed data');

  useEffect(() => {
    loadGitHubData()
      .then((githubStore) => {
        setStore(githubStore);
        setSelectedSwimmerId(githubStore.swimmers[0]?.id ?? '');
        setDataSource('GitHub JSON');
      })
      .catch(() => {
        setDataSource('Bundled seed data');
      });
  }, []);

  const selectedSwimmer = store.swimmers.find((swimmer) => swimmer.id === selectedSwimmerId) ?? store.swimmers[0];
  const swimmerSnapshots = store.snapshots.filter((snapshot) => snapshot.swimmerId === selectedSwimmer?.id);
  const swimmerCompetitions = store.competitions.filter((result) => result.swimmerId === selectedSwimmer?.id);
  const years = [...new Set(swimmerCompetitions.map((result) => result.year ?? new Date(result.date).getFullYear()))]
    .sort((a, b) => b - a);
  const ageGroups = [...new Set([
    ...swimmerSnapshots.map((snapshot) => snapshot.ageGroup),
    ...swimmerCompetitions.map((result) => `Men ${result.ageGroup.replace(/^Men\s+/i, '')}`),
  ])].sort();
  const filteredCompetitions = swimmerCompetitions
    .filter((result) => selectedYear === 'all' || String(result.year ?? new Date(result.date).getFullYear()) === selectedYear)
    .filter((result) => selectedAgeGroup === 'all' || `Men ${result.ageGroup.replace(/^Men\s+/i, '')}` === selectedAgeGroup)
    .sort((a, b) => b.date.localeCompare(a.date) || a.event.localeCompare(b.event));
  const latest = latestSnapshot(swimmerSnapshots);
  const trends = buildEventTrends(swimmerSnapshots);
  const filteredTrends = selectedTrendKey === 'all' ? trends : trends.filter((trend) => trend.key === selectedTrendKey);
  const competitionGroups = summarizeCompetitions(filteredCompetitions);

  const currentEntries = useMemo(
    () => [...(latest?.entries ?? [])].sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || scopeLabel(a).localeCompare(scopeLabel(b))),
    [latest],
  );

  const latestMovement = useMemo(() => {
    const ordered = [...swimmerSnapshots].sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
    const current = ordered.at(-1);
    const previous = ordered.at(-2);

    if (!current || !previous) {
      return { improved: 0, dropped: 0 };
    }

    const previousPlaces = new Map(previous.entries.map((entry) => [eventKey(entry), entry.place]));

    return current.entries.reduce((summary, entry) => {
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
  }, [swimmerSnapshots]);

  const bestEver = trends.find((trend) => trend.bestPlace != null);
  const ageGroup = latest?.ageGroup ?? selectedSwimmer?.ageGroups[0] ?? 'No age group yet';

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
            <p className="subtle">{selectedSwimmer?.club ?? 'Add a swimmer to start tracking'} · {ageGroup}</p>
          </div>
          <label className="field">
            <span>Swimmer</span>
            <select value={selectedSwimmerId} onChange={(event) => setSelectedSwimmerId(event.target.value)}>
              {store.swimmers.map((swimmer) => (
                <option key={swimmer.id} value={swimmer.id}>{swimmer.name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="data-bar">
        <span>Data source: {dataSource}</span>
        <span>Updated: {formatDate(store.updatedAt)}</span>
        <button type="button" onClick={() => {
          loadGitHubData()
            .then((githubStore) => {
              setStore(githubStore);
              setDataSource('GitHub JSON');
            })
            .catch(() => setDataSource('Bundled seed data'));
        }}>Refresh GitHub JSON</button>
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
              <span>Current listed events</span>
              <strong>{currentEntries.filter((entry) => entry.place != null).length}</strong>
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
                <p className="eyebrow">Current snapshot</p>
                <h2>Best positions first</h2>
              </div>
              <span>{latest ? formatDate(latest.checkedAt) : ''}</span>
            </div>
            <div className="rank-list">
              {currentEntries.map((entry) => (
                <article key={`${entry.scope}-${entry.course}-${entry.event}`} className="rank-row">
                  <div className="rank-place">{ordinal(entry.place)}</div>
                  <div>
                    <strong>{entry.event}</strong>
                    <span>{scopeLabel(entry)}{entry.time ? ` · ${entry.time}` : ''}</span>
                  </div>
                  <div className="gap">
                    {entry.gapSeconds != null
                      ? `${entry.gapSeconds.toFixed(2)}s behind ${entry.aheadName}`
                      : entry.place === 1
                        ? 'Leading'
                        : 'No official 2026 position listed'}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Movement</p>
                <h2>Ranking history</h2>
              </div>
              <label className="field compact">
                <span>Event</span>
                <select value={selectedTrendKey} onChange={(event) => setSelectedTrendKey(event.target.value)}>
                  <option value="all">All events</option>
                  {trends.map((trend) => (
                    <option key={trend.key} value={trend.key}>{trend.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="trend-grid">
              {filteredTrends.map((trend) => (
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
              </div>
              <div className="competition-list">
                {[...competitionGroups.entries()].map(([key, results]) => (
                  <article key={key}>
                    <strong>{key}</strong>
                    {results.map((result) => (
                      <p key={result.id}>{result.event} · {result.time ?? 'no time'} · {result.placing ?? result.location ?? 'placing needed'} · Medal {result.medal ?? 'Unknown'}</p>
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
              <div className="filter-row">
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
                  <span>Men {result.ageGroup.replace(/^Men\s+/i, '')}</span>
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

      <footer>
        <span>Canonical data lives in GitHub JSON and is published by GitHub Pages.</span>
        <span>Seed fallback: {seedStore.updatedAt}</span>
      </footer>
    </main>
  );
}
