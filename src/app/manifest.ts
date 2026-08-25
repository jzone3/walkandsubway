import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "walkmaxxing",
    short_name: "walkmaxxing",
    description: "NYC transit routing where you pick the walking/transfer tradeoff",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#fafafa",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
