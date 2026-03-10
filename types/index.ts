export interface DubbingResult {
  transcript: string;
  translation: string;
  audio: string; // base64 encoded mp3
}

export type DubbingStatus = "idle" | "processing" | "success" | "error";

export interface DubbingFormProps {
  onSubmit: (file: File, targetLanguage: string) => Promise<void>;
  isProcessing: boolean;
}

export interface DubbingResultProps {
  transcript: string;
  translation: string;
  audioUrl: string;
}
