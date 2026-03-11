export interface DubbingResult {
  transcript: string;
  translation: string;
  audio: string; // base64 encoded mp3
}

export type DubbingStatus =
  | "idle"
  | "extracting"
  | "processing"
  | "muxing"
  | "success"
  | "error";

export interface DubbingFormProps {
  onSubmit: (file: File, targetLanguage: string) => Promise<void>;
  isProcessing: boolean;
  dubbingStatus?: DubbingStatus;
}

export interface DubbingResultProps {
  transcript: string;
  translation: string;
  mediaUrl: string;
  isVideo: boolean;
}
