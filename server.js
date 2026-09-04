const WebSocket = require('ws');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

console.log(`Identity-Masking Pre-Rendering Engine active on port ${port}`);

async function getAsBase64(targetUrl) {
    try {
        const check = await axios.head(targetUrl);
        const contentType = check.headers['content-type'] || '';
        const contentLength = parseInt(check.headers['content-length'] || '0', 10);

        if (contentType.includes('video') || contentType.includes('audio') || contentLength > 10000000) {
            return null;
        }

        // Pass fake identity headers to sub-assets too so they don't block downloads
        const response = await axios.get(targetUrl, { 
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });
        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        return `data:${contentType};base64,${base64}`;
    } catch (e) { return null; }
}

async function getAsText(targetUrl) {
    try {
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        return typeof response.data === 'object' ? JSON.stringify(response.data) : response.data;
    } catch (e) { return ''; }
}

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'FETCH') {
                console.log(`Compiling structural tree framework for: ${data.url}`);
                const baseUrl = data.url;
                const domainOrigin = new URL(baseUrl).origin;

                // STAGE 1: Fetch core HTML using a fake Chromebook identity browser profile
                const response = await axios.get(baseUrl, {
                    headers: { 
                        'User-Agent': 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                        'Upgrade-Insecure-Requests': '1'
                    }
                });
                
                let $ = cheerio.load(response.data);

                // Fix absolute paths cleanly across attributes
                $('link, script, img, a').each((i, el) => {
                    ['src', 'href', 'data-src'].forEach(attr => {
                        let val = $(el).attr(attr);
                        if (val) {
                            if (val.startsWith('//')) $(el).attr(attr, 'https:' + val);
                            else if (val.startsWith('/') && !val.startsWith('//')) $(el).attr(attr, domainOrigin + val);
                        }
                    });
                });

                // Stream layout framework instantly
                ws.send(JSON.stringify({
                    type: 'STAGE_1_LAYOUT',
                    url: baseUrl,
                    html: $.html()
                }));

                console.log(`Gathering background dependencies & data matrices...`);

                // Inline stylesheets
                const cssPromises = [];
                $('link[rel="stylesheet"], link[href$=".css"]').each((i, el) => {
                    const href = $(el).attr('href');
                    if (href) {
                        cssPromises.push(
                            getAsText(href).then(cssText => {
                                if (cssText) $(el).replaceWith(`<style data-origin="${href}">${cssText}</style>`);
                            }).catch(() => {})
                        );
                    }
                });
                await Promise.all(cssPromises);

                // Inline javascript frameworks
                const scriptPromises = [];
                $('script[src]').each((i, el) => {
                    const src = $(el).attr('src');
                    if (src && !src.startsWith('data:')) {
                        scriptPromises.push(
                            getAsText(src).then(jsText => {
                                if (jsText) $(el).replaceWith(`<script data-origin="${src}">${jsText}</script>`);
                            }).catch(() => {})
                        );
                    }
                });
                await Promise.all(scriptPromises);

                // Hijack Scratch telemetry frameworks natively
                if (baseUrl.includes('scratch.mit.edu')) {
                    try {
                        console.log("Pre-fetching Scratch Featured Projects API array safely...");
                        const rawApiData = await getAsText('https://mit.edu');
                        
                        if (rawApiData) {
                            const escapedApiData = rawApiData
                                .replace(/\\/g, '\\\\')
                                .replace(/`/g, '\\`')
                                .replace(/\$/g, '\\$')
                                .replace(/\n/g, ' ')
                                .replace(/\r/g, ' ');

                            $('head').prepend(`
                                <script>
                                    (function() {
                                        const oldFetch = window.fetch;
                                        window.fetch = async function(url, options) {
                                            if (typeof url === 'string' && url.includes('proxy/featured')) {
                                                return new Response(\`${escapedApiData}\`, {
                                                    status: 200,
                                                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
                                                });
                                            }
                                            return oldFetch(url, options);
                                        };
                                    })();
                                </script>
                            `);
                        }
                    } catch (apiErr) { console.log("API Pre-fetch bypassed safely."); }
                }

                // Inline standard background multimedia layout assets
                const assetPromises = [];
                $('*').each((i, el) => {
                    ['src', 'href', 'data-src'].forEach(attr => {
                        const val = $(el).attr(attr);
                        if (val && !val.startsWith('data:') && !val.startsWith('javascript:') && !val.startsWith('#')) {
                            assetPromises.push(
                                getAsBase64(val).then(dataUrl => {
                                    if (dataUrl) $(el).attr(attr, dataUrl);
                                }).catch(() => {})
                            );
                        }
                    });
                });
                await Promise.all(assetPromises);

                ws.send(JSON.stringify({
                    type: 'STAGE_2_ASSETS',
                    url: baseUrl,
                    html: $.html()
                }));
                
                console.log(`Universal snapshot compiled cleanly for ${baseUrl}`);
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Asset streaming error.' }));
        }
    });
});
