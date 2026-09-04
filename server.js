const WebSocket = require('ws');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

console.log(`Pre-Rendering Isolated Object Compiler active on port ${port}`);

async function getAsBase64(targetUrl) {
    try {
        const check = await axios.head(targetUrl, { timeout: 3000 });
        const contentType = check.headers['content-type'] || '';
        const contentLength = parseInt(check.headers['content-length'] || '0', 10);

        if (contentType.includes('video') || contentType.includes('audio') || contentLength > 6000000) {
            return null;
        }

        const response = await axios.get(targetUrl, { responseType: 'arraybuffer', timeout: 5000 });
        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        return `data:${contentType};base64,${base64}`;
    } catch (e) { return null; }
}

async function getAsText(targetUrl) {
    try {
        const response = await axios.get(targetUrl, { timeout: 5000 });
        return typeof response.data === 'object' ? JSON.stringify(response.data) : response.data;
    } catch (e) { return ''; }
}

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'FETCH') {
                console.log(`Pre-rendering tree nodes for: ${data.url}`);
                const baseUrl = data.url;
                const domainOrigin = new URL(baseUrl).origin;

                // STAGE 1: Fetch the site layout with customized desktop headers
                const response = await axios.get(baseUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    timeout: 8000
                });
                
                // FIXED: Explicit localized instantiation isolates instance memory completely per request
                const $ = cheerio.load(response.data);

                // Fix broken relative layout paths cleanly across core structural selectors
                $('link, script, img, a').each((i, el) => {
                    ['src', 'href', 'data-src'].forEach(attr => {
                        let val = $(el).attr(attr);
                        if (val) {
                            if (val.startsWith('//')) $(el).attr(attr, 'https:' + val);
                            else if (val.startsWith('/') && !val.startsWith('//')) $(el).attr(attr, domainOrigin + val);
                        }
                    });
                });

                ws.send(JSON.stringify({
                    type: 'STAGE_1_LAYOUT',
                    url: baseUrl,
                    html: $.html()
                }));

                console.log(`Compiling dynamic background payloads asynchronously...`);

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

                // Inline structural script libraries
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

                // API HIJACK INJECTION LAYER: Intercept Scratch API calls natively
                if (baseUrl.includes('scratch.mit.edu')) {
                    try {
                        console.log("Pre-fetching Scratch Featured Projects API array safely...");
                        const rawApiData = await getAsText('https://mit.edu');
                        
                        if (rawApiData) {
                            // FIXED SANITIZATION: Escaping template strings protects frame logic compilers
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

                // Inline standard graphics, raster files, and dynamic vector elements (.svg)
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

                // Stream finalized un-contaminated standalone bundle downstream
                ws.send(JSON.stringify({
                    type: 'STAGE_2_ASSETS',
                    url: baseUrl,
                    html: $.html()
                }));
                
                console.log(`Universal snapshot compiled cleanly for ${baseUrl}`);
            }
        } catch (err) {
            console.error(err);
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Asset streaming execution timeout.' }));
        }
    });
});
