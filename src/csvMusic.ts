import type { ConfMap, MusicDocument, MusicSchema, MusicSchemaRow } from "./musicTypes";

/** Minimal RFC4180-style parser (quoted fields, comma delimiter). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = (): void => {
    row.push(field);
    field = "";
  };

  const pushRow = (): void => {
    if (row.length === 0) return;
    if (row.every((c) => c.trim() === "")) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushField();
      pushRow();
    } else if (c === "\r") {
      pushField();
      if (text[i + 1] === "\n") i++;
      pushRow();
    } else {
      field += c;
    }
  }
  pushField();
  pushRow();
  return rows;
}

function headerIndex(header: string[], name: string): number {
  const idx = header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  return idx;
}

export function csvTextToMusicDocument(csvText: string): MusicDocument {
  const rows = parseCsv(csvText.trimEnd());
  return rowsToMusicDocument(rows);
}

export function rowsToMusicDocument(rows: string[][]): MusicDocument {
  if (rows.length === 0) {
    return { conf: {}, music_schema: {} };
  }
  const header = rows[0]!.map((h) => h.trim());
  const iComp = headerIndex(header, "Compassos");
  const iDesc = headerIndex(header, "Description");
  const iLetra = headerIndex(header, "Letra");
  const iCifra = headerIndex(header, "Cifra");
  const iConf = headerIndex(header, "Conf");
  const iConfVal = headerIndex(header, "Conf-Val");

  const conf: ConfMap = {};
  const music_schema: MusicSchema = {};
  let key = 0;

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r]!;
    const pad = (i: number): string => (i >= 0 && i < cols.length ? cols[i]! : "").trim();

    const compassos = pad(iComp);
    const description = pad(iDesc);
    const letra = pad(iLetra);
    const cifra = pad(iCifra);
    const confKey = pad(iConf);
    const confVal = pad(iConfVal);

    if (confKey !== "") {
      conf[confKey] = confVal;
    }

    const hasMusic =
      compassos !== "" || description !== "" || letra !== "" || cifra !== "";
    if (!hasMusic) continue;

    const row: MusicSchemaRow = {
      Compassos: compassos,
      Description: description,
      Letra: letra,
      Cifra: cifra,
    };
    music_schema[key] = row;

    const compNum = parseInt(compassos, 10);
    const step = Number.isFinite(compNum) && compNum > 0 ? compNum : 1;
    key += step;
  }

  return { conf, music_schema };
}
