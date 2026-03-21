"use client";

import { useState, useRef, useEffect } from "react";
import type { DubbingFormProps, DubbingStatus } from "@/types";
import { CLIP_SECONDS } from "@/lib/utils/clipVideo";
import { isIOS, isAndroid } from "@/lib/utils/deviceDetect";

const LANGUAGES = [
  { code: "KO", label: "한국어" },
  { code: "EN-US", label: "영어" },
  { code: "JA", label: "일본어" },
  { code: "ZH", label: "중국어" },
  { code: "FR", label: "프랑스어" },
  { code: "DE", label: "독일어" },
  { code: "ES", label: "스페인어" },
];

// PC: captureStream + ffmpeg.wasm 기반
const PC_STEPS: { key: DubbingStatus; label: string; desc: string }[] = [
  { key: "clipping", label: "클립 준비", desc: "선택한 구간 녹화 중..." },
  { key: "processing", label: "더빙 처리", desc: "AI가 더빙 생성 중..." },
  { key: "muxing", label: "영상 합성", desc: "오디오를 영상에 합치는 중..." },
];

// 모바일 (Android + iOS): 오디오 추출 + 클라이언트 mux 기반
const MOBILE_STEPS: { key: DubbingStatus; label: string; desc: string }[] = [
  { key: "extracting", label: "오디오 추출", desc: "영상에서 음성 추출 중..." },
  { key: "processing", label: "더빙 처리", desc: "AI가 더빙 생성 중..." },
  { key: "muxing", label: "영상 합성", desc: "오디오를 영상에 합치는 중..." },
];

const PC_STEP_ORDER: DubbingStatus[] = [
  "clipping",
  "processing",
  "muxing",
  "success",
];
const MOBILE_STEP_ORDER: DubbingStatus[] = [
  "extracting",
  "processing",
  "muxing",
  "success",
];

function getStepState(
  stepKey: DubbingStatus,
  currentStatus: DubbingStatus,
  stepOrder: DubbingStatus[],
): "done" | "active" | "pending" {
  const stepIdx = stepOrder.indexOf(stepKey);
  const currentIdx = stepOrder.indexOf(currentStatus);
  if (currentIdx > stepIdx) return "done";
  if (currentIdx === stepIdx) return "active";
  return "pending";
}

function ProgressSteps({ status }: { status: DubbingStatus }) {
  const mobile = isIOS() || isAndroid();
  const steps = mobile ? MOBILE_STEPS : PC_STEPS;
  const stepOrder = mobile ? MOBILE_STEP_ORDER : PC_STEP_ORDER;

  return (
    <div className="mt-4 space-y-2">
      {steps.map((step) => {
        const state = getStepState(step.key, status, stepOrder);
        return (
          <div key={step.key} className="flex items-center gap-3">
            <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
              {state === "done" && (
                <svg
                  className="w-5 h-5 text-green-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
              {state === "active" && (
                <svg
                  className="w-5 h-5 text-blue-500 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
              )}
              {state === "pending" && (
                <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
              )}
            </div>
            <div>
              <span
                className={`text-sm font-medium ${
                  state === "done"
                    ? "text-green-600"
                    : state === "active"
                      ? "text-blue-600"
                      : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
              {state === "active" && (
                <p className="text-xs text-gray-500">{step.desc}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function DubbingForm({
  onSubmit,
  isProcessing,
  dubbingStatus,
}: DubbingFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("EN-US");
  const [startTime, setStartTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    setStartTime(0);
    setVideoDuration(0);

    if (!file || !file.type.startsWith("video/")) {
      previewUrlRef.current = null;
      return;
    }

    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    if (previewRef.current) previewRef.current.src = url;

    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, [file]);

  const handleLoadedMetadata = () => {
    const dur = previewRef.current?.duration ?? 0;
    if (isFinite(dur)) setVideoDuration(dur);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    setStartTime(t);
    if (previewRef.current) previewRef.current.currentTime = t;
  };

  const handleSubmit = async () => {
    if (!file) return;
    await onSubmit(file, targetLanguage, startTime);
  };

  const isVideoFile = file?.type.startsWith("video/") ?? false;
  const needsClipUI = isVideoFile && videoDuration > CLIP_SECONDS;
  const maxStart = Math.max(0, Math.floor(videoDuration) - CLIP_SECONDS);
  const endTime = Math.min(startTime + CLIP_SECONDS, videoDuration);

  const activeStatuses: DubbingStatus[] = [
    "clipping",
    "extracting",
    "processing",
    "muxing",
  ];
  const showProgress =
    isProcessing &&
    isVideoFile &&
    dubbingStatus &&
    activeStatuses.includes(dubbingStatus);

  return (
    <div>
      {/* File upload */}
      <div
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        role="button"
        aria-label="파일 업로드"
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors mb-4"
      >
        {file ? (
          <p className="text-gray-700 font-medium">{file.name}</p>
        ) : (
          <>
            <p className="text-gray-500">오디오 또는 비디오 파일 클릭하여 업로드</p>
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

      {/* 비디오 미리보기 + 구간 선택 */}
      {isVideoFile && file && (
        <div className="mb-4">
          <video
            ref={previewRef}
            className="w-full rounded-lg bg-black max-h-48 object-contain"
            onLoadedMetadata={handleLoadedMetadata}
            controls={!needsClipUI}
            muted
            playsInline
          />
          {needsClipUI && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>시작 지점</span>
                <span className="font-medium text-blue-600">
                  {formatTime(startTime)} ~ {formatTime(endTime)} (1분)
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={maxStart}
                step={1}
                value={startTime}
                onChange={handleSliderChange}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0:00</span>
                <span>{formatTime(videoDuration)}</span>
              </div>
            </div>
          )}
        </div>
      )}

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
        {isProcessing ? "처리 중..." : "더빙 시작"}
      </button>

      {/* 진행상황 — 비디오 처리 중일 때만 표시 */}
      {showProgress && dubbingStatus && (
        <ProgressSteps status={dubbingStatus} />
      )}
    </div>
  );
}
