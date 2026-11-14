"use client";

// Error boundary voor de fleet-app — vangt render-fouten op pagina-niveau
// en voorkomt dat een enkele fout de hele applicatie crasht.
export default function FleetError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-lg font-bold text-slate-900">
        Er is iets misgegaan
      </h1>
      <p className="max-w-md text-sm text-slate-500">
        {/* Alleen in development de details tonen; productie toont een
            generieke melding (interne fouttekens niet blootgeven). */}
        {process.env.NODE_ENV === "development"
          ? error.message || "Onbekende fout"
          : "De pagina kon niet worden geladen. Probeer het opnieuw."}
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-slate-400">
          Fout-ID: {error.digest}
        </p>
      )}
      <button
        onClick={reset}
        className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Opnieuw proberen
      </button>
    </div>
  );
}
