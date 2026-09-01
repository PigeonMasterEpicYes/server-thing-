const WebSocket = require('ws');
const axios = require('axios');
const { URL } = require('url');

const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

console.log(`Universal All-Asset Streaming Proxy active on port ${port}`);

// Downloads any file type and converts it into a universally readable Base64 Data URL
async function getAsBase64(targetUrl) {
    try {
        const response = await axios.get(targetUrl, { responseType: 'arraybuffer' });
        const contentType = response.headers['content-type'] || 'application/octet-stream';
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
                console.log(`Streaming universal page core for: ${data.url}`);
                
                // Fetch the main HTML file
                const response = await axios.get(data.url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });
                let html = response.data;
                const baseUrl = data.url;

                // 1. Inline all Link Stylesheets (.css) safely
                const hrefExtractRegex = /href=["']([^"']+)["']/;
                let cssMatches = html.match(/<link[^>]+>/g) || [];
                for (const matchTag of cssMatches) {
                    if (matchTag.includes('stylesheet') || matchTag.includes('.css')) {
                        const hrefMatch = matchTag.match(hrefExtractRegex);
                        if (hrefMatch && hrefMatch[1]) {
                            try {
                                const absoluteUrl = new URL(hrefMatch[1], baseUrl).href;
                                const cssText = await getAsText(absoluteUrl);
                                html = html.replace(matchTag, () => `<style data-origin="${hrefMatch[1]}">${cssText}</style>`);
                            } catch (err) {}
                        }
                    }
                }

                // Send the structural layout immediately so the page displays instantly
                ws.send(JSON.stringify({
                    type: 'STAGE_1_LAYOUT',
                    url: data.url,
                    html: html
                }));

                console.log(`Deep extracting all nested assets for: ${data.url}`);
                
                // 2. Fetch external script files (.js)
                const scriptRegex = /<script[^>]+src=["']([^"']+\.js[^"']*)["'][^>]*>\s*<\/script>/gi;
                let scriptMatch;
                let scriptMap = {};
                while ((scriptMatch = scriptRegex.exec(html)) !== null) {
                    try {
                        const absoluteUrl = new URL(scriptMatch[1], baseUrl).href;
                        const jsText = await getAsText(absoluteUrl);
                        scriptMap[scriptMatch[0]] = `<script data-origin="${scriptMatch[1]}">${jsText}</script>`;
                    } catch (e) {}
                }

                // 3. UNIVERSAL PARSER: Capture ANY src, data-src, or href attribute regardless of file extension
                // This targets videos, sounds, json, fonts, svg, pdfs, zips, or any unknown file types
                const universalAssetRegex = /(src|data-src|href)=["']([^"':#][^"']*)["']/gi;
                let assetMatch;
                let assetMap = {};
                
                while ((assetMatch = universalAssetRegex.exec(html)) !== null) {
                    const fullAttributeString = assetMatch[0]; // e.g., src="music.mp3"
                    const attributeName = assetMatch[1];       // e.g., src
                    const rawAssetUrl = assetMatch[2];         // e.g., music.mp3
                    
                    // Skip basic fragment identifiers or inline scripts
                    if (rawAssetUrl.startsWith('javascript:') || rawAssetUrl.startsWith('data:')) continue;

                    try {
                        const absoluteUrl = new URL(rawAssetUrl, baseUrl).href;
                        const dataUrl = await getAsBase64(absoluteUrl);
                        if (dataUrl) {
                            // Turn the original asset attribute into a universal inline text stream binary
                            assetMap[fullAttributeString] = `${attributeName}="${dataUrl}"`;
                        }
                    } catch (err) {}
                }

                // Stream all bundled scripts and universal binary blocks downstream
                ws.send(JSON.stringify({
                    type: 'STAGE_2_ASSETS',
                    url: data.url,
                    scripts: scriptMap,
                    images: assetMap
                }));
                
                console.log(`Finished comprehensive multi-asset compilation for ${data.url}`);
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Asset streaming error.' }));
        }
    });
});
