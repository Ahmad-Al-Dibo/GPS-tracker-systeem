"use client";

// Gedeelde kaartfilter-staat (sectie 9 specificatie):
// - Consistente filtersuggesties over alle kaartpagina's
// - Pagina-defaults mogen expliciete keuzes van de gebruiker NIET overschrijven
// - Voorkeuren zijn per sessie, per pagina (geen globale persistenty — past
//   niet bij de huidige stateless-frontend-architectuur)
import { useCallback, useState } from "react";

export type MapFilterState = {
  vehicles: boolean;
  zones: boolean;
  /** Beheerde locaties */
  locationsPermanent: boolean;
  locationsTemporary: boolean;
  /** Verlopen tijdelijke locaties zichtbaar? (standaard uit) */
  locationsExpired: boolean;
  /** Routelijn + -punten */
  route: boolean;
};

/** Welke lagen deze pagina überhaupt kan tonen (geen betekenisloze filters). */
export type AvailableLayers = Partial<Record<keyof MapFilterState, boolean>>;

export const DEFAULT_FILTERS: MapFilterState = {
  vehicles: true,
  zones: true,
  locationsPermanent: true,
  locationsTemporary: true,
  locationsExpired: false,
  route: true,
};

/**
 * Pagina-scoped filter-hook. Defaults worden éénmalig genomen; latere
 * default-wijzigingen overschrijven de gebruikerskeuze niet.
 */
export function useMapFilters(
  defaults: Partial<MapFilterState>,
  available: AvailableLayers
) {
  const [state, setState] = useState<MapFilterState>({
    ...DEFAULT_FILTERS,
    ...defaults,
  });

  const toggle = useCallback((key: keyof MapFilterState) => {
    setState((s) => ({ ...s, [key]: !s[key] }));
  }, []);

  /** Alleen lagen tonen die deze pagina ondersteunt. */
  const visible: MapFilterState = {
    vehicles: (available.vehicles ?? false) && state.vehicles,
    zones: (available.zones ?? false) && state.zones,
    locationsPermanent:
      (available.locationsPermanent ?? false) && state.locationsPermanent,
    locationsTemporary:
      (available.locationsTemporary ?? false) && state.locationsTemporary,
    locationsExpired:
      (available.locationsExpired ?? false) && state.locationsExpired,
    route: (available.route ?? false) && state.route,
  };

  return { state, visible, toggle, setState };
}

/** Filtert een locatielijst volgens de zichtbaarheids-state. */
export function applyLocationFilters<
  T extends { type: "permanent" | "temporary"; isExpired: boolean }
>(locations: T[], visible: MapFilterState): T[] {
  return locations.filter((l) => {
    if (l.type === "permanent") return visible.locationsPermanent;
    if (l.isExpired) return visible.locationsExpired;
    return visible.locationsTemporary;
  });
}
