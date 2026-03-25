"use client";

import { useState, useRef, useEffect } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
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
  const timelineRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("EN-US");
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [previewTime, setPreviewTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const activeDragRef = useRef<"start" | "playhead" | "end" | null>(null);

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
  const timelineDivisor = Math.max(videoDuration, 1);
  const segmentStartPercent = (startTime / timelineDivisor) * 100;
  const segmentEndPercent = (endTime / timelineDivisor) * 100;
  const playheadPercent =
    (clamp(previewTime, startTime, endTime) / timelineDivisor) * 100;

  const timeFromClientX = (clientX: number) => {
    const timeline = timelineRef.current;
    if (!timeline) return 0;
    if (!Number.isFinite(clientX)) return 0;

    const rect = timeline.getBoundingClientRect();
    if (rect.width <= 0) return 0;

    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return Math.round(ratio * videoDuration);
  };

  useEffect(() => {
    if (!showClipUI) return;

    const processDrag = (clientX: number) => {
      const dragType = activeDragRef.current;
      if (!dragType) return;

      const rawTime = timeFromClientX(clientX);

      if (dragType === "start") {
        let nextStart = clamp(rawTime, 0, Math.max(endTime - 1, 0));
        let nextEnd = endTime;
        let nextPreviewTime = previewTime;

        if (isMobile && nextEnd - nextStart > maxClipDuration) {
          nextEnd = Math.min(videoDuration, nextStart + maxClipDuration);
        }
        if (nextPreviewTime < nextStart) {
          nextPreviewTime = nextStart;
        }

        setStartTime(nextStart);
        setEndTime(nextEnd);
        syncPreviewTime(clamp(nextPreviewTime, nextStart, nextEnd));
        return;
      }

      if (dragType === "end") {
        let nextEnd = clamp(rawTime, startTime + 1, videoDuration);
        let nextStart = startTime;
        let nextPreviewTime = previewTime;

        if (isMobile && nextEnd - nextStart > maxClipDuration) {
          nextStart = Math.max(0, nextEnd - maxClipDuration);
        }
        if (nextPreviewTime > nextEnd) {
          nextPreviewTime = nextEnd;
        }

        setStartTime(nextStart);
        setEndTime(nextEnd);
        syncPreviewTime(clamp(nextPreviewTime, nextStart, nextEnd));
        return;
      }

      const nextPreviewTime = clamp(rawTime, startTime, endTime);
      syncPreviewTime(nextPreviewTime);
    };

    const handlePointerMove = (event: PointerEvent) => {
      processDrag(event.clientX);
    };

    const handleMouseMove = (event: MouseEvent) => {
      processDrag(event.clientX);
    };

    const handlePointerUp = () => {
      activeDragRef.current = null;
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handlePointerUp);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handlePointerUp);
    };
  }, [
    endTime,
    isMobile,
    maxClipDuration,
    previewTime,
    showClipUI,
    startTime,
    videoDuration,
  ]);

  const beginDrag =
    (dragType: "start" | "playhead" | "end") =>
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      activeDragRef.current = dragType;
    };

  useEffect(() => {
    const video = previewRef.current;
    if (!video || !showClipUI) return;

    const handleTimeUpdate = () => {
      const nextTime = clamp(video.currentTime, startTime, endTime);
      if (video.currentTime >= endTime) {
        video.currentTime = endTime;
        video.pause();
      }
      setPreviewTime(nextTime);
    };

    const handlePlay = () => {
      if (video.currentTime < startTime || video.currentTime > endTime) {
        video.currentTime = startTime;
        setPreviewTime(startTime);
      }
    };

    const handleSeeked = () => {
      if (video.currentTime < startTime || video.currentTime > endTime) {
        const nextTime = clamp(video.currentTime, startTime, endTime);
        video.currentTime = nextTime;
        setPreviewTime(nextTime);
        return;
      }
      setPreviewTime(video.currentTime);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlay);
    video.addEventListener("seeked", handleSeeked);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("seeked", handleSeeked);
    };
  }, [startTime, endTime, showClipUI]);

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
                <span
                  className="font-medium text-blue-600"
                  data-testid="selection-summary"
                >
                  {formatTime(startTime)} ~ {formatTime(endTime)} (
                  {formatTime(selectedDuration)})
                </span>
              </div>
              <div className="mb-3">
                <div
                  ref={timelineRef}
                  className="relative h-8 touch-none flex items-center"
                  data-testid="timeline-track"
                >
                  <div className="absolute inset-x-0 h-2 rounded-full bg-gray-200" />
                  <div
                    className="absolute h-2 rounded-full bg-blue-500"
                    style={{
                      left: `${segmentStartPercent}%`,
                      width: `${(selectedDuration / timelineDivisor) * 100}%`,
                    }}
                  />
                  <button
                    type="button"
                    onPointerDown={beginDrag("playhead")}
                    aria-label="미리보기 헤드 선택"
                    data-testid="playhead-handle"
                    className="absolute top-1/2 touch-none -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${playheadPercent}%`,
                    }}
                  >
                    <div
                      className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap"
                      data-testid="playhead-time-label"
                    >
                      {formatTime(previewTime)}
                    </div>
                    <div className="absolute left-1/2 top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-red-500" />
                  </button>
                  <button
                    type="button"
                    onPointerDown={beginDrag("start")}
                    aria-label="구간 시작 선택"
                    data-testid="start-handle"
                    className="absolute top-1/2 h-5 w-2 touch-none -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 shadow-sm"
                    style={{ left: `${segmentStartPercent}%` }}
                  />
                  <button
                    type="button"
                    onPointerDown={beginDrag("end")}
                    aria-label="구간 종료 선택"
                    data-testid="end-handle"
                    className="absolute top-1/2 h-5 w-2 touch-none -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 shadow-sm"
                    style={{ left: `${segmentEndPercent}%` }}
                  />
                </div>
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
