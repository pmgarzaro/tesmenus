import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tes menus",
    short_name: "Tes menus",
    description: "Recettes, planning, courses et batch cooking du foyer",
    start_url: "/recettes",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#ea580c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Android: "Partager → Tes menus" from a recipe page opens the URL import.
    share_target: {
      action: "/recettes/importer/url",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  } as MetadataRoute.Manifest;
}
