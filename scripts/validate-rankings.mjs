import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { validateHistory } from './update-rankings.mjs';

export function validateSiteData(updated, baseline) {
    for (const key of ['swimmers', 'competitions', 'enduranceResults', 'endurancePrograms', 'snapshots', 'achievements']) {
        assert.ok(Array.isArray(updated[key]), `Missing ${key} array`);
    }
    assert.ok(!Number.isNaN(Date.parse(updated.updatedAt)), 'Invalid data refresh timestamp');
    assert.deepEqual(updated.achievements, baseline.achievements, 'Static achievements must be preserved');
    const year = new Date(updated.updatedAt).getUTCFullYear();
    for (const swimmer of baseline.swimmers) {
        assert.ok(updated.swimmers.some((value) => value.id === swimmer.id), `Missing swimmer ${swimmer.id}`);
    }
    for (const swimmer of updated.swimmers) {
        assert.ok(updated.competitions.some((row) => row.swimmerId === swimmer.id), `Empty results for ${swimmer.id}`);
        validateHistory(baseline.competitions, updated.competitions, swimmer.id, 'result history');
        validateHistory(baseline.enduranceResults, updated.enduranceResults, swimmer.id, 'endurance history');
        const endurance = updated.enduranceResults.filter((row) => row.swimmerId === swimmer.id);
        const total = endurance.reduce((sum, row) => sum + (row.metres ?? 0), 0);
        const current = endurance.filter((row) => row.year === year).reduce((sum, row) => sum + (row.metres ?? 0), 0);
        const programs = updated.endurancePrograms.filter((program) => program.swimmerId === swimmer.id);
        if (total > 0) {
            assert.equal(programs.find((program) => program.program === 'million-metres')?.completed, total, `Incorrect total metres for ${swimmer.id}`);
        }
        assert.equal(programs.find((program) => program.program === 'target-26-26-26' && program.year === year)?.completed, current, `Incorrect current-year metres for ${swimmer.id}`);
        const hadRankings = baseline.snapshots.some((snapshot) => snapshot.swimmerId === swimmer.id && snapshot.checkedAt.startsWith(String(year)) && snapshot.entries.length > 0);
        if (hadRankings) {
            assert.ok(updated.snapshots.some((snapshot) => snapshot.swimmerId === swimmer.id && snapshot.checkedAt === updated.updatedAt && snapshot.entries.length > 0), `Missing refreshed rankings for ${swimmer.id}`);
        }
    }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    try {
        const updated = JSON.parse(await fs.readFile(new URL('../public/data/rankings.json', import.meta.url), 'utf8'));
        const baseline = JSON.parse(execFileSync('git', ['show', 'HEAD:public/data/rankings.json'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
        validateSiteData(updated, baseline);
        console.log('Validated every swimmer, retained histories, refreshed snapshots, endurance totals and static achievements.');
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
