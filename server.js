const WebSocket = require('ws');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

console.log(`Cheerio-Powered Multi-Asset Proxy Engine active on port ${port}`);

// Downloads any background file type and packs it into a safe inline Data URL
async function getAsBase64(targetUrl) {
    try {
        const check = await axios.head(targetUrl);
        const contentType = check.headers['content-type'] || '';
        const contentLength = parseInt(check.headers['content-length'] || '0', 10);

        // Skip massive media formats over 6MB that choke browser rendering threads
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
                console.log(`Compiling structural tree framework for: ${data.url}`);
                
                const response = await axios.get(data.url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });
                
                // Initialize the structural virtual parser
                const $ = cheerio.load(response.data);
                const baseUrl = data.url;

                // 1. INLINE ALL STYLESHEETS: Pinpoint every single link style block seamlessly
                const cssPromises = [];
                $('link[rel="stylesheet"], link[href$=".css"]').each((i, el) => {
                    const href = $(el).attr('href');
                    if (href) {
                        try {
                            const absoluteUrl = new URL(href, baseUrl).href;
                            cssPromises.push(
                                getAsText(absoluteUrl).then(cssText => {
                                    $(el).replaceWith(`<style data-origin="${href}">${cssText}</style>`);
                                })
                            );
                        } catch (e) {}
                    }
                });
                await Promise.all(cssPromises);

                // Dispatch core layout instantly so the browser screen paints initial layout models
                ws.send(JSON.stringify({
                    type: 'STAGE_1_LAYOUT',
                    url: data.url,
                    html: $.html()
                }));

                console.log(`Gathering background dependencies & data matrices...`);

                // 2. INLINE ALL JAVASCRIPT: Capture all core internal and parameter script endpoints
                const scriptPromises = [];
                $('script[src]').each((i, el) => {
                    const src = $(el).attr('src');
                    if (src && !src.startsWith('data:')) {
                        try {
                            const absoluteUrl = new URL(src, baseUrl).href;
                            scriptPromises.push(
                                getAsText(absoluteUrl).then(jsText => {
                                    // Inject as a clean, literal text block to avoid syntax breaking
                                    $(el).replaceWith(`<script data-origin="${src}">${jsText}</script>`);
                                })
                            );
                        } catch (e) {}
                    }
                });
                await Promise.all(scriptPromises);

                // 3. UNIVERSAL ATTRIBUTE PARSER: Extract images, configurations, JSON blocks, SVGs, and web assets
                const assetPromises = [];
                $('*').each((i, el) => {
                    ['src', 'href', 'data-src'].forEach(attr => {
                        const val = $(el).attr(attr);
                        // Skip basic fragments or anchor jumps
                        if (val && !val.startsWith('data:') && !val.startsWith('javascript:') && !val.startsWith('#')) {
                            try {
                                const absoluteUrl = new URL(val, baseUrl).href;
                                assetPromises.push(
                                    getAsBase64(absoluteUrl).then(dataUrl => {
                                        if (dataUrl) $(el).attr(attr, dataUrl);
                                    })
                                );
                            } catch (e) {}
                        }
                    });
                });
                await Promise.all(assetPromises);

                // Stream the completely compiled self-contained bundle back to the client
                ws.send(JSON.stringify({
                    type: 'STAGE_2_ASSETS',
                    url: data.url,
                    html: $.html()
                }));
                
                console.log(`Universal bundle complete for ${data.url}`);
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Asset streaming execution timeout.' }));
        }
    });
});
 
