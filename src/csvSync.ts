import { csvTextToMusicDocument } from "./csvMusic";
import { putMusic, type StoredMusic } from "./db";

const csvModules = import.meta.glob("../csvs/*.csv", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function titleFromDocument(
  doc: ReturnType<typeof csvTextToMusicDocument>,
  fileName: string,
): string {
  const keys = Object.keys(doc.music_schema)
    .map(Number)
    .sort((a, b) => a - b);
  const first = keys[0];
  if (first === undefined) return fileName.replace(/\.csv$/i, "");
  const d = doc.music_schema[first]!.Description.trim();
  return d || fileName.replace(/\.csv$/i, "");
}

export async function syncCsvFilesToDatabase(): Promise<void> {
  for (const path of Object.keys(csvModules)) {
    const raw = csvModules[path];
    const fileName = path.split("/").pop() ?? path;
    const doc = csvTextToMusicDocument(raw);
    const rec: StoredMusic = {
      id: fileName,
      title: titleFromDocument(doc, fileName),
      conf: doc.conf,
      music_schema: doc.music_schema,
      updatedAt: Date.now(),
    };
    await putMusic(rec);
  }
}
