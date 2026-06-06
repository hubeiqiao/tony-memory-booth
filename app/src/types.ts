export type Mode = "booth" | "phone";

export interface Contact {
  name?: string;
  email?: string;
  phone?: string;
}

export interface Consent {
  accepted: boolean;
  text: string;
  version: string;
}

export interface RecordingMeta {
  id: string; // client ULID (idempotency token)
  createdAt: number; // client clock
  mode: Mode;
  durationMs: number;
  mimeType: string;
  ext: string;
  sizeBytes: number;
  consent: Consent;
  contact?: Contact;
  appVersion: string;
}

export type UploadStatus = "buffered" | "uploading" | "complete" | "partial";
