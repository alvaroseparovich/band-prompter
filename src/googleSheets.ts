declare const __G_SHEETS_API_KEY__: string;

type GoogleSheetProperties = {
  sheetId: number;
  title: string;
};

type GoogleSheet = {
  properties?: GoogleSheetProperties;
};

type GoogleSpreadsheetResponse = {
  sheets?: GoogleSheet[];
};

type GoogleValueRange = {
  range?: string;
  majorDimension?: string;
  values?: string[][];
};

export type SpreadsheetTab = {
  sheetId: number;
  title: string;
};

export type SpreadsheetTabValues = {
  sheetId: number;
  title: string;
  range: string;
  majorDimension: string;
  values: string[][];
};

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4";
const DEFAULT_RANGE = "A:G";

function getSheetsApiKey(): string {
  const key = __G_SHEETS_API_KEY__;
  if (!key || key.trim() === "") {
    throw new Error("Missing G_SHEETS_API_KEY in environment.");
  }
  return key.trim();
}

function sheetsApiUrl(pathWithLeadingSlashAndQuery: string): string {
  const key = encodeURIComponent(getSheetsApiKey());
  const sep = pathWithLeadingSlashAndQuery.includes("?") ? "&" : "?";
  return `${SHEETS_API_BASE}${pathWithLeadingSlashAndQuery}${sep}key=${key}`;
}

async function fetchSheetsJson<T>(pathWithLeadingSlashAndQuery: string): Promise<T> {
  const res = await fetch(sheetsApiUrl(pathWithLeadingSlashAndQuery));

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Google Sheets API ${res.status}: ${details || res.statusText}`);
  }

  return (await res.json()) as T;
}

export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  const byPath = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (byPath?.[1]) return byPath[1];

  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function escapeSheetTitleForRange(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

export async function getSpreadsheetTabs(spreadsheetId: string): Promise<SpreadsheetTab[]> {
  const params = new URLSearchParams({
    fields: "sheets(properties(sheetId,title))",
  });
  const data = await fetchSheetsJson<GoogleSpreadsheetResponse>(
    `/spreadsheets/${encodeURIComponent(spreadsheetId)}?${params.toString()}`,
  );

  return (data.sheets ?? [])
    .map((s) => s.properties)
    .filter((p): p is GoogleSheetProperties => Boolean(p?.title))
    .map((p) => ({ sheetId: p.sheetId, title: p.title }));
}

export async function getSpreadsheetTabValues(
  spreadsheetId: string,
  tab: SpreadsheetTab,
  range = DEFAULT_RANGE,
): Promise<SpreadsheetTabValues> {
  const requestedRange = `${escapeSheetTitleForRange(tab.title)}!${range}`;
  const encodedRange = encodeURIComponent(requestedRange);

  const data = await fetchSheetsJson<GoogleValueRange>(
    `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodedRange}?majorDimension=ROWS`,
  );

  return {
    sheetId: tab.sheetId,
    title: tab.title,
    range: data.range ?? requestedRange,
    majorDimension: data.majorDimension ?? "ROWS",
    values: data.values ?? [],
  };
}

export async function getAllSpreadsheetTabValues(
  spreadsheetId: string,
  range = DEFAULT_RANGE,
): Promise<SpreadsheetTabValues[]> {
  const tabs = await getSpreadsheetTabs(spreadsheetId);
  const results: SpreadsheetTabValues[] = [];
  for (const tab of tabs) {
    const values = await getSpreadsheetTabValues(spreadsheetId, tab, range);
    results.push(values);
  }
  return results;
}
