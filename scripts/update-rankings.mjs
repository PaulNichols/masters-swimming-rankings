import fs from 'node:fs/promises';

const dataPath = new URL('../public/data/rankings.json', import.meta.url);
const currentYear = new Date().getFullYear();
const historyStartYear = 2000;
const e1000StartYear = 2010;
const e1000SourceUrl = 'https://e1000.msarc.org.au/results/results.php';
const target26Metres = 26 * 2600;
const millionMetresTarget = 1_000_000;
const sourceHeaders = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-AU,en;q=0.9',
  'user-agent': 'Mozilla/5.0 (compatible; masters-swimming-rankings-data-refresh/1.0)',
};

const swimmers = [
  {
    id: 'paul-nichols',
    name: 'Paul Nichols',
    msaName: 'PAUL NICHOLS',
    e1000Name: 'NICHOLS , PAUL',
    club: 'Brisbane Southside Masters / QSM',
    rankingGroups: ['50-54'],
  },
  {
    id: 'josh-hemelaar',
    name: 'Josh Hemelaar',
    msaName: 'JOSH HEMELAAR',
    e1000Name: 'HEMELAAR , JOSH',
    club: 'Brisbane Southside Masters',
    rankingGroups: ['40-44'],
  },
  {
    id: 'stuart-collins',
    name: 'Stuart Collins',
    msaName: 'STUART COLLINS',
    e1000Name: 'COLLINS , STUART',
    club: 'Brisbane Southside Masters / QSM',
    rankingGroups: ['50-54'],
  },
];

function stripHtml(value) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function cells(rowHtml) {
  return [...rowHtml.matchAll(/<td[^>]*>(.*?)<\/td>/gis)].map((match) => stripHtml(match[1]));
}

function toIsoDate(value) {
  const match = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) {
    return value;
  }

  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function seconds(value) {
  if (!value) {
    return undefined;
  }

  if (/^\d+$/.test(value)) {
    return Number(value);
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

async function fetchText(url) {
  const response = await fetch(url, {
    headers: sourceHeaders,
  });
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${url}`);
  }

  return response.text();
}

async function fetchForm(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    body: new URLSearchParams(body),
    headers: {
      ...sourceHeaders,
      'content-type': 'application/x-www-form-urlencoded',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${url}`);
  }

  return response.text();
}

async function readResultHistory(swimmer, year) {
  const url = new URL('https://portal.msarc.org.au/results/results.php');
  url.searchParams.set('bg', '1');
  url.searchParams.set('year', String(year));
  url.searchParams.set('name', swimmer.msaName);
  url.searchParams.set('aussiid', '');
  url.searchParams.set('pb', 'no');
  url.searchParams.set('Show', 'Show');

  const html = await fetchText(url);
  const rows = [...html.matchAll(/<tr><td align='center'><br><\/td>.*?<\/tr>/gis)];

  return rows
    .map((match) => cells(match[0]))
    .filter((row) => row.length >= 14 && /^\d+$/.test(row[1]))
    .map((row, index) => ({
      id: `msarc-${swimmer.id}-${year}-${String(index + 1).padStart(3, '0')}`,
      swimmerId: swimmer.id,
      competition: row[13],
      date: toIsoDate(row[12]),
      year,
      ageGroup: row[4],
      event: `${row[6]} ${row[7]}`.trim(),
      course: row[5],
      time: row[8] || undefined,
      points: row[11] || undefined,
      location: row[13],
      placing: 'Official MSARC result history',
      medal: 'Unknown',
    }));
}

function enduranceMetres(distance, result) {
  const distanceMatch = distance.match(/^(\d+)m$/i);
  if (distanceMatch) {
    return Number(distanceMatch[1]);
  }

  if (/^\d+MIN$/i.test(distance) && /^\d+$/.test(result)) {
    return Number(result);
  }

  return undefined;
}

async function readEnduranceHistory(swimmer, year) {
  const html = await fetchForm(e1000SourceUrl, {
    year: String(year),
    name: swimmer.e1000Name,
    aussiid: '',
    Show: 'Show',
  });

  const uniqueRows = new Map();

  [...html.matchAll(/<tr>.*?<\/tr>/gis)]
    .map((match) => cells(match[0]))
    .filter((row) => row.length >= 12 && /^\d+$/.test(row[0]) && row[7] && Number(row[9]) > 0 && row[10])
    .forEach((row) => {
      const [msaId, club, , ageGroup, course, distance, stroke, result, , point, date, location] = row;
      const key = `${year}|${date}|${distance}|${stroke}|${result}`;

      if (!uniqueRows.has(key) || (club && club !== '---')) {
        uniqueRows.set(key, {
          msaId,
          club,
          ageGroup,
          course,
          distance,
          stroke,
          result,
          points: Number(point),
          date: toIsoDate(date),
          location: location || undefined,
          metres: enduranceMetres(distance, result),
        });
      }
    });

  return [...uniqueRows.values()].map((row, index) => ({
    id: `e1000-${swimmer.id}-${year}-${String(index + 1).padStart(3, '0')}`,
    swimmerId: swimmer.id,
    year,
    ageGroup: `Men ${row.ageGroup}`,
    course: row.course || undefined,
    distance: row.distance,
    stroke: row.stroke,
    result: row.result.replace(/^0+(?=\d)/, ''),
    metres: row.metres,
    points: row.points,
    date: row.date,
    location: row.location,
    sourceName: 'MSA Endurance 1000',
    sourceUrl: e1000SourceUrl,
  }));
}

function achievementPrograms(existing) {
  return (existing.achievements ?? []).map((achievement) => ({
    id: achievement.id,
    swimmerId: achievement.swimmerId,
    year: achievement.year,
    title: achievement.title,
    program: '50x50',
    status: achievement.award,
    completed: achievement.minimumMetres,
    target: achievement.minimumMetres,
    unit: 'm',
    metres: achievement.minimumMetres,
    sourceName: achievement.sourceName,
    sourceUrl: achievement.sourceUrl,
    notes: achievement.notes,
  }));
}

function endurancePrograms(swimmer, enduranceResults, existing) {
  const swimmerRows = enduranceResults.filter((row) => row.swimmerId === swimmer.id);
  const knownMetres = swimmerRows.reduce((total, row) => total + (row.metres ?? 0), 0);
  const currentYearMetres = swimmerRows
    .filter((row) => row.year === currentYear)
    .reduce((total, row) => total + (row.metres ?? 0), 0);
  const programs = [];

  if (knownMetres > 0) {
    programs.push({
      id: `million-metres-e1000-${swimmer.id}`,
      swimmerId: swimmer.id,
      year: currentYear,
      title: 'Million Metres progress',
      program: 'million-metres',
      status: 'Known E1000 total',
      completed: knownMetres,
      target: millionMetresTarget,
      unit: 'm',
      metres: knownMetres,
      sourceName: 'MSA Endurance 1000',
      sourceUrl: e1000SourceUrl,
      notes: 'Minimum known metres from imported E1000 result history, not the private Million Metres app total.',
    });
  }

  programs.push({
    id: `target-26-26-26-${swimmer.id}-${currentYear}`,
    swimmerId: swimmer.id,
    year: currentYear,
    title: 'Target 26-26-26',
    program: 'target-26-26-26',
    status: currentYearMetres > 0 ? 'Known E1000 progress' : 'No E1000 metres imported',
    completed: currentYearMetres,
    target: target26Metres,
    unit: 'm',
    metres: currentYearMetres,
    sourceName: 'MSA Endurance 1000',
    sourceUrl: e1000SourceUrl,
    notes: 'Uses 2026 E1000-recorded metres as a minimum towards the 26 x 2.6 km program.',
  });

  return [
    ...programs,
    ...achievementPrograms(existing).filter((program) => program.swimmerId === swimmer.id),
  ];
}

function rankingUrl(course, group, state) {
  const url = new URL('https://portal.msarc.org.au/ranking/ranking.php');
  url.searchParams.set('course', course);
  url.searchParams.set('display', 'best');
  url.searchParams.set('dist', 'All');
  url.searchParams.set('gender', 'Male');
  url.searchParams.set('group', group);
  url.searchParams.set('js', 'on');
  url.searchParams.set('state', state);
  url.searchParams.set('stroke', 'All - Top 10');
  url.searchParams.set('type', '0');
  url.searchParams.set('view', '0');
  url.searchParams.set('year', String(currentYear));
  return url;
}

function rankingRows(sectionHtml) {
  return [...sectionHtml.matchAll(/<tr>.*?<\/tr>/gis)]
    .map((match) => cells(match[0]))
    .filter((row) => row.length >= 8 && /^\d+$/.test(row[0]))
    .map((row) => ({
      place: Number(row[0]),
      name: row[1],
      time: row[7],
      seconds: seconds(row[7]),
      date: toIsoDate(row[5]),
      meet: row[6],
    }));
}

async function readCurrentRankings(swimmer) {
  const entries = [];
  const scopes = [
    { scope: 'Queensland', state: 'QLD', course: 'LC' },
    { scope: 'Queensland', state: 'QLD', course: 'SC' },
    { scope: 'Australia', state: 'All', course: 'LC' },
    { scope: 'Australia', state: 'All', course: 'SC' },
  ];

  for (const group of swimmer.rankingGroups) {
    for (const query of scopes) {
      const html = await fetchText(rankingUrl(query.course, group, query.state));
      const sections = html.split("<tr><td height='40' valign='middle' colspan='10' class='stroke'>").slice(1);

      for (const section of sections) {
        const eventMatch = section.match(/^(.*?)<\/td>/is);
        if (!eventMatch) {
          continue;
        }

        const event = stripHtml(eventMatch[1]).replace(' - ', ' ');
        const rows = rankingRows(section);
        const swimmerRow = rows.find((row) => row.name.toUpperCase() === swimmer.msaName);
        if (!swimmerRow) {
          continue;
        }

        const ahead = rows.find((row) => row.place === swimmerRow.place - 1);
        const gapSeconds = ahead?.seconds != null && swimmerRow.seconds != null
          ? Number((swimmerRow.seconds - ahead.seconds).toFixed(2))
          : undefined;

        entries.push({
          scope: query.scope,
          course: query.course,
          event,
          place: swimmerRow.place,
          time: swimmerRow.time,
          seconds: swimmerRow.seconds,
          meet: swimmerRow.meet,
          resultDate: swimmerRow.date,
          aheadName: ahead?.name,
          aheadTime: ahead?.time,
          gapSeconds,
        });
      }
    }
  }

  return entries;
}

async function main() {
  const existing = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  const now = new Date().toISOString();
  const years = Array.from({ length: currentYear - historyStartYear + 1 }, (_, index) => historyStartYear + index);
  const e1000Years = Array.from({ length: currentYear - e1000StartYear + 1 }, (_, index) => e1000StartYear + index);
  const competitions = [];
  const enduranceResults = [];
  const newSnapshots = [];

  for (const swimmer of swimmers) {
    for (const year of years) {
      competitions.push(...await readResultHistory(swimmer, year));
    }

    for (const year of e1000Years) {
      enduranceResults.push(...await readEnduranceHistory(swimmer, year));
    }

    const entries = await readCurrentRankings(swimmer);
    if (entries.length > 0) {
      const ageGroup = `Men ${swimmer.rankingGroups.at(-1)}`;
      newSnapshots.push({
        id: `${now.slice(0, 10)}-${swimmer.id}`,
        swimmerId: swimmer.id,
        checkedAt: now,
        ageGroup,
        source: 'Official MSARC ranking portal.',
        entries: entries.sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || `${a.scope} ${a.course} ${a.event}`.localeCompare(`${b.scope} ${b.course} ${b.event}`)),
      });
    }
  }

  const latestDate = now.slice(0, 10);
  const retainedSnapshots = existing.snapshots.filter((snapshot) => !snapshot.id.startsWith(latestDate));

  const updated = {
    ...existing,
    swimmers: swimmers.map((swimmer) => ({
      id: swimmer.id,
      name: swimmer.name,
      club: swimmer.club,
      ageGroups: [...new Set([
        ...competitions
          .filter((result) => result.swimmerId === swimmer.id)
          .map((result) => `Men ${result.ageGroup}`),
        ...swimmer.rankingGroups.map((group) => `Men ${group}`),
      ])].sort(),
    })),
    snapshots: [...retainedSnapshots, ...newSnapshots],
    competitions: competitions.sort((a, b) => a.swimmerId.localeCompare(b.swimmerId) || b.date.localeCompare(a.date) || a.event.localeCompare(b.event)),
    enduranceResults: enduranceResults.sort((a, b) => a.swimmerId.localeCompare(b.swimmerId) || b.date.localeCompare(a.date) || a.stroke.localeCompare(b.stroke)),
    endurancePrograms: swimmers.flatMap((swimmer) => endurancePrograms(swimmer, enduranceResults, existing)),
    updatedAt: now,
  };

  await fs.writeFile(dataPath, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`Updated ${competitions.length} result rows, ${enduranceResults.length} endurance rows, and ${newSnapshots.length} current ranking snapshots.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
