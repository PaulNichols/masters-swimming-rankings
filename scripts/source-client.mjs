import { chromium } from 'playwright';

const sourceHeaders = {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-AU,en;q=0.9',
    'user-agent': 'Mozilla/5.0 (compatible; masters-swimming-rankings-data-refresh/1.0)',
};
const browserTimeout = 45_000;

export function sourceProblem(html, kind) {
    if (!html.trim()) {
        return 'Empty source response';
    }
    if (/<title[^>]*>\s*(?:one moment|just a moment)|request is being verified|cf-chl-|captcha/iu.test(html)) {
        return 'Source returned a browser check instead of results';
    }
    if (kind === 'ranking') {
        if (!/<td\b[^>]*class=["']stroke["']/iu.test(html)) {
            return 'Missing expected ranking event tables';
        }
    } else if (!/Individual Result History/iu.test(html)
        || !/<select\b[^>]*name=["']year["']/iu.test(html)
        || !/<input\b[^>]*name=["']name["']/iu.test(html)) {
        return 'Missing expected result history page';
    }
    return undefined;
}

export function createSourceClient({ fetchImpl = fetch, browserLoader, log = console.warn } = {}) {
    let browser;
    let context;
    let useBrowser = false;
    const pages = new Map();

    async function waitForSource(page, kind) {
        try {
            await page.waitForFunction((sourceKind) => {
                if (/one moment|just a moment/i.test(document.title)
                    || /request is being verified/i.test(document.body?.textContent ?? '')) {
                    return false;
                }
                return sourceKind === 'ranking'
                    ? document.querySelector('td.stroke') !== null
                    : /Individual Result History/i.test(document.body?.textContent ?? '')
                        && document.querySelector('select[name="year"]') !== null
                        && document.querySelector('input[name="name"]') !== null;
            }, kind, { timeout: browserTimeout });
        } catch (error) {
            const title = await page.title();
            const preview = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 250);
            throw new Error(`Expected ${kind} page was not ready. Title: ${title}. Page: ${preview}`, { cause: error });
        }
    }

    async function loadInBrowser(url, { kind, body }) {
        if (!browser) {
            browser = await chromium.launch({
                headless: true,
                ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
            });
            context = await browser.newContext({ locale: 'en-AU' });
        }
        const origin = new URL(url).origin;
        let page = pages.get(origin);
        if (!page) {
            page = await context.newPage();
            page.setDefaultTimeout(browserTimeout);
            pages.set(origin, page);
        }

        await page.goto(String(url), { waitUntil: 'domcontentloaded', timeout: browserTimeout });
        await waitForSource(page, kind);
        if (body) {
            // E1000 reads POST fields; submitting its own form preserves the browser session.
            await page.locator('select[name="year"]').selectOption(body.year);
            await page.locator('input[name="name"]').fill(body.name);
            await page.locator('input[name="aussiid"]').fill(body.aussiid ?? '');
            await page.locator('input[name="Show"]').click();
            await waitForSource(page, kind);
        }
        return page.content();
    }

    return {
        async read(url, options) {
            if (!useBrowser) {
                let reason;
                try {
                    const response = await fetchImpl(url, {
                        headers: options.body
                            ? { ...sourceHeaders, 'content-type': 'application/x-www-form-urlencoded' }
                            : sourceHeaders,
                        ...(options.body ? { method: 'POST', body: new URLSearchParams(options.body) } : {}),
                        signal: AbortSignal.timeout(15_000),
                    });
                    const html = await response.text();
                    reason = response.ok ? sourceProblem(html, options.kind) : `HTTP ${response.status}`;
                    if (!reason) {
                        return html;
                    }
                } catch (error) {
                    reason = error.message;
                }
                log(`${reason}: ${url}. Switching to browser refresh.`);
                useBrowser = true;
            }

            let html;
            try {
                html = await (browserLoader ?? loadInBrowser)(url, options);
            } catch (error) {
                throw new Error(`Browser refresh failed for ${url}; existing data will not be replaced. ${error.message}`, { cause: error });
            }
            const problem = sourceProblem(html, options.kind);
            if (problem) {
                throw new Error(`${problem}: ${url}; existing data will not be replaced.`);
            }
            return html;
        },
        async close() {
            await browser?.close();
        },
    };
}
