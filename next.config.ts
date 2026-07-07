import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  experimental: {
    // Cache client des pages dynamiques : revenir sur un onglet visité il y a
    // moins de 30 s est instantané (pas d'aller-retour serveur). Les server
    // actions purgent ce cache via revalidatePath, donc jamais de donnée
    // périmée après une mutation.
    staleTimes: { dynamic: 30 },
  },
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
  ],
};

export default nextConfig;
