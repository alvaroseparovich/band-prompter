type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

declare const __G_CLOUD_CLIENT_ID__: string;

type GoogleTokenClient = {
  callback: (resp: GoogleTokenResponse) => void;
  requestAccessToken: (opts?: { prompt?: string }) => void;
};

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

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (opts: {
            client_id: string;
            scope: string;
            callback: (resp: GoogleTokenResponse) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

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

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4";
const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const DEFAULT_RANGE = "A:G";

let gisLoaderPromise: Promise<void> | null = null;
let tokenClient: GoogleTokenClient | null = null;
let accessToken: string | null = null;
let tokenExpiresAt = 0;

function getGoogleClientId(): string {
  const id = __G_CLOUD_CLIENT_ID__;
  if (!id || id.trim() === "") {
    throw new Error("Missing G_CLOUD_CLIENT_ID in environment.");
  }
  return id.trim();
}

function ensureGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoaderPromise) return gisLoaderPromise;

  gisLoaderPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SCRIPT_URL}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Google Identity script.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity script."));
    document.head.appendChild(script);
  });

  return gisLoaderPromise;
}

async function ensureTokenClient(): Promise<GoogleTokenClient> {
  if (tokenClient) return tokenClient;

  await ensureGisScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error("Google Identity SDK is unavailable.");
  }

  tokenClient = oauth2.initTokenClient({
    client_id: getGoogleClientId(),
    scope: SHEETS_SCOPE,
    callback: () => {
      // callback is set per-request in requestAccessToken
    },
  });
  return tokenClient;
}

export async function requestSheetsAccessToken(): Promise<string> {
  const now = Date.now();
  if (accessToken && now < tokenExpiresAt - 5_000) {
    return accessToken;
  }

  const client = await ensureTokenClient();
  return new Promise<string>((resolve, reject) => {
    client.callback = (resp: GoogleTokenResponse) => {
      if (!resp.access_token) {
        const msg = resp.error_description ?? resp.error ?? "Token request failed.";
        reject(new Error(msg));
        return;
      }
      accessToken = resp.access_token;
      const expiresIn = typeof resp.expires_in === "number" ? resp.expires_in : 3600;
      tokenExpiresAt = Date.now() + expiresIn * 1000;
      resolve(accessToken);
    };
    client.requestAccessToken({ prompt: "consent" });
  });
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

async function fetchWithAuth<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${SHEETS_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Google Sheets API ${res.status}: ${details || res.statusText}`);
  }

  return (await res.json()) as T;
}

export async function getSpreadsheetTabs(spreadsheetId: string): Promise<SpreadsheetTab[]> {
  const token = await requestSheetsAccessToken();
  const params = new URLSearchParams({
    fields: "sheets(properties(sheetId,title))",
  });
  const data = await fetchWithAuth<GoogleSpreadsheetResponse>(
    `/spreadsheets/${encodeURIComponent(spreadsheetId)}?${params.toString()}`,
    token,
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
  const token = await requestSheetsAccessToken();
  const requestedRange = `${escapeSheetTitleForRange(tab.title)}!${range}`;
  const encodedRange = encodeURIComponent(requestedRange);

  const data = await fetchWithAuth<GoogleValueRange>(
    `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodedRange}?majorDimension=ROWS`,
    token,
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
