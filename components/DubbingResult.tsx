"use client";

import type { DubbingResultProps } from "@/types";

export function DubbingResult({ transcript, translation, audioUrl }: DubbingResultProps) {
  return (
    <div className="mt-6 space-y-4">
      {/* Transcript */}
      <div className="p-4 bg-gray-50 rounded-lg">
        <p className="text-xs font-medium text-gray-500 mb-1">원본 텍스트</p>
        <p className="text-sm text-gray-700">{transcript}</p>
      </div>

      {/* Translation */}
      <div className="p-4 bg-blue-50 rounded-lg">
        <p className="text-xs font-medium text-blue-500 mb-1">번역 텍스트</p>
        <p className="text-sm text-blue-700">{translation}</p>
      </div>

      {/* Audio player + download */}
      <div className="p-4 bg-green-50 rounded-lg">
        <p className="text-sm font-medium text-green-800 mb-3">더빙 완료!</p>
        <audio controls src={audioUrl} className="w-full mb-3" />
        <a
          href={audioUrl}
          download="dubbed.mp3"
          className="inline-block px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
        >
          다운로드
        </a>
      </div>
    </div>
  );
}
