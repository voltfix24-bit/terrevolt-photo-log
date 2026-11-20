// Opruimwerker: verwijdert de oude offline-cache die een wit scherm kon geven.
function isWorkboxCacheForThisRegistration(name) {
  const hasWorkboxBucket = /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name);
  return hasWorkboxBucket && name.endsWith(self.registration.scope);
}
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        const own = names.filter((n) => isWorkboxCacheForThisRegistration(n) || n === "google-fonts-cache" || n === "supabase-images-cache");
        await Promise.allSettled(own.map((n) => caches.delete(n)));
        await self.clients.claim();
        const wins = await self.clients.matchAll({ type: "window" });
        await Promise.allSettled(wins.map((c) => c.navigate(c.url)));
      } finally {
        await self.registration.unregister();
      }
    })(),
  ),
);
