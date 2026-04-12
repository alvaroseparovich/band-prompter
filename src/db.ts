import type { ConfMap, MusicSchema } from "./musicTypes";

const DB_NAME = "musical-show-helper";
const DB_VERSION = 1;
const STORE = "musics";

export type StoredMusic = {
  id: string;
  title: string;
  conf: ConfMap;
  music_schema: MusicSchema;
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("indexedDB.open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
  });
}

export async function putMusic(record: StoredMusic): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("putMusic transaction failed"));
    tx.objectStore(STORE).put(record);
  });
  db.close();
}

export async function getAllMusics(): Promise<StoredMusic[]> {
  const db = await openDb();
  const out = await new Promise<StoredMusic[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as StoredMusic[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("getAll failed"));
  });
  db.close();
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

export async function getMusic(id: string): Promise<StoredMusic | undefined> {
  const db = await openDb();
  const out = await new Promise<StoredMusic | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as StoredMusic | undefined);
    req.onerror = () => reject(req.error ?? new Error("get failed"));
  });
  db.close();
  return out;
}

export async function deleteMusic(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("deleteMusic transaction failed"));
    tx.objectStore(STORE).delete(id);
  });
  db.close();
}
