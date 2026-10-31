"use client";

// Polygon-tekenaar voor geofences — klik punten op de kaart om een gesloten zone te maken
// Kaarttiles: OpenStreetMap (geen API-key/externe dienst nodig)
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  CircleMarker,
  useMapEvents,
  useMap,
} from "react-leaflet";

type Props = {
  /** Bestaande polygon-coördinaten [[lat,lon],...] */
  initialCoords?: [number, number][];
  /** Callback bij wijziging */
  onChange?: (coords: [number, number][]) => void;
  /** Alleen bekijken (geen tekenen) */
  readOnly?: boolean;
};

/** Hulp: klik op kaart voegt punt toe; Escape wist laatste punt */
function DrawHandler({
  onAddPoint,
  onClear,
  readOnly,
}: {
  onAddPoint: (lat: number, lon: number) => void;
  onClear: () => void;
  readOnly: boolean;
}) {
  useMapEvents({
    click(e) {
      if (readOnly) return;
      onAddPoint(e.latlng.lat, e.latlng.lng);
    },
    keydown(e) {
      if (e.originalEvent.key === "Escape") onClear();
    },
  });

  // Kaart focusbaar maken voor toetsenbord
  const map = useMap();
  useEffect(() => {
    if (!readOnly) {
      map.getContainer().tabIndex = 0;
      map.getContainer().style.outline = "none";
    }
  }, [map, readOnly]);

  return null;
}

/** Toont de huidige teken-status boven de kaart */
function DrawInfo({
  pointCount,
  onUndo,
  onClear,
  readOnly,
}: {
  pointCount: number;
  onUndo: () => void;
  onClear: () => void;
  readOnly: boolean;
}) {
  if (readOnly) return null;
  return (
    <div className="absolute left-3 top-3 z-[10] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
      <p className="text-xs font-medium text-slate-700">
        {pointCount === 0 && "Klik op de kaart om punten te tekenen"}
        {pointCount === 1 && "1 punt · klik nogmaals voor het volgende"}
        {pointCount === 2 && "2 punten · nog minimaal 1 nodig voor polygon"}
        {pointCount >= 3 && (
          <>
            <span className="text-green-600">✓ Polygon gesloten</span> ({pointCount} punten)
          </>
        )}
      </p>
      {pointCount > 0 && (
        <div className="mt-1 flex gap-2">
          {pointCount > 0 && (
            <button
              onClick={onUndo}
              className="text-xs text-blue-600 hover:underline"
            >
              ↩ Ongedaan
            </button>
          )}
          {pointCount > 0 && (
            <button
              onClick={onClear}
              className="text-xs text-red-500 hover:underline"
            >
              🗑 Wissen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PolygonEditor({
  initialCoords,
  onChange,
  readOnly = false,
}: Props) {
  const [points, setPoints] = useState<[number, number][]>(initialCoords ?? []);

  const addPoint = useCallback(
    (lat: number, lon: number) => {
      if (readOnly) return;
      setPoints((prev) => {
        const next = [...prev, [lat, lon] as [number, number]];
        onChange?.(next);
        return next;
      });
    },
    [onChange, readOnly]
  );

  const undoPoint = useCallback(() => {
    setPoints((prev) => {
      const next = prev.slice(0, -1);
      onChange?.(next);
      return next;
    });
  }, [onChange]);

  const clearPoints = useCallback(() => {
    setPoints([]);
    onChange?.([]);
  }, [onChange]);

  // Centreer op eerste punt of default NL
  const center = useMemo<[number, number]>(() => {
    if (points.length > 0) return points[0];
    return [52.1, 6.1];
  }, [points]);

  // Polygon sluit automatisch vanaf 3 punten (Leaflet)
  const polygonPath = useMemo<[number, number][]>(() => points, [points]);

  return (
    <div className="relative h-[350px] overflow-hidden rounded-xl border border-slate-200 lg:h-[450px]">
      <DrawInfo
        pointCount={points.length}
        onUndo={undoPoint}
        onClear={clearPoints}
        readOnly={readOnly}
      />

      <MapContainer
        center={center}
        zoom={12}
        className="h-full w-full"
        style={{ background: "#e2e8f0" }}
        maxZoom={18}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={18}
        />

        <DrawHandler
          onAddPoint={addPoint}
          onClear={clearPoints}
          readOnly={readOnly}
        />

        {/* Polygon tonen */}
        {points.length >= 3 && (
          <Polygon
            positions={polygonPath}
            pathOptions={{
              color: "#2563eb",
              fillColor: "#2563eb",
              fillOpacity: 0.12,
              weight: 2,
            }}
          />
        )}

        {/* Lijnen tussen punten (ook bij <3) */}
        {points.length === 2 && (
          <Polygon
            positions={points}
            pathOptions={{ color: "#2563eb", weight: 2, fillOpacity: 0 }}
          />
        )}

        {/* Punten markeren */}
        {points.map((p, i) => (
          <CircleMarker
            key={i}
            center={p}
            radius={6}
            pathOptions={{
              color: "#ffffff",
              fillColor: i === 0 ? "#16a34a" : "#2563eb",
              fillOpacity: 1,
              weight: 2,
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
