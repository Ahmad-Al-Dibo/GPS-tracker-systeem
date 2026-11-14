@echo off
set WEB_INGEST_URL=http://localhost:3000/api/ingest/teltonika
rem TELTONIKA_INGEST_KEY staat NIET in dit bestand (geen secrets in git).
rem Zet de key in je shell of in teltonika\set-key.local.cmd (lokaal, niet in git).
if not defined TELTONIKA_INGEST_KEY if exist "%~dp0set-key.local.cmd" call "%~dp0set-key.local.cmd"
if not defined TELTONIKA_INGEST_KEY (
  echo [start-web-mode] TELTONIKA_INGEST_KEY ontbreekt. Zet de env-var of maak set-key.local.cmd.
  exit /b 1
)
node "%~dp0server.mjs"
