import { useEffect, useState } from "react";
import {
  fetchUnitCatalog,
  type UnitsByRace,
  type UnitCatalog,
} from "./api";

let catalogPromise: Promise<UnitCatalog> | null = null;

export function prefetchUnitCatalog(): void {
  if (!catalogPromise) {
    catalogPromise = fetchUnitCatalog();
  }
}

export function useUnitCatalog(): {
  byRace: UnitsByRace | null;
  tierByUnit: Record<string, number>;
  loadError: string | null;
  ready: boolean;
} {
  const [catalog, setCatalog] = useState<UnitCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const promise = catalogPromise ?? fetchUnitCatalog();
    catalogPromise = promise;
    promise
      .then((data) => {
        setCatalog(data);
        setLoadError(null);
      })
      .catch((e) =>
        setLoadError(e instanceof Error ? e.message : "Failed to load units")
      );
  }, []);

  return {
    byRace: catalog?.byRace ?? null,
    tierByUnit: catalog?.tierByUnit ?? {},
    loadError,
    ready: catalog !== null,
  };
}
