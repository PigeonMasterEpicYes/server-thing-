const WebSocket = require('ws');
const axios = require('axios');
const { URL } = require('url');

const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

console.log(`Progressive Streaming Proxy active on port ${port}`);

async function getAsBase64(targetUrl) {
    try {
        const response = await axios.get(targetUrl, { responseType: 'arraybuffer' });
        const contentType = response.headers['content-type'];
        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        return `data:${contentType};base64,${base64}`;
    } catch (e) { return null; }
}

async function getAsText(targetUrl) {
    try {
        const response = await axios.get(targetUrl);
        return response.data;
    } catch (e) { return ''; }
}

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'FETCH') {
                console.log(`Streaming initial page shell for: ${data.url}`);
                
                // 1. STAGE 1: Grab the core HTML immediately
                const response = await axios.get(data.url);
                let html = response.data;
                const baseUrl = data.url;

                // 2. STAGE 2: Instantly find and inline CSS so layout renders correctly
                const cssRegex = /<link[^>]+(?:rel=["']stylesheet["']|href=["'][^"']+\.css[^"']*["'])[^>]*>/g;
                const hrefExtractRegex = /href=["']([^"']+)["']/;
                let cssMatches = html.match(cssRegex) || [];
                
                for (const matchTag of cssMatches) {
                    const hrefMatch = matchTag.match(hrefExtractRegex);
                    if (hrefMatch) {
                        const originalHref = hrefMatch[1];
                        try {
                            const absoluteUrl = new URL(originalHref, baseUrl).href;
                            const cssText = await getAsText(absoluteUrl);
                            html = html.replace(matchTag, `<style data-origin="${originalHref}">${cssText}</style>`);
                        } catch (err) {}
                    }
                }

                // Send the layout structure right now so the user see the page instantly
                ws.send(JSON.stringify({
                    type: 'STAGE_1_LAYOUT',
                    url: data.url,
                    html: html
                }));

                // 3. STAGE 3: Heavy lifting assets stream in the background
                console.log(`Background compiling assets for: ${data.url}`);
                const imgRegex = /<img[^>]+src=["']([^"']+)["']/g;
                let imgMatch;
                let imageMap = {};

                while ((imgMatch = imgRegex.exec(html)) !== null) {
                    const originalSrc = imgMatch[1];
                    try {
                        const absoluteUrl = new URL(originalSrc, baseUrl).href;
                        const dataUrl = await getAsBase64(absoluteUrl);
                        if (dataUrl) {
                            imageMap[originalSrc] = dataUrl;
                        }
                    } catch (err) {}
                }

                // Send the collected images as a separate asset bundle chunk
                ws.send(JSON.stringify({
                    type: 'STAGE_2_ASSETS',
                    url: data.url,
                    images: imageMap
                }));
                
                console.log(`Stream complete for ${data.url}`);
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Streaming engine encountered a source block.' }));
        }
    });
});
