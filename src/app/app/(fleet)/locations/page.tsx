"use client";

// Locaties & Routes — beheermodule voor beheerde locaties, routes en import
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import MapFilterControl from "@/components/map-filters";
import {
  useMapFilters,
  applyLocationFilters,
  type AvailableLayers,
} from "@/lib/map-filters";
import { parseGeofences } from "@/lib/map-data";
import { ErrorBanner } from "@/components/ui";
import type {
  MapZone,
  MapLocation,
  RouteVisualization,
  RouteLinePoint,
  SelectionMarker,
} from "@/components/tracking-map";

const TrackingMap = dynamic(() => import("@/components/tracking-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[380px] items-center justify-center rounded-xl bg-slate-100 text-slate-400">
      Kaart laden…
    </div>
  ),
});

// ─── Types ───

type ManagedLocation = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  geocodeProvider: string | null;
  geocodeLabel: string | null;
  type: "permanent" | "temporary";
  startsAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  color: string | null;
  deletedAt: string | null;
  isExpired: boolean;
  updatedAt: string;
};

type RoutePoint = {
  locationId: string | null;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
};

type RouteRow = {
  id: string;
  name: string;
  description: string | null;
  points: ({ id: string; orderIndex: number } & RoutePoint)[];
  updatedAt: string;
};

type GeocodeCandidate = {
  label: string;
  latitude: number;
  longitude: number;
  provider: string;
};

type ImportRow = {
  line: number;
  name: string | null;
  address: string;
  type: "permanent" | "temporary" | null;
  expiresAt: string | null;
  notes: string | null;
  status: "ok" | "duplicate" | "unresolved" | "geocoded";
  latitude?: number;
  longitude?: number;
  geocodeProvider?: string;
  geocodeLabel?: string;
  candidates?: GeocodeCandidate[];
};

const EMPTY_FORM = {
  name: "",
  address: "",
  type: "permanent" as "permanent" | "temporary",
  startsAt: "",
  expiresAt: "",
  notes: "",
};

// useSearchParams vereist een Suspense-boundary voor prerender (Next.js);
// zonder deze wrapper faalt de productiebuild met een CSR-bailout-waarschuwing.
function LocationsPageContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"locaties" | "routes" | "import">("locaties");

  // ── Kaartfilters (pagina-scoped) ──
  // vehicles: false — deze pagina laadt geen voertuigposities; een toggle
  // zou een dood knopje zijn (de vorige versie had die wél aangeboden).
  const available: AvailableLayers = {
    vehicles: false,
    zones: true,
    locationsPermanent: true,
    locationsTemporary: true,
    locationsExpired: true,
    route: tab === "routes",
  };
  const { state: filterState, visible, toggle } = useMapFilters(
    { locationsExpired: false },
    available
  );

  // ── Data ──
  const [locations, setLocations] = useState<ManagedLocation[]>([]);
  const [statusFilter, setStatusFilter] = useState<
    "active" | "expired" | "all" | "deleted"
  >("active");
  const [typeFilter, setTypeFilter] = useState<"" | "permanent" | "temporary">("");
  const [search, setSearch] = useState("");
  // Debounce: zonder dit werd er per toetsaanslag een nieuwe API-call gemaakt.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [zones, setZones] = useState<MapZone[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);

  // ── Locatie-formulier ──
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formCoords, setFormCoords] = useState<{
    latitude: number;
    longitude: number;
    geocodeProvider: string;
    geocodeLabel: string | null;
  } | null>(null);
  const [geoQuery, setGeoQuery] = useState("");
  const [geoResults, setGeoResults] = useState<GeocodeCandidate[]>([]);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ── Route-editor ──
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [routeForm, setRouteForm] = useState<{ name: string; description: string }>({
    name: "",
    description: "",
  });
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [routeRoad, setRouteRoad] = useState<RouteVisualization["roadRoute"]>(null);
  const [routeRoadInfo, setRouteRoadInfo] = useState<
    { distanceKm: number; durationMin: number } | null
  >(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [addLocationPick, setAddLocationPick] = useState("");

  // ── Import ──
  const [importText, setImportText] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [importErrors, setImportErrors] = useState<
    { line: number; message: string; raw: string }[]
  >([]);
  const [importSummary, setImportSummary] = useState<Record<string, number> | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Kaartselectie (zoekopdracht → opslaan) ──
  const pendingSelectionRef = useRef<SelectionMarker | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const loadLocations = useCallback(async () => {
    const params = new URLSearchParams({ status: statusFilter });
    if (typeFilter) params.set("type", typeFilter);
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
    const res = await fetch(`/api/locations?${params}`);
    if (res.ok) {
      const d = await res.json();
      setLocations(d.locations);
    }
  }, [statusFilter, typeFilter, debouncedSearch]);

  const loadAll = useCallback(async () => {
    const [zRes, rRes] = await Promise.all([
      fetch("/api/geofences"),
      fetch("/api/routes"),
    ]);
    if (zRes.ok) {
      const d = await zRes.json();
      // Gedeelde parser: veilige per-row JSON.parse (corrupte rijen worden
      // overgeslagen in plaats van de hele load te laten falen).
      setZones(parseGeofences(d.geofences));
    }
    if (rRes.ok) {
      const d = await rRes.json();
      setRoutes(d.routes);
    }
  }, []);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Query-params voor selectie vanaf andere pagina's (?selLat&selLon&selLabel)
  useEffect(() => {
    const lat = searchParams.get("selLat");
    const lon = searchParams.get("selLon");
    const label = searchParams.get("selLabel");
    if (lat && lon) {
      const pos: [number, number] = [Number(lat), Number(lon)];
      if (!Number.isNaN(pos[0]) && !Number.isNaN(pos[1])) {
        pendingSelectionRef.current = { pos, label: label ?? "Selectie" };
        setTab("locaties");
        openCreateForm();
      }
    }
  }, [searchParams]);

  function openCreateForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormCoords(null);
    setGeoQuery("");
    setGeoResults([]);
    setGeoError(null);
    setError(null);
    setShowForm(true);
    // Selectie van kaart overnemen
    const sel = pendingSelectionRef.current;
    if (sel) {
      setForm((f) => ({ ...f, name: sel.label, address: sel.label }));
      setFormCoords({
        latitude: sel.pos[0],
        longitude: sel.pos[1],
        geocodeProvider: "manual",
        geocodeLabel: sel.label,
      });
      pendingSelectionRef.current = null;
    }
    // Scroll naar het formulier zodat het zichtbaar is
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openEditForm(l: ManagedLocation) {
    setEditingId(l.id);
    setForm({
      name: l.name,
      address: l.address,
      type: l.type,
      startsAt: l.startsAt ? l.startsAt.slice(0, 16) : "",
      expiresAt: l.expiresAt ? l.expiresAt.slice(0, 16) : "",
      notes: l.notes ?? "",
    });
    setFormCoords({
      latitude: l.latitude,
      longitude: l.longitude,
      geocodeProvider: l.geocodeProvider ?? "manual",
      geocodeLabel: l.geocodeLabel,
    });
    setGeoQuery("");
    setGeoResults([]);
    setGeoError(null);
    setError(null);
    setShowForm(true);
  }

  // Sequence-guard: een tragere oudere geocode-response mag de resultaten
  // van een nieuwere zoekopdracht niet overschrijven.
  const geoSeqRef = useRef(0);
  async function searchAddress(qOverride?: string) {
    const q = (qOverride ?? geoQuery).trim();
    if (q.length < 3) {
      setGeoError("Voer minimaal 3 tekens in");
      return;
    }
    const seq = ++geoSeqRef.current;
    setGeoBusy(true);
    setGeoError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const d = await res.json().catch(() => null);
      if (seq !== geoSeqRef.current) return;
      if (!res.ok) {
        setGeoError(d?.error ?? `Fout ${res.status}`);
        setGeoResults([]);
        return;
      }
      setGeoResults(d.results ?? []);
      if ((d.results ?? []).length === 0) {
        setGeoError("Geen resultaten — probeer een vollediger adres (straat + huisnummer + plaats).");
      }
    } catch {
      if (seq === geoSeqRef.current) setGeoError("Netwerkfout bij geocoding");
    } finally {
      if (seq === geoSeqRef.current) setGeoBusy(false);
    }
  }

  function pickGeocodeResult(r: GeocodeCandidate) {
    setFormCoords({
      latitude: r.latitude,
      longitude: r.longitude,
      geocodeProvider: r.provider,
      geocodeLabel: r.label,
    });
    setGeoResults([]);
    setGeoError(null);
  }

  async function saveLocation() {
    if (!form.name.trim()) {
      setError("Naam is verplicht");
      return;
    }
    if (!form.address.trim()) {
      setError("Adres is verplicht");
      return;
    }
    if (!formCoords) {
      setError("Kies eerst een adres via 'Zoek adres' of bewerk de coördinaten");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        address: form.address.trim(),
        latitude: formCoords.latitude,
        longitude: formCoords.longitude,
        geocodeProvider: formCoords.geocodeProvider,
        geocodeLabel: formCoords.geocodeLabel,
        type: form.type,
        notes: form.notes.trim() || null,
      };
      if (form.type === "temporary") {
        payload.startsAt = form.startsAt ? new Date(form.startsAt).toISOString() : null;
        payload.expiresAt = form.expiresAt ? new Date(form.expiresAt).toISOString() : null;
      }
      const url = editingId ? `/api/locations/${editingId}` : "/api/locations";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setError(d?.error ?? `Fout ${res.status}`);
        return;
      }
      setShowForm(false);
      void loadLocations();
    } catch {
      setError("Netwerkfout");
    } finally {
      setBusy(false);
    }
  }

  async function deleteLocation(id: string) {
    if (!confirm("Locatie naar prullenbak van deze module verplaatsen?")) return;
    setError(null);
    const res = await fetch(`/api/locations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? `Verwijderen mislukt (${res.status})`);
      return;
    }
    void loadLocations();
  }

  async function restoreLocation(id: string) {
    setError(null);
    const res = await fetch(`/api/locations/${id}/restore`, { method: "POST" });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? `Herstellen mislukt (${res.status})`);
      return;
    }
    void loadLocations();
  }

  // ── Routes ──
  async function createRoute() {
    const name = prompt("Naam van de nieuwe route:");
    if (!name?.trim()) return;
    const res = await fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), points: [] }),
    });
    if (res.ok) {
      const r = await res.json();
      void loadAll();
      setSelectedRouteId(r.id);
      setRouteForm({ name: r.name, description: r.description ?? "" });
      setRoutePoints([]);
      setTab("routes");
    }
  }

  useEffect(() => {
    const r = routes.find((x) => x.id === selectedRouteId);
    if (r) {
      setRouteForm({ name: r.name, description: r.description ?? "" });
      setRoutePoints(
        r.points.map((p) => ({
          locationId: p.locationId,
          name: p.name,
          address: p.address,
          latitude: p.latitude,
          longitude: p.longitude,
        }))
      );
      setRouteRoad(null);
      setRouteRoadInfo(null);
    }
  }, [selectedRouteId, routes]);

  function addPointFromLocation() {
    if (!addLocationPick) return;
    const loc = locations.find((l) => l.id === addLocationPick);
    if (!loc) return;
    setRoutePoints((pts) => [
      ...pts,
      {
        locationId: loc.id,
        name: loc.name,
        address: loc.address,
        latitude: loc.latitude,
        longitude: loc.longitude,
      },
    ]);
    setAddLocationPick("");
    setRouteRoad(null);
    setRouteRoadInfo(null);
  }

  function addPointFromMapSelection() {
    const sel = pendingSelectionRef.current;
    if (!sel) {
      // Geen actieve zoekselectie — uitleg tonen
      alert(
        "Gebruik eerst de zoekbalk op de kaart: kies een resultaat en klik in de popup op 'Opslaan als locatie' om het als routepunt toe te voegen."
      );
      return;
    }
    setRoutePoints((pts) => [
      ...pts,
      {
        locationId: null,
        name: sel.label,
        address: sel.label,
        latitude: sel.pos[0],
        longitude: sel.pos[1],
      },
    ]);
    pendingSelectionRef.current = null;
    setRouteRoad(null);
    setRouteRoadInfo(null);
  }

  function movePoint(index: number, dir: -1 | 1) {
    setRoutePoints((pts) => {
      const next = [...pts];
      const target = index + dir;
      if (target < 0 || target >= next.length) return pts;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setRouteRoad(null);
    setRouteRoadInfo(null);
  }

  function removePoint(index: number) {
    setRoutePoints((pts) => pts.filter((_, i) => i !== index));
    setRouteRoad(null);
    setRouteRoadInfo(null);
  }

  async function saveRoute() {
    if (!selectedRouteId) return;
    if (!routeForm.name.trim()) {
      alert("Route-naam is verplicht");
      return;
    }
    setRouteBusy(true);
    try {
      const res = await fetch(`/api/routes/${selectedRouteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: routeForm.name.trim(),
          description: routeForm.description.trim() || null,
          points: routePoints,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        alert(d?.error ?? `Fout ${res.status}`);
        return;
      }
      void loadAll();
    } finally {
      setRouteBusy(false);
    }
  }

  async function duplicateRoute(id: string) {
    const res = await fetch(`/api/routes/${id}/duplicate`, { method: "POST" });
    if (res.ok) void loadAll();
  }

  async function deleteRoute(id: string) {
    if (!confirm("Route verwijderen?")) return;
    const res = await fetch(`/api/routes/${id}`, { method: "DELETE" });
    if (res.ok) {
      if (selectedRouteId === id) setSelectedRouteId(null);
      void loadAll();
    }
  }

  async function calculateRoadRoute() {
    if (routePoints.length < 2) return;
    setRouteBusy(true);
    try {
      const coords = routePoints.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
      const res = await fetch("/api/routes/road", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: coords }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.route) {
        setRouteRoad(d.route.coordinates);
        setRouteRoadInfo({
          distanceKm: d.route.distanceKm,
          durationMin: d.route.durationMin,
        });
      } else {
        setRouteRoad(null);
        setRouteRoadInfo(null);
        alert(
          d?.error ??
            "Straatroute niet beschikbaar — de kaart toont een rechte lijn tussen de punten."
        );
      }
    } finally {
      setRouteBusy(false);
    }
  }

  function exportRoute() {
    const geojson = {
      type: "FeatureCollection",
      features: routePoints.map((p, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
        properties: { order: i + 1, name: p.name, address: p.address },
      })),
    };
    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `route-${routeForm.name || "export"}.geojson`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Import ──
  function downloadSampleLines() {
    const sample = `# Voorbeeld — één adres per regel (komma's horen bij adressen)
Karel Doormanstraat 59, Haaksbergen
Stationsstraat 12, Enschede
Markt 1, Hengelo
# Optioneel: Label | adres
Magazijn | Industrieweg 3, Almelo`;
    const blob = new Blob([sample], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "locaties-voorbeeld.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadSampleCsv() {
    const sample = `name,address,type,expires_at,notes
Hoofdkantoor,"Karel Doormanstraat 59, Haaksbergen",permanent,,"Vaste standplaats"
Tijdelijke locatie,"Stationsstraat 12, Enschede",temporary,2026-12-25T18:00:00,"Kerstactie"`;
    const blob = new Blob([sample], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "locaties-voorbeeld.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function onImportFile(file: File) {
    if (file.size > 500_000) {
      setImportErrors([{ line: 0, message: "Bestand te groot (max 500KB)", raw: "" }]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result ?? ""));
      setImportRows(null);
      setImportResult(null);
    };
    reader.readAsText(file);
  }

  async function analyzeImport() {
    if (!importText.trim()) {
      setImportErrors([{ line: 0, message: "Geen inhoud — kies eerst een bestand", raw: "" }]);
      return;
    }
    setImportBusy(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/locations/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: importText, geocodeRows: true }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setImportErrors([
          { line: 0, message: d?.error ?? `Fout ${res.status}`, raw: "" },
        ]);
        setImportRows(null);
        return;
      }
      setImportRows(d.rows);
      setImportErrors(d.errors ?? []);
      setImportSummary(d.summary);
    } finally {
      setImportBusy(false);
    }
  }

  function pickImportCandidate(rowIdx: number, c: GeocodeCandidate) {
    setImportRows((rows) => {
      if (!rows) return rows;
      const next = [...rows];
      next[rowIdx] = {
        ...next[rowIdx],
        latitude: c.latitude,
        longitude: c.longitude,
        geocodeProvider: c.provider,
        geocodeLabel: c.label,
        status: "geocoded",
      };
      return next;
    });
  }

  async function importValidRows() {
    if (!importRows) return;
    const items = importRows
      .filter((r) => r.status === "geocoded" && r.latitude != null && r.longitude != null)
      .map((r) => ({
        name: (r.name ?? r.geocodeLabel ?? r.address).slice(0, 120),
        address: r.address,
        latitude: r.latitude!,
        longitude: r.longitude!,
        geocodeProvider: (r.geocodeProvider as "photon" | "nominatim" | "manual") ?? "manual",
        geocodeLabel: r.geocodeLabel ?? null,
        type: r.type ?? "permanent",
        expiresAt: r.expiresAt,
        notes: r.notes,
      }));
    if (items.length === 0) {
      setImportResult("Geen rijen met coördinaten om te importeren — los onopgeloste adressen op.");
      return;
    }
    setImportBusy(true);
    try {
      const res = await fetch("/api/locations/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, skipDuplicates: true }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setImportResult(d?.error ?? `Fout ${res.status}`);
        return;
      }
      setImportResult(
        `Import afgerond: ${d.created} locaties aangemaakt, ${d.duplicates} duplicaten overgeslagen.`
      );
      void loadLocations();
      void loadAll();
    } finally {
      setImportBusy(false);
    }
  }

  // ── Kaart-afgeleiden ──
  const activeLocationsForMap = useMemo(() => {
    const mapped: MapLocation[] = locations
      .filter((l) => !l.deletedAt)
      .map((l) => ({
        id: l.id,
        name: l.name,
        address: l.address,
        latitude: l.latitude,
        longitude: l.longitude,
        type: l.type,
        color: l.color,
        isExpired: l.isExpired,
        expiresAt: l.expiresAt,
        notes: l.notes,
      }));
    return applyLocationFilters(mapped, visible);
  }, [locations, visible]);

  const routeVisualization: RouteVisualization | null =
    tab === "routes" && routePoints.length > 0
      ? {
          points: routePoints.map((p, i): RouteLinePoint => ({
            pos: [p.latitude, p.longitude],
            kind: i === 0 ? "start" : i === routePoints.length - 1 ? "end" : "mid",
            name: p.name,
            order: i + 1,
          })),
          roadRoute: routeRoad,
          roadRouteInfo: routeRoadInfo,
        }
      : null;

  const onSaveSelection = useCallback(
    (sel: SelectionMarker) => {
      if (tab === "routes") {
        pendingSelectionRef.current = sel;
        setRoutePoints((pts) => [
          ...pts,
          {
            locationId: null,
            name: sel.label,
            address: sel.label,
            latitude: sel.pos[0],
            longitude: sel.pos[1],
          },
        ]);
        setRouteRoad(null);
        setRouteRoadInfo(null);
        return;
      }
      pendingSelectionRef.current = sel;
      openCreateForm();
    },
    [tab]
  );

  const statusOptions: { value: typeof statusFilter; label: string }[] = [
    { value: "active", label: "Actief" },
    { value: "expired", label: "Verlopen / toekomstig" },
    { value: "all", label: "Alles" },
    { value: "deleted", label: "Verwijderd" },
  ];

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">Locaties &amp; Routes</h1>
          <p className="text-sm text-slate-500">
            Beheerde locaties, routeplanning en bulk-import
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "locaties" && (
            <button
              onClick={openCreateForm}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Locatie
            </button>
          )}
          {tab === "routes" && (
            <button
              onClick={() => void createRoute()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Route
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        {(
          [
            ["locaties", "📍 Locaties"],
            ["routes", "🛣️ Routes"],
            ["import", "📥 Import"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ErrorBanner>{error}</ErrorBanner>

      {/* Kaart met filters */}
      <div className="relative mb-6 h-[380px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:h-[440px]">
        <TrackingMap
          vehicles={[]}
          zones={visible.zones ? zones : []}
          locations={activeLocationsForMap}
          routeLine={visible.route ? routeVisualization : null}
          onSaveSelection={onSaveSelection}
          onSaveAsLocation={onSaveSelection}
          showLegend
        />
        <MapFilterControl
          state={filterState}
          available={available}
          onToggle={toggle}
        />
      </div>

      {/* ── TAB: Locaties ── */}
      {tab === "locaties" && (
        <>
          {/* Formulier */}
          {showForm && (
            <div ref={formRef} className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
              <h2 className="mb-4 font-semibold text-slate-900">
                {editingId ? "Locatie bewerken" : "Nieuwe locatie"}
              </h2>

              {/* Adres + geocoding */}
              <label className="text-sm font-medium text-slate-700">
                Adres of plaats *
                <span className="ml-1 font-normal text-slate-400">
                  (bijv. Karel Doormanstraat 59, Haaksbergen)
                </span>
                <div className="mt-1 flex gap-2">
                  <input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    onBlur={() => setGeoQuery(form.address)}
                    placeholder="Straat, huisnummer, postcode, plaats…"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                  />
                  <button
                    onClick={() => void searchAddress(form.address)}
                    disabled={geoBusy}
                    className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {geoBusy ? "Zoeken…" : "Zoek adres"}
                  </button>
                </div>
              </label>

              {geoError && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                  {geoError}
                </p>
              )}

              {geoResults.length > 0 && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <p className="mb-1 text-xs font-medium text-slate-600">
                    Kies het juiste resultaat ({geoResults.length} gevonden):
                  </p>
                  <ul className="max-h-40 overflow-auto">
                    {geoResults.map((r, i) => (
                      <li key={i}>
                        <button
                          onClick={() => pickGeocodeResult(r)}
                          className="w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-blue-50"
                        >
                          📍 {r.label}
                          <span className="ml-2 text-xs text-slate-400">
                            {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)} · {r.provider}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {formCoords && (
                <p className="mt-2 rounded-lg bg-green-50 px-3 py-1.5 text-xs text-green-700">
                  ✓ Gekozen: {formCoords.geocodeLabel ?? "coördinaten"} —{" "}
                  {formCoords.latitude.toFixed(5)}, {formCoords.longitude.toFixed(5)} (
                  {formCoords.geocodeProvider})
                </p>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Label / naam *
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Zichtbare naam op de kaart"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Type *
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm({ ...form, type: e.target.value as "permanent" | "temporary" })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                  >
                    <option value="permanent">🔵 Permanent (depot, kantoor…)</option>
                    <option value="temporary">🟠 Tijdelijk (met vervaldatum)</option>
                  </select>
                </label>
                {form.type === "temporary" && (
                  <>
                    <label className="text-sm font-medium text-slate-700">
                      Geldig vanaf
                      <input
                        type="datetime-local"
                        value={form.startsAt}
                        onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Vervalt op * (verval is exclusief)
                      <input
                        type="datetime-local"
                        value={form.expiresAt}
                        onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                      />
                    </label>
                  </>
                )}
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                  Notities
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                  />
                </label>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => void saveLocation()}
                  disabled={busy}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {busy ? "Bezig…" : "Opslaan"}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Annuleren
                </button>
              </div>
            </div>
          )}

          {/* Filters + lijst */}
          <div className="mb-3 flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
            >
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
            >
              <option value="">Alle types</option>
              <option value="permanent">Permanent</option>
              <option value="temporary">Tijdelijk</option>
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek naam of adres…"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Naam</th>
                    <th className="hidden px-4 py-3 sm:table-cell">Adres</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="hidden px-4 py-3 md:table-cell">Geldigheid</th>
                    <th className="px-4 py-3">Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {l.name}
                        <p className="text-xs font-normal text-slate-400 sm:hidden">
                          {l.address}
                        </p>
                      </td>
                      <td className="hidden max-w-[240px] truncate px-4 py-3 text-slate-500 sm:table-cell">
                        {l.address}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            l.type === "temporary"
                              ? "bg-orange-50 text-orange-600"
                              : "bg-blue-50 text-blue-600"
                          }`}
                        >
                          {l.type === "temporary" ? "Tijdelijk" : "Permanent"}
                        </span>
                        {l.isExpired && l.type === "temporary" && (
                          <span className="ml-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                            {l.startsAt && new Date(l.startsAt) > new Date()
                              ? "Toekomstig"
                              : "Verlopen"}
                          </span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-slate-500 md:table-cell">
                        {l.type === "temporary"
                          ? l.expiresAt
                            ? new Date(l.expiresAt).toLocaleString("nl-NL")
                            : "—"
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {l.deletedAt ? (
                            <button
                              onClick={() => void restoreLocation(l.id)}
                              className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100"
                            >
                              ↩ Herstellen
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => openEditForm(l)}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Bewerken
                              </button>
                              <button
                                onClick={() => void deleteLocation(l.id)}
                                className="text-xs text-red-500 hover:underline"
                              >
                                Verwijderen
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {locations.length === 0 && (
              <p className="p-10 text-center text-sm text-slate-400">
                Geen locaties in deze weergave.
              </p>
            )}
          </div>
        </>
      )}

      {/* ── TAB: Routes ── */}
      {tab === "routes" && (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Routes ({routes.length})
            </p>
            <ul className="flex flex-col gap-1.5">
              {routes.map((r) => (
                <li
                  key={r.id}
                  className={`cursor-pointer rounded-lg border p-2.5 text-sm ${
                    selectedRouteId === r.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                  onClick={() => setSelectedRouteId(r.id)}
                >
                  <p className="font-medium text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-400">{r.points.length} punten</p>
                </li>
              ))}
            </ul>
            {routes.length === 0 && (
              <p className="p-4 text-center text-xs text-slate-400">Nog geen routes.</p>
            )}
          </aside>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {!selectedRouteId ? (
              <p className="p-8 text-center text-sm text-slate-400">
                Kies een route of maak een nieuwe aan.
              </p>
            ) : (
              <>
                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    Naam *
                    <input
                      value={routeForm.name}
                      onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Omschrijving
                    <input
                      value={routeForm.description}
                      onChange={(e) =>
                        setRouteForm({ ...routeForm, description: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                    />
                  </label>
                </div>

                <p className="mb-2 text-sm font-semibold text-slate-700">
                  Routepunten ({routePoints.length})
                </p>
                <ol className="mb-3 flex flex-col gap-1.5">
                  {routePoints.map((p, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                          i === 0
                            ? "bg-green-600"
                            : i === routePoints.length - 1
                              ? "bg-red-600"
                              : "bg-blue-600"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">{p.name}</p>
                        {p.address && (
                          <p className="truncate text-xs text-slate-400">{p.address}</p>
                        )}
                      </div>
                      <button
                        onClick={() => movePoint(i, -1)}
                        disabled={i === 0}
                        title="Omhoog"
                        className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => movePoint(i, 1)}
                        disabled={i === routePoints.length - 1}
                        title="Omlaag"
                        className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => removePoint(i)}
                        title="Verwijderen"
                        className="rounded px-2 py-1 text-red-500 hover:bg-red-50"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ol>
                {routePoints.length === 0 && (
                  <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">
                    Nog geen punten — voeg een beheerde locatie toe of kies een
                    kaartselectie via de zoekbalk.
                  </p>
                )}

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <select
                    value={addLocationPick}
                    onChange={(e) => setAddLocationPick(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                  >
                    <option value="">Kies beheerde locatie…</option>
                    {locations
                      .filter((l) => !l.deletedAt && !l.isExpired)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.address})
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={addPointFromLocation}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                  >
                    + Toevoegen
                  </button>
                  <button
                    onClick={addPointFromMapSelection}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    📌 Kaartselectie toevoegen
                  </button>
                </div>

                <div className="mb-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <button
                    onClick={() => void saveRoute()}
                    disabled={routeBusy}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {routeBusy ? "Bezig…" : "💾 Route opslaan"}
                  </button>
                  <button
                    onClick={() => void calculateRoadRoute()}
                    disabled={routeBusy || routePoints.length < 2}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    title="Berekent via OSRM (openbare demo); valt terug op rechte lijn"
                  >
                    🛣️ Bereken straatroute
                  </button>
                  <button
                    onClick={exportRoute}
                    disabled={routePoints.length === 0}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    ⬇ Exporteer GeoJSON
                  </button>
                  <button
                    onClick={() => void duplicateRoute(selectedRouteId)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Kopiëren
                  </button>
                  <button
                    onClick={() => void deleteRoute(selectedRouteId)}
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    Verwijderen
                  </button>
                </div>

                {routeRoadInfo ? (
                  <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                    ✓ Straatroute berekend: {routeRoadInfo.distanceKm} km,{" "}
                    {routeRoadInfo.durationMin} min (OSRM-demo). Kaart toont de wegroute.
                  </p>
                ) : routePoints.length > 1 ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Kaart toont een rechte lijn tussen de punten (gestreept). Klik
                    &quot;Bereken straatroute&quot; voor een navigatie-route (indien
                    beschikbaar).
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Import ── */}
      {tab === "import" && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
          <h2 className="mb-1 font-semibold text-slate-900">Bulk-import locaties</h2>
          <p className="mb-4 text-sm text-slate-500">
            Ondersteunde formaten: <strong>één adres per regel</strong> (komma&apos;s
            horen bij adressen — niet splitsen!) of <strong>CSV</strong> met kolomnamen{" "}
            <code className="rounded bg-slate-100 px-1">name,address,type,expires_at,notes</code>.
            Adressen worden op de server gegecoded (max 50 per keer, netjes voor de
            providers).
          </p>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              onClick={downloadSampleLines}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              ⬇ Voorbeeld TXT
            </button>
            <button
              onClick={downloadSampleCsv}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              ⬇ Voorbeeld CSV
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv,text/plain,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
            }}
            className="mb-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />

          {importText && (
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={5}
              className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900"
            />
          )}

          <div className="mb-4 flex gap-2">
            <button
              onClick={() => void analyzeImport()}
              disabled={importBusy || !importText.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {importBusy ? "Bezig met geocode…" : "1. Analyseer & geocodeer"}
            </button>
            {importRows && (
              <button
                onClick={() => void importValidRows()}
                disabled={importBusy}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {importBusy ? "Importeren…" : "2. Importeer opgeloste rijen"}
              </button>
            )}
          </div>

          {importSummary && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries({
                "Totaal": importSummary.totalRows,
                "Geldig": importSummary.valid,
                "Ongeldig": importSummary.invalid,
                "Duplicaten": importSummary.duplicates,
                "Gegecoded": importSummary.geocoded,
                "Onopgelost": importSummary.unresolved,
                "Nog coords nodig": importSummary.needsCoordinates,
              }).map(([label, value]) => (
                <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="text-sm font-bold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
          )}

          {importErrors.length > 0 && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="mb-1 text-xs font-semibold text-red-700">
                {importErrors.length} fout(en):
              </p>
              <ul className="max-h-32 overflow-auto text-xs text-red-600">
                {importErrors.map((e, i) => (
                  <li key={i}>
                    Regel {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {importRows && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Regel</th>
                    <th className="px-3 py-2">Adres</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((r, i) => (
                    <tr key={r.line} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-400">{r.line}</td>
                      <td className="px-3 py-2 text-slate-700">{r.address}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 font-medium ${
                            r.status === "geocoded"
                              ? "bg-green-50 text-green-700"
                              : r.status === "duplicate"
                                ? "bg-slate-100 text-slate-500"
                                : r.status === "unresolved"
                                  ? "bg-red-50 text-red-600"
                                  : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {r.status === "geocoded"
                            ? r.candidates
                              ? `⚠ ${r.candidates.length} kandidaten`
                              : "✓ Gegecoded"
                            : r.status === "duplicate"
                              ? "Duplicaat"
                              : r.status === "unresolved"
                                ? "Onopgelost"
                                : "Coords nodig"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {r.candidates && r.candidates.length > 0 && (
                          <select
                            className="max-w-[220px] rounded border border-slate-300 px-1.5 py-1"
                            defaultValue=""
                            onChange={(e) => {
                              const idx = Number(e.target.value);
                              if (!Number.isNaN(idx) && r.candidates) {
                                pickImportCandidate(i, r.candidates[idx]);
                              }
                            }}
                          >
                            <option value="">Kies kandidaat…</option>
                            {r.candidates.map((c, ci) => (
                              <option key={ci} value={ci}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        )}
                        {r.status === "geocoded" && r.latitude != null && (
                          <span className="text-slate-400">
                            {r.latitude.toFixed(4)}, {r.longitude?.toFixed(4)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {importResult && (
            <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              {importResult}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function LocationsPage() {
  return (
    <Suspense>
      <LocationsPageContent />
    </Suspense>
  );
}
