import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createSourceClient } from '../source-client.mjs';

test('real browser completes a JavaScript check and submits endurance history by POST', async () => {
    const received = [];
    const server = http.createServer(async (request, response) => {
        response.setHeader('content-type', 'text/html');
        if (!request.headers.cookie?.includes('verified=yes')) {
            response.end('<title>One moment, please...</title><p>Please wait while your request is being verified...</p><script>document.cookie="verified=yes; path=/"; location.reload();</script>');
            return;
        }
        let body = '';
        for await (const chunk of request) body += chunk;
        received.push({ method: request.method, body });
        response.end('<title>Results</title><h1>Individual Result History</h1><form method="post"><select name="year"><option value="2026">2026</option></select><input name="name"><input name="aussiid"><input type="submit" name="Show" value="Show"></form><table><tr><td>Verified results</td></tr></table>');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const client = createSourceClient({ log: () => {} });
    try {
        const html = await client.read(`http://127.0.0.1:${server.address().port}/results`, {
            kind: 'endurance', body: { year: '2026', name: 'EXAMPLE', aussiid: '', Show: 'Show' },
        });
        assert.match(html, /Verified results/);
        const post = received.find((request) => request.method === 'POST');
        assert.equal(new URLSearchParams(post.body).get('name'), 'EXAMPLE');
        assert.equal(new URLSearchParams(post.body).get('year'), '2026');
    } finally {
        await client.close();
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
});
