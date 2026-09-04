const WebSocket = require('ws');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

console.log(`Pre-Rendering Object Compiler active on port ${port}`);

async function getAsBase64(targetUrl) {
    try {
        const check = await axios.head(targetUrl);
        const contentType = check.headers['content-type'] || '';
        const contentLength = parseInt(check.headers['content-length'] || '0', 10);

        if (contentType.includes('video') || contentType.includes('audio') || contentLength > 6000000) {
            return null;
        }

        const response = await axios.get(targetUrl, { responseType: 'arraybuffer' });
        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        return `data:${contentType};base64,${base64}`;
    } catch (e) { return null; }
}

async function getAsText(targetUrl) {
    try {
        const response = await axios.get(targetUrl);
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

                // 1. STAGE 1: Fetch the site layout
                const response = await axios.get(baseUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });
                
                let $ = cheerio.load(response.data);

                // FIX 1: Fix broken root paths before sending layout downstream
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

                // 2. STAGE 2: Deep compile assets and hijack API frameworks
                console.log(`Compiling dynamic background payloads...`);

                // Convert styles
                const cssPromises = [];
                $('link[rel="stylesheet"], link[href$=".css"]').each((i, el) => {
                    const href = $(el).attr('href');
                    if (href) {
                        cssPromises.push(
                            getAsText(href).then(cssText => {
                                $(el).replaceWith(`<style data-origin="${href}">${cssText}</style>`);
                            })
                        );
                    }
                });
                await Promise.all(cssPromises);

                // Convert structural scripts
                const scriptPromises = [];
                $('script[src]').each((i, el) => {
                    const src = $(el).attr('src');
                    if (src && !src.startsWith('data:')) {
                        scriptPromises.push(
                            getAsText(src).then(jsText => {
                                $(el).replaceWith(`<script data-origin="${src}">${jsText}</script>`);
                            })
                        );
                    }
                });
                await Promise.all(scriptPromises);

                // FIX 2: Intercept Scratch's API calls by pre-fetching the JSON metadata grid
                if (baseUrl.includes('scratch.mit.edu')) {
                    try {
                        console.log("Pre-fetching Scratch Featured Projects API array...");
                        const apiData = await getAsText('https://mit.edu');
                        
                        // Inject the API data directly into a background script block so Scratch reads it locally instead of making an online network call
                        $('head').prepend(`
                            <script>
                                const oldFetch = window.fetch;
                                window.fetch = async function(url, options) {
                                    if (url.includes('proxy/featured')) {
                                        return new Response('${apiData.replace(/'/g, "\\'")}', {
                                            status: 200,
                                            headers: { 'Content-Type': 'application/json' }
                                        });
                                    }
                                    return oldFetch(url, options);
                                };
                            </script>
                        `);
                    } catch (apiErr) { console.log("API Pre-fetch bypassed."); }
                }

                // Convert images and thumbnails
                const assetPromises = [];
                $('*').each((i, el) => {
                    ['src', 'href', 'data-src'].forEach(attr => {
                        const val = $(el).attr(attr);
                        if (val && !val.startsWith('data:') && !val.startsWith('javascript:') && !val.startsWith('#')) {
                            assetPromises.push(
                                getAsBase64(val).then(dataUrl => {
                                    if (dataUrl) $(el).attr(attr, dataUrl);
                                })
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
                
                console.log(`Universal snapshot compiled for ${baseUrl}`);
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Asset streaming error.' }));
        }
    });
});
