"use client";

import { useState, useRef } from "react";
import type { DubbingFormProps } from "@/types";

const LANGUAGES = [
  { code: "KO", label: "한국어" },
  { code: "EN-US", label: "영어" },
  { code: "JA", label: "일본어" },
  { code: "ZH", label: "중국어" },
  { code: "FR", label: "프랑스어" },
  { code: "DE", label: "독일어" },
  { code: "ES", label: "스페인어" },
];

export function DubbingForm({
  onSubmit,
  isProcessing,
  dubbingStatus,
}: DubbingFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("EN-US");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (!file) return;
    await onSubmit(file, targetLanguage);
  };

  return (
    <div>
      {/* File upload */}
      <div
        onClick={() => fileInputRef.current?.click()}
        role="button"
        aria-label="파일 업로드"
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors mb-4"
      >
        {file ? (
          <p className="text-gray-700 font-medium">{file.name}</p>
        ) : (
          <>
            <p className="text-gray-500">
              오디오 또는 비디오 파일 클릭하여 업로드
            </p>
            <p className="text-sm text-gray-400 mt-1">
              MP3, MP4, WAV, MOV 등 지원
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,video/*"
          className="hidden"
          data-testid="file-input"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>

      {/* Language select */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          타겟 언어
        </label>
        <select
          value={targetLanguage}
          onChange={(e) => setTargetLanguage(e.target.value)}
          aria-label="타겟 언어 선택"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!file || isProcessing}
        className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {dubbingStatus === "extracting"
          ? "오디오 추출 중..."
          : dubbingStatus === "muxing"
            ? "영상 합성 중..."
            : isProcessing
              ? "더빙 처리 중..."
              : "더빙 시작"}
      </button>
    </div>
  );
}
