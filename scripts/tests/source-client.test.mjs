import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceClient, sourceProblem } from '../source-client.mjs';

const historyHtml = '<title>Results</title><h1>Individual Result History</h1><select name="year"></select><input name="name">';
const challengeHtml = '<title>One moment, please...</title><p>Please wait while your request is being verified...</p>';

test('rejects an HTTP-200 browser check as source data', () => {
    assert.match(sourceProblem(challengeHtml, 'history'), /browser check/i);
});

test('rejects an unrelated HTML page even when it contains a table', () => {
    assert.match(sourceProblem('<title>Maintenance</title><table></table>', 'history'), /expected/i);
});

test('accepts a valid history form with no results for an inactive year', () => {
    assert.equal(sourceProblem(historyHtml, 'history'), undefined);
});

test('switches to the browser after a challenge and reuses it for subsequent requests', async () => {
    let httpCalls = 0;
    const browserRequests = [];
    const client = createSourceClient({
        fetchImpl: async () => {
            httpCalls++;
            return new Response(challengeHtml);
        },
        browserLoader: async (url, options) => {
            browserRequests.push({ url, options });
            return historyHtml;
        },
        log: () => {},
    });
    try {
        assert.equal(await client.read('https://example.test/history', { kind: 'history' }), historyHtml);
        await client.read('https://example.test/endurance', { kind: 'endurance', body: { year: '2026', name: 'Example' } });
        assert.equal(httpCalls, 1);
        assert.equal(browserRequests.length, 2);
        assert.deepEqual(browserRequests[1].options.body, { year: '2026', name: 'Example' });
    } finally {
        await client.close();
    }
});

test('fails if the browser also returns a challenge', async () => {
    const client = createSourceClient({
        fetchImpl: async () => new Response(challengeHtml),
        browserLoader: async () => challengeHtml,
        log: () => {},
    });
    try {
        await assert.rejects(client.read('https://example.test/history', { kind: 'history' }), /browser check/i);
    } finally {
        await client.close();
    }
});
