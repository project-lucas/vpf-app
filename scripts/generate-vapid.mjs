// Génère une paire de clés VAPID pour les notifications push.
// Usage : npm run vapid — puis copier les valeurs dans .env.local (et Vercel).
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("Ajoute ces lignes à ton .env.local :\n");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
