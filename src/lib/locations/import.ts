// Import-parsing voor locaties (bulk-import)
// Concept uit Routing Manager: genormaliseerde vergelijkingssleutel voor
// deterministische dedupe; originele tekst blijft behouden.
// Ondersteunt: (1) één adres per regel, (2) CSV met kolomnamen.

export type ParsedImportRow = {
  /** 1-gebaseerde regelnummer in het bestand (voor feedback) */
  line: number;
  name: string | null;
  address: string;
  type: "permanent" | "temporary" | null;
  expiresAt: string | null;
  notes: string | null;
};

export type ParseResult = {
  rows: ParsedImportRow[];
  errors: { line: number; message: string; raw: string }[];
  format: "lines" | "csv";
};

/** Canonical comparison key (alleen voor vergelijking — nooit tonen). */
export function normalizeAddressKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[,;.!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministische dedupe: het ADRES is de identiteit (Routing Manager-concept)
 * — namen zijn labels en mogen verschillen. Zelfde genormaliseerde adres =
 * duplicate. Geen fuzzy matching (voorkomt het wissen van geldige adressen
 * zoals "73" vs "73 A").
 */
export function dedupeKey(row: { address: string; name?: string | null }): string {
  return normalizeAddressKey(row.address);
}

/** Eenvoudige CSV-regel-parser met quote-ondersteuning ( komma's in quotes). */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

const TYPE_ALIASES: Record<string, "permanent" | "temporary"> = {
  permanent: "permanent",
  vast: "permanent",
  temporary: "temporary",
  tijdelijk: "temporary",
};

/**
 * Parset bestandsinhoud voor bulk-import.
 * - Herkent CSV (header met bekende kolomnamen) automatisch.
 * - Anders: één adres per regel; "Label | adres"-syntax optioneel voor naam.
 * - Regels die beginnen met # of leeg worden overgeslagen.
 */
export function parseImportContent(content: string, format?: "lines" | "csv"): ParseResult {
  const lines = content.split(/\r?\n/);

  const firstNonEmpty = lines.find((l) => l.trim() && !l.trim().startsWith("#"));
  const looksLikeCsv =
    format === "csv" ||
    (format !== "lines" &&
      !!firstNonEmpty &&
      /^name\s*,|,\s*address\s*,|address\s*,/i.test(firstNonEmpty));

  if (looksLikeCsv) {
    return parseCsvImport(lines);
  }
  return parseLinesImport(lines);
}

function parseCsvImport(lines: string[]): ParseResult {
  const rows: ParsedImportRow[] = [];
  const errs: ParseResult["errors"] = [];

  const headerIdx = lines.findIndex((l) => l.trim() && !l.trim().startsWith("#"));
  if (headerIdx === -1) {
    return { rows: [], errors: [{ line: 1, message: "Leeg bestand", raw: "" }], format: "csv" };
  }
  const header = parseCsvLine(lines[headerIdx]).map((h) => h.toLowerCase());
  const col = (names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iName = col(["name", "label", "naam"]);
  const iAddress = col(["address", "adres"]);
  const iType = col(["type", "soort"]);
  const iExpires = col(["expires_at", "expires", "verloop", "vervaldatum"]);
  const iNotes = col(["notes", "notities", "opmerking"]);

  if (iAddress < 0) {
    return {
      rows: [],
      errors: [
        {
          line: headerIdx + 1,
          message: 'CSV-kolom "address" ontbreekt — verwachte kolomnamen: name,address,type,expires_at,notes',
          raw: lines[headerIdx],
        },
      ],
      format: "csv",
    };
  }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const cells = parseCsvLine(raw);
    const address = cells[iAddress]?.trim() ?? "";
    if (!address) {
      errs.push({ line: i + 1, message: "Adres ontbreekt", raw });
      continue;
    }
    const typeRaw = (cells[iType] ?? "").toLowerCase();
    const type = TYPE_ALIASES[typeRaw] ?? null;
    if (iType >= 0 && cells[iType]?.trim() && !type) {
      errs.push({ line: i + 1, message: `Onbekend type "${cells[iType]}" (gebruik permanent of temporary)`, raw });
      continue;
    }
    const expiresRaw = (cells[iExpires] ?? "").trim();
    let expiresAt: string | null = null;
    if (expiresRaw) {
      const d = new Date(expiresRaw);
      if (Number.isNaN(d.getTime())) {
        errs.push({ line: i + 1, message: `Ongeldige vervaldatum "${expiresRaw}"`, raw });
        continue;
      }
      expiresAt = d.toISOString();
    }
    if (type === "temporary" && !expiresAt) {
      errs.push({ line: i + 1, message: "Tijdelijke locatie vereist expires_at", raw });
      continue;
    }
    rows.push({
      line: i + 1,
      name: iName >= 0 ? cells[iName]?.trim() || null : null,
      address,
      type,
      expiresAt,
      notes: iNotes >= 0 ? cells[iNotes]?.trim() || null : null,
    });
  }
  return { rows, errors: errs, format: "csv" };
}

function parseLinesImport(lines: string[]): ParseResult {
  const rows: ParsedImportRow[] = [];
  const errors: ParseResult["errors"] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    // Optioneel "Label | adres" (geen komma-split — komma's horen bij adressen!)
    const pipe = raw.indexOf("|");
    let name: string | null = null;
    let address = raw.trim();
    if (pipe > 0 && pipe < raw.length - 1) {
      const maybeName = raw.slice(0, pipe).trim();
      const maybeAddress = raw.slice(pipe + 1).trim();
      if (maybeName && maybeAddress) {
        name = maybeName;
        address = maybeAddress;
      }
    }
    if (address.length < 3) {
      errors.push({ line: i + 1, message: "Adres te kort", raw });
      continue;
    }
    rows.push({ line: i + 1, name, address, type: null, expiresAt: null, notes: null });
  }
  return { rows, errors, format: "lines" };
}
