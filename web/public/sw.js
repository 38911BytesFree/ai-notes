// Minimal service worker to satisfy Android PWA installation requirements.
// Per AI Notes project architectural constraints, this worker does NOT cache responses.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Empty fetch listener: all requests pass directly to the network.
});
