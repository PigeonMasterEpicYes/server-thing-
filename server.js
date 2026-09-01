const WebSocket = require('ws');
const axios = require('axios');
const { URL } = require('url');

const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

console.log(`Smart-Filtered Fast Proxy active on port ${port}`);

// Downloads assets safely, skipping massive media files that cause lag
async function getAsBase64(targetUrl) {
    try {
        // First, check the file size BEFORE downloading it
        const check = await axios.head(targetUrl);
        const contentType = check.headers['content-type'] || '';
        const contentLength = parseInt(check.headers['content-length'] || '0', 10);

        // SKIP RULE: If it's a large video/audio stream, skip it to prevent extreme lag
        if (contentType.includes('video') || contentType.includes('audio') || contentLength > 5000000) {
            console.log(`Skipped heavy media to prevent lag: ${targetUrl}`);
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
                console.log(`Streaming optimized layout for: ${data.url}`);
                
                const response = await axios.get(data.url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });
                let html = response.data;
                const baseUrl = data.url;

                // Inline stylesheets
                const hrefExtractRegex = /href=["']([^"']+)["']/;
                let cssMatches = html.match(/<link[^>]+>/g) || [];
                for (const matchTag of cssMatches) {
                    if (matchTag.includes('stylesheet') || matchTag.includes('.css')) {
                        const hrefMatch = matchTag.match(hrefExtractRegex);
                        if (hrefMatch && hrefMatch) {
                            try {
                                const absoluteUrl = new URL(hrefMatch, baseUrl).href;
                                const cssText = await getAsText(absoluteUrl);
                                html = html.replace(matchTag, () => `<style data-origin="${hrefMatch}">${cssText}</style>`);
                            } catch (err) {}
                        }
                    }
                }

                // Send Stage 1 layout immediately
                ws.send(JSON.stringify({
                    type: 'STAGE_1_LAYOUT',
                    url: data.url,
                    html: html
                }));

                console.log(`Extracting code, fonts, and graphics for: ${data.url}`);
                
                // Fetch JavaScript files
                const scriptRegex = /<script[^>]+src=["']([^"']+\.js[^"']*)["'][^>]*>\s*<\/script>/gi;
                let scriptMatch;
                let scriptMap = {};
                while ((scriptMatch = scriptRegex.exec(html)) !== null) {
                    try {
                        const absoluteUrl = new URL(scriptMatch, baseUrl).href;
                        const jsText = await getAsText(absoluteUrl);
                        scriptMap[scriptMatch] = `<script data-origin="${scriptMatch}">${jsText}</script>`;
                    } catch (e) {}
                }

                // SMART CATCH: Grabs images, vectors, json configurations, and fonts, but avoids heavy binary streams
                const universalAssetRegex = /(src|data-src|href)=["']([^"':#][^"']*)["']/gi;
                let assetMatch;
                let assetMap = {};
                
                while ((assetMatch = universalAssetRegex.exec(html)) !== null) {
                    const fullAttributeString = assetMatch[0];
                    const attributeName = assetMatch[1];
                    const rawAssetUrl = assetMatch[2];
                    
                    if (rawAssetUrl.startsWith('javascript:') || rawAssetUrl.startsWith('data:')) continue;

                    try {
                        const absoluteUrl = new URL(rawAssetUrl, baseUrl).href;
                        
                        if (rawAssetUrl.toLowerCase().includes('.json')) {
                            const jsonText = await getAsText(absoluteUrl);
                            if (jsonText) {
                                assetMap[fullAttributeString] = `data-json-payload="${absoluteUrl}" data-raw-string="${encodeURIComponent(jsonText)}"`;
                            }
                        } else {
                            const dataUrl = await getAsBase64(absoluteUrl);
                            if (dataUrl) {
                                assetMap[fullAttributeString] = `${attributeName}="${dataUrl}"`;
                            }
                        }
                    } catch (err) {}
                }

                // Stream safe asset blocks downstream without freezing the browser
                ws.send(JSON.stringify({
                    type: 'STAGE_2_ASSETS',
                    url: data.url,
                    scripts: scriptMap,
                    images: assetMap
                }));
                
                console.log(`Optimized compilation finished for ${data.url}`);
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Asset streaming error.' }));
        }
    });
});
