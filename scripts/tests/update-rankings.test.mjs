import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { updateRankings, validateHistory } from '../update-rankings.mjs';
import { validateSiteData } from '../validate-rankings.mjs';

const year = new Date().getFullYear();
const swimmer = { id: 'example', name: 'Example Swimmer', msaName: 'EXAMPLE SWIMMER', e1000Name: 'SWIMMER , EXAMPLE', club: 'Example', rankingGroups: ['50-54'] };
const form = '<h1>Individual Result History</h1><select name="year"></select><input name="name">';
const cells = (values) => values.map((value) => `<td>${value}</td>`).join('');
const result = `${form}<table><tr>${cells(['', '123', 'ABC', 'M', '50-54', 'LC', '400m', 'Freestyle', '5:00.00', '', '', '500', `1.01.${year}`, 'Example Pool'])}</tr></table>`;
const endurance = `${form}<table><tr>${cells(['123', 'ABC', 'M', '50-54', 'L', '400m', 'Freestyle', '005:00.00', '', '5', `1.01.${year}`, 'Example Pool'])}</tr></table>`;
const ranking = `<table><tr><td class="stroke" colspan="10">400m - Freestyle</td></tr><tr>${cells(['1', 'EXAMPLE SWIMMER', '51', 'ABC', 'QLD', `1.01.${year}`, 'Example Meet', '5:00.00'])}</tr></table>`;
const original = {
    swimmers: [swimmer],
    competitions: [{ swimmerId: swimmer.id, year }],
    enduranceResults: [{ swimmerId: swimmer.id, year }],
    snapshots: [],
    achievements: [{ id: 'award', swimmerId: swimmer.id, year: year - 1, title: '50x50', award: 'Gold', minimumMetres: 125000 }],
    updatedAt: 'unchanged',
};

async function withData(run) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'swimming-refresh-test-'));
    const outputPath = path.join(directory, 'rankings.json');
    const bytes = JSON.stringify(original);
    await fs.writeFile(outputPath, bytes);
    try {
        await run(outputPath, bytes, directory);
    } finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
}

test('rejects lost history for a single swimmer and year despite larger overall totals', () => {
    const old = [{ swimmerId: 'a', year: 2025 }, { swimmerId: 'a', year: 2026 }];
    const refreshed = [{ swimmerId: 'a', year: 2026 }, { swimmerId: 'a', year: 2026 }, { swimmerId: 'b', year: 2025 }];
    assert.throws(() => validateHistory(old, refreshed, 'a', 'result history'), /2025/);
});

test('rejects a blocked page without modifying the file or leaving a temporary file', async () => {
    await withData(async (outputPath, bytes, directory) => {
        let closed = false;
        const client = { read: async () => '<title>One moment, please...</title>', close: async () => { closed = true; } };
        await assert.rejects(updateRankings({ outputPath, client, configuredSwimmers: [swimmer], years: [year], e1000Years: [year] }), /browser check/i);
        assert.equal(await fs.readFile(outputPath, 'utf8'), bytes);
        assert.deepEqual(await fs.readdir(directory), ['rankings.json']);
        assert.equal(closed, true);
    });
});

test('rejects empty histories on otherwise valid pages without modifying the file', async () => {
    await withData(async (outputPath, bytes) => {
        const client = { read: async () => form, close: async () => {} };
        await assert.rejects(updateRankings({ outputPath, client, configuredSwimmers: [swimmer], years: [year], e1000Years: [year] }), /Incomplete result history/);
        assert.equal(await fs.readFile(outputPath, 'utf8'), bytes);
    });
});

test('rejects partial endurance data after successful result-history reads', async () => {
    await withData(async (outputPath, bytes) => {
        const client = { read: async (_, options) => options.kind === 'history' ? result : form, close: async () => {} };
        await assert.rejects(updateRankings({ outputPath, client, configuredSwimmers: [swimmer], years: [year], e1000Years: [year] }), /Incomplete endurance history/);
        assert.equal(await fs.readFile(outputPath, 'utf8'), bytes);
    });
});

test('rejects a ranking page with event headings but no parseable rows', async () => {
    await withData(async (outputPath, bytes) => {
        const html = { history: result, endurance, ranking: '<table><tr><td class="stroke">400m - Freestyle</td></tr></table>' };
        const client = { read: async (_, options) => html[options.kind], close: async () => {} };
        await assert.rejects(updateRankings({ outputPath, client, configuredSwimmers: [swimmer], years: [year], e1000Years: [year] }), /No ranking rows/);
        assert.equal(await fs.readFile(outputPath, 'utf8'), bytes);
    });
});

test('preserves existing data when a populated current ranking snapshot would become empty', async () => {
    await withData(async (outputPath) => {
        const baseline = { ...original, snapshots: [{ swimmerId: swimmer.id, checkedAt: `${year}-01-01T00:00:00Z`, entries: [{ place: 1 }] }] };
        const bytes = JSON.stringify(baseline);
        await fs.writeFile(outputPath, bytes);
        const html = { history: result, endurance, ranking: ranking.replace('EXAMPLE SWIMMER', 'OTHER SWIMMER') };
        const client = { read: async (_, options) => html[options.kind], close: async () => {} };
        await assert.rejects(updateRankings({ outputPath, client, configuredSwimmers: [swimmer], years: [year], e1000Years: [year] }), /Empty current rankings/);
        assert.equal(await fs.readFile(outputPath, 'utf8'), bytes);
    });
});

test('refreshes browser-normalised tables, derives endurance progress and preserves static awards', async () => {
    await withData(async (outputPath, _, directory) => {
        const html = { history: result, endurance, ranking };
        const client = { read: async (_, options) => html[options.kind], close: async () => {} };
        const updated = await updateRankings({ outputPath, client, configuredSwimmers: [swimmer], years: [year], e1000Years: [year] });
        assert.equal(updated.competitions[0].points, '500');
        assert.equal(updated.snapshots[0].entries.length, 4);
        assert.equal(updated.enduranceResults[0].result, '5:00.00');
        assert.equal(updated.endurancePrograms.find((p) => p.program === 'target-26-26-26').completed, 400);
        assert.deepEqual(updated.achievements, original.achievements);
        validateSiteData(updated, original);
        assert.deepEqual(JSON.parse(await fs.readFile(outputPath, 'utf8')), JSON.parse(JSON.stringify(updated)));
        assert.deepEqual(await fs.readdir(directory), ['rankings.json']);
    });
});

test('pre-publication validation rejects missing swimmers from a browser-collected dataset', () => {
    const baseline = { ...original, swimmers: [swimmer, { id: 'missing' }] };
    const updated = { ...original, endurancePrograms: [], updatedAt: `${year}-01-01T00:00:00Z` };
    assert.throws(() => validateSiteData(updated, baseline), /Missing swimmer missing/);
});

test('pre-publication validation rejects changed static achievements', () => {
    const updated = { ...original, achievements: [], endurancePrograms: [], updatedAt: `${year}-01-01T00:00:00Z` };
    assert.throws(() => validateSiteData(updated, original), /Static achievements/);
});
