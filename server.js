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
        return `data:${contentType};base64,base64`;
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

                // Dispatch core layout instantly
                ws.send(JSON.stringify({
                    type: 'STAGE_1_LAYOUT',
                    url: data.url,
                    html: html
                }));

                // STAGE 2: Compile Background Scripts, Data Configurations, and Multimedia
                console.log(`Compiling expanded data payloads & multimedia for: ${data.url}`);
                
                // Process scripts safely using explicit key matching
                const scriptRegex = /<script[^>]+src=["']([^"']+)["'][^>]*>\s*<\/script>/g;
                let scriptMatch;
                let scriptMap = {};
                while ((scriptMatch = scriptRegex.exec(html)) !== null) {
                    try {
                        const absoluteUrl = new URL(scriptMatch, baseUrl).href;
                        const jsText = await getAsText(absoluteUrl);
                        scriptMap[scriptMatch] = `<script data-origin="${scriptMatch}">${jsText}</script>`;
                    } catch (e) {}
                }

                // EXPANDED TARGETS: Capture src/href attributes ending in .png, .jpg, .jpeg, .gif, .svg, .webp, or .json
                const assetTargetRegex = /(src|data-src|href)=["']([^"']+\.(?:png|jpg|jpeg|gif|svg|webp|json)[^"']*)["']/gi;
                let assetMatch;
                let assetMap = {};
                
                while ((assetMatch = assetTargetRegex.exec(html)) !== null) {
                    const fullAttributeString = assetMatch; 
                    const attributeName = assetMatch;       
                    const rawAssetUrl = assetMatch;         
                    
                    try {
                        const absoluteUrl = new URL(rawAssetUrl, baseUrl).href;
                        
                        // Handle data JSON architectures as raw text injection templates
                        if (rawAssetUrl.toLowerCase().includes('.json')) {
                            const jsonText = await getAsText(absoluteUrl);
                            if (jsonText) {
                                // Inject raw data configurations into inline template blocks
                                assetMap[fullAttributeString] = `data-json-payload="${absoluteUrl}" data-raw-string="${encodeURIComponent(jsonText)}"`;
                            }
                        } else {
                            // Handle standard images, vectors (.svg), and raster matrices (.webp) via Base64 binary packets
                            const dataUrl = await getAsBase64(absoluteUrl);
                            if (dataUrl) {
                                assetMap[fullAttributeString] = `${attributeName}="${dataUrl}"`;
                            }
                        }
                    } catch (err) {}
                }

                // Stream expanded asset data bundles downstream
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
