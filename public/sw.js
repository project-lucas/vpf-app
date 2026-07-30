/* Service worker VPF — notifications push + installabilité PWA + repli hors-ligne */

const OFFLINE_URL = "/offline";
const CACHE = "vpf-offline-v1";

self.addEventListener("install", (event) => {
  // met en cache la page de repli hors-ligne
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      // purge des anciens caches
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      ),
      self.clients.claim(),
    ])
  );
});

// Navigations : réseau d'abord, page hors-ligne en repli si offline
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.open(CACHE).then((c) => c.match(OFFLINE_URL)))
    );
  }
});

/**
 * Motifs de vibration (ms : vibre, pause, vibre…) selon la nature du message —
 * `kind` est posé par le serveur (src/lib/push.ts). Un message du coach et une
 * annonce du club se reconnaissent poche fermée, sans sortir le téléphone.
 *
 * Android/Chrome honore ce champ ; iOS ignore `vibrate` et applique le réglage
 * système de l'appareil. Un téléphone en silencieux ne vibre pas non plus.
 */
const VIBRATION_PATTERNS = {
  // deux impulsions rapprochées : « quelqu'un te parle »
  message: [90, 50, 90],
  // trois temps plus appuyés : info du club
  announcement: [160, 80, 160, 80, 160],
  // rappel de séance : un seul buzz, discret
  reminder: [140],
  // alerte santé au coach : long et insistant, ça ne s'ignore pas
  alert: [300, 120, 300, 120, 300],
};
const DEFAULT_VIBRATION = [140];

self.addEventListener("push", (event) => {
  let data = { title: "VPF", body: "", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // payload non JSON : notification générique
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      vibrate: VIBRATION_PATTERNS[data.kind] || DEFAULT_VIBRATION,
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
