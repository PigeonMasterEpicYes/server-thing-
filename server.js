const WebSocket = require('ws');
const axios = require('axios');
const { URL } = require('url');

const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

console.log(`Universal Progressive Asset Streaming Proxy active on port ${port}`);

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
        return typeof response.data === 'object' ? JSON.stringify(response.data) : response.data;
    } catch (e) { return ''; }
}

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'FETCH') {
                console.log(`Streaming core HTML/CSS for: ${data.url}`);
                
                // STAGE 1: Core Layout HTML Fetching
                const response = await axios.get(data.url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });
                let html = response.data;
                const baseUrl = data.url;

                // Inline All External Stylesheets (.css)
                const cssRegex = /<link[^>]+(?:rel=["']stylesheet["']|href=["']([^"']+\.css[^"']*)["'])[^>]*>/g;
                let cssMatch;
                // Use a secondary regex to cleanly grab href if the global capture is tricky
                const hrefExtractRegex = /href=["']([^"']+)["']/;
                
                let cssMatches = html.match(/<link[^>]+>/g) || [];
                for (const matchTag of cssMatches) {
                    if (matchTag.includes('stylesheet') || matchTag.includes('.css')) {
                        const hrefMatch = matchTag.match(hrefExtractRegex);
                        if (hrefMatch && hrefMatch[1]) {
                            try {
                                const absoluteUrl = new URL(hrefMatch[1], baseUrl).href;
                                const cssText = await getAsText(absoluteUrl);
                                // Using a lambda function wrapper prevents special character string injection bugs
                                html = html.replace(matchTag, () => `<style data-origin="${hrefMatch[1]}">${cssText}</style>`);
                            } catch (err) {}
                        }
                    }
                }

                // Dispatch layout layer immediately
                ws.send(JSON.stringify({
                    type: 'STAGE_1_LAYOUT',
                    url: data.url,
                    html: html
                }));

                // STAGE 2: Compile Background Scripts and Media Asset Maps
                console.log(`Compiling background logic blocks & multimedia for: ${data.url}`);
                
                // Process scripts safely using explicit index string keys
                const scriptRegex = /<script[^>]+src=["']([^"']+)["'][^>]*>\s*<\/script>/g;
                let scriptMatch;
                let scriptMap = {};
                while ((scriptMatch = scriptRegex.exec(html)) !== null) {
                    try {
                        const absoluteUrl = new URL(scriptMatch[1], baseUrl).href;
                        const jsText = await getAsText(absoluteUrl);
                        scriptMap[scriptMatch[0]] = `<script data-origin="${scriptMatch[1]}">${jsText}</script>`;
                    } catch (e) {}
                }

                // Process multimedia assets safely using explicit index string keys
                const imgRegex = /<img[^>]+src=["']([^"']+)["']/g;
                let imgMatch;
                let imageMap = {};
                while ((imgMatch = imgRegex.exec(html)) !== null) {
                    try {
                        const absoluteUrl = new URL(imgMatch[1], baseUrl).href;
                        const dataUrl = await getAsBase64(absoluteUrl);
                        if (dataUrl) imageMap[imgMatch[0]] = dataUrl;
                    } catch (err) {}
                }

                // Stream asset data bundles downstream
                ws.send(JSON.stringify({
                    type: 'STAGE_2_ASSETS',
                    url: data.url,
                    scripts: scriptMap,
                    images: imageMap
                }));
                
                console.log(`Finished comprehensive background compilation for ${data.url}`);
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Asset streaming error.' }));
        }
    });
});
