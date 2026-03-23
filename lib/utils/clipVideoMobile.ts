"use client";

import type { MP4ClipResult } from "./mp4Clipper";

const MP4_COMPATIBLE_TYPES = new Set([
  "video/mp4",
  "video/quicktime", // iOS .mov
  "video/x-m4v",
]);

const MP4_COMPATIBLE_EXTS = new Set(["mp4", "mov", "m4v"]);

function isMP4Compatible(file: File): boolean {
  if (MP4_COMPATIBLE_TYPES.has(file.type)) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MP4_COMPATIBLE_EXTS.has(ext);
}

/**
 * iOS / Android 모바일 환경에서 클라이언트 사이드 크롭을 수행합니다.
 *
 * 우선순위:
 *  1. MP4/MOV → MP4Box.js (moov 파싱 + 필요 바이트만 로드, OOM 없음)
 *  2. 기타 포맷(WebM 등) → 서버 에러 메시지 throw (모바일 카메라는 사실상 전부 MP4/MOV)
 */
export async function clipVideoMobile(
  file: File,
  startTime: number,
): Promise<MP4ClipResult> {
  if (!isMP4Compatible(file)) {
    throw new Error(
      `이 포맷(${file.type || "알 수 없음"})은 모바일 크롭을 지원하지 않습니다. MP4 또는 MOV 파일을 사용해 주세요.`,
    );
  }

  const { clipMP4 } = await import("./mp4Clipper");
  return clipMP4(file, startTime, 60);
}
