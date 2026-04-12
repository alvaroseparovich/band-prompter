export type MusicSchemaRow = {
  Compassos: string;
  Description: string;
  Letra: string;
  Cifra: string;
};

/** Keys are cumulative compass offsets (see SPEC). */
export type MusicSchema = Record<number, MusicSchemaRow>;

export type ConfMap = Record<string, string>;

export type MusicDocument = {
  conf: ConfMap;
  music_schema: MusicSchema;
};
