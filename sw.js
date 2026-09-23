/* ---------------------------------------------------------------------------
   4-7-8 breathing — service worker (offline support)

   Deliberately simple and update safe:
   - Versioned files (CSS/JS, which the deploy stamps with ?v=<sha>): cache
     first. A new version is a new URL, so a cached copy can never be stale.
   - Everything else (HTML, manifest, icons): network first, so a deploy is
     visible immediately; the cached copy is only used when offline.
--------------------------------------------------------------------------- */
// v2 drops the v1 cache, which held unversioned icons and the manifest cache first
var CACHE = "breathe478-v2";
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

// Only complete, same-origin answers are worth keeping; a 404 or a server error
// must never become the offline copy of a page.
function cacheable(res) {
  return res && res.ok && res.type === "basic";
}

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

  if (url.searchParams.has("v")) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (cacheable(res)) putAndPrune(req, res.clone());
          return res;
        });
      })
    );
    return;
  }

  var isPage = req.mode === "navigate";
  event.respondWith(
    fetch(req).then(function (res) {
      if (cacheable(res)) putAndPrune(req, res.clone());
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || (isPage ? caches.match(OFFLINE_FALLBACK) : null);
      }).then(function (res) { return res || Response.error(); });
    })
  );
});
