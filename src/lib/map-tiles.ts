// Gedeelde kaart-tileconfig (OSM/CARTO) — gebruikt door TrackingMap én
// PolygonEditor zodat tile-URL's en attributie op één plek staan.
export type TileStyle = "osm" | "carto";

export const TILE_STYLES: Record<
  TileStyle,
  { url: string; attribution: string; maxZoom: number; subdomains?: string }
> = {
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  },
  carto: {
    url: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${process.env.NEXT_PUBLIC_CARTO_KEY ?? ""}`,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 18,
    subdomains: "abcd",
  },
};
