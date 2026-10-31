# Beslissing 002 — Username i.p.v. e-mail als login

**Datum:** 2026-10-10  
**Status:** vastgelegd  
**Context:** Specificatie v2 noemt `username` + `password_hash`. Eerdere prototype gebruikte e-mail.

## Keuze

Login met **username**. E-mail is niet verplicht in MVP v2.  
Roles: `admin` | `worker` (niet meer ADMIN/EMPLOYEE in nieuw schema).

## Gevolgen

- Seed maakt `admin` / `werknemer` aan.
- Frontend login-veld heet username.
- Bestaande e-mail-accounts uit v1 worden niet automatisch gemigreerd (prototype; DB wordt opnieuw gezet).
