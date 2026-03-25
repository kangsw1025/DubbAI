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

// PC: ffmpeg.wasm 전체 오디오 추출
const PC_STEPS: { key: DubbingStatus; label: string; desc: string }[] = [
  { key: "extracting", label: "오디오 추출", desc: "영상에서 음성 추출 중..." },
  { key: "processing", label: "더빙 처리", desc: "AI가 더빙 생성 중..." },
  { key: "muxing", label: "영상 합성", desc: "오디오를 영상에 합치는 중..." },
];

// iOS: AudioContext 기반
const IOS_STEPS: { key: DubbingStatus; label: string; desc: string }[] = [
  { key: "extracting", label: "오디오 추출", desc: "영상에서 음성 추출 중..." },
  { key: "processing", label: "더빙 처리", desc: "AI가 더빙 생성 중..." },
  { key: "muxing", label: "영상 합성", desc: "서버에서 영상 합치는 중..." },
];

const PC_STEP_ORDER: DubbingStatus[] = [
  "extracting",
  "processing",
  "muxing",
  "success",
];
const IOS_STEP_ORDER: DubbingStatus[] = [
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
  const ios = isIOS();
  const steps = ios ? IOS_STEPS : PC_STEPS;
  const stepOrder = ios ? IOS_STEP_ORDER : PC_STEP_ORDER;

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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function DubbingForm({
  onSubmit,
  isProcessing,
  dubbingStatus,
}: DubbingFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("EN-US");
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [previewTime, setPreviewTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);

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
    if (isFinite(dur) && dur > 0) {
      setVideoDuration(dur);
      setStartTime(0);
      setEndTime(dur);
      setPreviewTime(0);
    }
  };

  const isMobile = isIOS() || isAndroid();
  const maxClipDuration = isMobile ? CLIP_SECONDS : Number.POSITIVE_INFINITY;

  const syncPreviewTime = (nextPreviewTime: number) => {
    setPreviewTime(nextPreviewTime);
    if (previewRef.current) {
      previewRef.current.currentTime = nextPreviewTime;
    }
  };

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextStart = Number(e.target.value);
    let nextEnd = endTime || videoDuration;

    if (nextEnd <= nextStart) {
      nextEnd = Math.min(videoDuration, nextStart + 1);
    }
    if (isMobile && nextEnd - nextStart > maxClipDuration) {
      nextEnd = Math.min(videoDuration, nextStart + maxClipDuration);
    }

    setStartTime(nextStart);
    setEndTime(nextEnd);
    syncPreviewTime(clamp(previewTime, nextStart, nextEnd));
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextEnd = Number(e.target.value);
    let nextStart = startTime;

    if (nextEnd <= nextStart) {
      nextStart = Math.max(0, nextEnd - 1);
    }
    if (isMobile && nextEnd - nextStart > maxClipDuration) {
      nextStart = Math.max(0, nextEnd - maxClipDuration);
    }

    setStartTime(nextStart);
    setEndTime(nextEnd);
    syncPreviewTime(clamp(previewTime, nextStart, nextEnd));
  };

  const handlePreviewChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    syncPreviewTime(Number(e.target.value));
  };

  const handleSubmit = async () => {
    if (!file) return;
    await onSubmit(
      file,
      targetLanguage,
      startTime,
      isVideoFile && videoDuration > 0 ? endTime : 0,
    );
  };

  const isVideoFile = file?.type.startsWith("video/") ?? false;
  const showClipUI = isVideoFile && videoDuration > 0;
  const selectedDuration = Math.max(0, endTime - startTime);

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

  // iOS에서 200MB 초과 시 경고
  const isIOSLargeFile =
    isIOS() && isVideoFile && file && file.size > 200 * 1024 * 1024;

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
          onChange={(e) => {
            setStartTime(0);
            setEndTime(0);
            setPreviewTime(0);
            setVideoDuration(0);
            setFile(e.target.files?.[0] || null);
          }}
        />
      </div>

      {/* iOS 대용량 경고 */}
      {isIOSLargeFile && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          원본 파일이 크면 처리에 실패할 수 있습니다.
        </div>
      )}

      {/* 비디오 미리보기 + 구간 선택 */}
      {isVideoFile && file && (
        <div className="mb-4">
          <video
            ref={previewRef}
            className="w-full rounded-lg bg-black max-h-48 object-contain"
            onLoadedMetadata={handleLoadedMetadata}
            controls
            muted
            playsInline
          />
          {showClipUI && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between text-xs text-gray-500 mb-2">
                <span>선택 구간</span>
                <span className="font-medium text-blue-600">
                  {formatTime(startTime)} ~ {formatTime(endTime)} (
                  {formatTime(selectedDuration)})
                </span>
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>구간 선택</span>
                  <span>
                    {formatTime(startTime)} / {formatTime(endTime)}
                  </span>
                </div>
                <div className="relative h-8 flex items-center">
                  <div className="absolute inset-x-0 h-2 rounded-full bg-gray-200" />
                  <div
                    className="absolute h-2 rounded-full bg-blue-500"
                    style={{
                      left: `${(startTime / Math.max(videoDuration, 1)) * 100}%`,
                      width: `${(selectedDuration / Math.max(videoDuration, 1)) * 100}%`,
                    }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, Math.floor(videoDuration - 1))}
                    step={1}
                    value={startTime}
                    onChange={handleStartChange}
                    aria-label="구간 시작 선택"
                    className="absolute inset-x-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white"
                  />
                  <input
                    type="range"
                    min={1}
                    max={Math.max(1, Math.ceil(videoDuration))}
                    step={1}
                    value={Math.max(1, Math.round(endTime))}
                    onChange={handleEndChange}
                    aria-label="구간 종료 선택"
                    className="absolute inset-x-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white"
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>미리보기 위치</span>
                  <span>{formatTime(previewTime)}</span>
                </div>
                <input
                  type="range"
                  min={Math.floor(startTime)}
                  max={Math.max(Math.floor(startTime) + 1, Math.ceil(endTime))}
                  step={1}
                  value={clamp(Math.round(previewTime), Math.floor(startTime), Math.max(Math.floor(startTime) + 1, Math.ceil(endTime)))}
                  onChange={handlePreviewChange}
                  aria-label="미리보기 위치 선택"
                  className="w-full accent-blue-600"
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-2">
                <span>0:00</span>
                <span>{formatTime(videoDuration)}</span>
              </div>
              {isMobile && (
                <p className="text-xs text-gray-500 mt-2">
                  모바일에서는 최대 {formatTime(CLIP_SECONDS)}까지 선택할 수
                  있습니다.
                </p>
              )}
              {selectedDuration <= 0 && (
                <p className="text-xs text-red-500 mt-2">
                  종료 시간은 시작 시간보다 뒤여야 합니다.
                </p>
              )}
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
