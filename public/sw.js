const CACHE_NAME = "walkmaxxing-v1";
const APP_SHELL = ["/", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const cachePut = (req, copy) => {
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.put(req, copy))
        .catch(() => {})
    );
  };

  const offlineResponse = () => new Response("", { status: 504, statusText: "offline" });

  // network-first for API routes and navigations
  if (url.pathname.startsWith("/api/") || request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (request.mode === "navigate" && response.ok) {
            cachePut(request, response.clone());
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || (request.mode === "navigate" ? caches.match("/") : undefined))
            .then((cached) => cached || offlineResponse())
        )
    );
    return;
  }

  // stale-while-revalidate for static assets
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((response) => {
          if (response.ok) {
            cachePut(request, response.clone());
          }
          return response;
        })
        .catch(() => cached || offlineResponse());
      return cached || fetched;
    })
  );
});
