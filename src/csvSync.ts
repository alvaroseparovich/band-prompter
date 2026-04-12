import { csvTextToMusicDocument } from "./csvMusic";
import { putMusic, type StoredMusic } from "./db";

const csvModules = import.meta.glob("../csvs/*.csv", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

export async function syncCsvFilesToDatabase(): Promise<void> {
  for (const path of Object.keys(csvModules)) {
    const raw = csvModules[path];
    const fileName = path.split("/").pop() ?? path;
    const doc = csvTextToMusicDocument(raw);
    const rec: StoredMusic = {
      id: fileName,
      title: fileName,
      conf: doc.conf,
      music_schema: doc.music_schema,
      updatedAt: Date.now(),
    };
    await putMusic(rec);
  }
}
