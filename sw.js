const CACHE='acr-utility-v0-7';
const ASSETS=['./','./index.html','./styles.css','./app.js','./api_tally.js','./api_ui.js','./acr_fields.js','./sessions.js','./last_year_ui.js','./docx_engine.js','./vendor/jszip.min.js','./ACR_EMPLOYEE_MASTER.docx','./firebase-config.js','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(resp=>{const clone=resp.clone();caches.open(CACHE).then(c=>c.put(event.request,clone));return resp;}).catch(()=>caches.match('./index.html'))));});
