/* ---------------------------------------------------------------------------
   4-7-8 breathing — service worker (offline support)

   Deliberately simple and update safe:
   - HTML: network first, so a deploy is visible immediately; the cached copy is
     only used when offline.
   - Everything else (CSS/JS/icons): cache first. Those URLs carry a ?v=<sha>
     from the deploy, so a new version is a new URL and can never be stale.
--------------------------------------------------------------------------- */
var CACHE = "breathe478-v1";
var OFFLINE_FALLBACK = "./";

self.addEventListener("install", function (event) {
  // Only the start page is precached. The assets carry a ?v=<sha> in the markup,
  // so caching them under their bare names here would just download them twice;
  // they land in the cache on the first controlled page load instead.
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.add(OFFLINE_FALLBACK); })
      .catch(function () { /* offline on first visit – fill the cache later */ })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return key === CACHE ? null : caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Store a response and drop older entries for the same file. Without this every
// deploy would leave its ?v=<sha> copies behind and the cache would grow forever.
function putAndPrune(req, res) {
  var path = new URL(req.url).pathname;
  caches.open(CACHE).then(function (cache) {
    cache.put(req, res);
    cache.keys().then(function (keys) {
      keys.forEach(function (key) {
        if (key.url !== req.url && new URL(key.url).pathname === path) cache.delete(key);
      });
    });
  });
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  var isHTML = req.mode === "navigate" ||
    (req.headers.get("accept") || "").indexOf("text/html") !== -1;

  if (isHTML) {
    event.respondWith(
      fetch(req).then(function (res) {
        putAndPrune(req, res.clone());
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match(OFFLINE_FALLBACK);
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === "basic") putAndPrune(req, res.clone());
        return res;
      });
    })
  );
});
