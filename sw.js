const CACHE = 'noteforge-v26';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.json', './icon.svg', './fflate.umd.js', './marked.umd.js', './highlight.min.js', './katex.min.js', './katex.min.css',
    './fonts/KaTeX_AMS-Regular.woff2', './fonts/KaTeX_Caligraphic-Bold.woff2', './fonts/KaTeX_Caligraphic-Regular.woff2', './fonts/KaTeX_Fraktur-Bold.woff2', './fonts/KaTeX_Fraktur-Regular.woff2',
    './fonts/KaTeX_Main-Bold.woff2', './fonts/KaTeX_Main-BoldItalic.woff2', './fonts/KaTeX_Main-Italic.woff2', './fonts/KaTeX_Main-Regular.woff2', './fonts/KaTeX_Math-BoldItalic.woff2',
    './fonts/KaTeX_Math-Italic.woff2', './fonts/KaTeX_SansSerif-Bold.woff2', './fonts/KaTeX_SansSerif-Italic.woff2', './fonts/KaTeX_SansSerif-Regular.woff2', './fonts/KaTeX_Script-Regular.woff2',
    './fonts/KaTeX_Size1-Regular.woff2', './fonts/KaTeX_Size2-Regular.woff2', './fonts/KaTeX_Size3-Regular.woff2', './fonts/KaTeX_Size4-Regular.woff2', './fonts/KaTeX_Typewriter-Regular.woff2'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        caches.match(e.request).then((cached) => {
            const fetched = fetch(e.request).then((res) => {
                if (res && res.status === 200 && res.type === 'basic') {
                    const clone = res.clone();
                    caches.open(CACHE).then((c) => c.put(e.request, clone));
                }
                return res;
            }).catch(() => cached);
            return cached || fetched;
        })
    );
});