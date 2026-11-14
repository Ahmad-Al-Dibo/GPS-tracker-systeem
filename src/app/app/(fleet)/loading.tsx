// Gedeelde loading-state voor de (fleet)-route-group: één skeleton voor alle
// pagina's i.p.v. geen enkele visuele feedback tijdens het eerste laden.
export default function FleetLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
        <p className="text-sm">Laden…</p>
      </div>
    </div>
  );
}
