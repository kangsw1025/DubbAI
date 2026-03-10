"use client";

import { useState, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

const LANGUAGES = [
  { code: "KO", label: "한국어" },
  { code: "EN-US", label: "영어" },
  { code: "JA", label: "일본어" },
  { code: "ZH", label: "중국어" },
  { code: "FR", label: "프랑스어" },
  { code: "DE", label: "독일어" },
  { code: "ES", label: "스페인어" },
];

export default function Home() {
  const { data: session, status } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("EN-US");
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDub = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setResultUrl(null);
    setTranscript(null);
    setTranslation(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("targetLanguage", targetLanguage);

    try {
      const res = await fetch("/api/dub", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "더빙 중 오류가 발생했습니다.");
      }

      setTranscript(data.transcript);
      setTranslation(data.translation);

      const audioBytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
      const blob = new Blob([audioBytes], { type: "audio/mpeg" });
      setResultUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setIsProcessing(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">DubbAI</h1>
          {session ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{session.user?.email}</span>
              <button
                onClick={() => signOut()}
                className="text-sm text-red-500 hover:underline"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <button
              onClick={() => signIn("google")}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Google 로그인
            </button>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="max-w-3xl mx-auto px-4 py-12">
        {!session ? (
          <div className="text-center py-20">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">AI 더빙 서비스</h2>
            <p className="text-gray-500 mb-2">오디오 또는 비디오 파일을 업로드하면</p>
            <p className="text-gray-500 mb-8">원하는 언어로 더빙된 결과물을 제공합니다.</p>
            <button
              onClick={() => signIn("google")}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-lg"
            >
              Google로 시작하기
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">파일 더빙</h2>

            {/* File upload */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors mb-4"
            >
              {file ? (
                <p className="text-gray-700 font-medium">{file.name}</p>
              ) : (
                <>
                  <p className="text-gray-500">오디오 또는 비디오 파일 클릭하여 업로드</p>
                  <p className="text-sm text-gray-400 mt-1">MP3, MP4, WAV, MOV 등 지원</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setResultUrl(null);
                  setTranscript(null);
                  setTranslation(null);
                  setError(null);
                }}
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              onClick={handleDub}
              disabled={!file || isProcessing}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? "더빙 처리 중..." : "더빙 시작"}
            </button>

            {/* Error */}
            {error && (
              <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Transcript & Translation */}
            {transcript && (
              <div className="mt-6 space-y-3">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-500 mb-1">원본 텍스트</p>
                  <p className="text-sm text-gray-700">{transcript}</p>
                </div>
                {translation && (
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-xs font-medium text-blue-500 mb-1">번역 텍스트</p>
                    <p className="text-sm text-blue-700">{translation}</p>
                  </div>
                )}
              </div>
            )}

            {/* Result */}
            {resultUrl && (
              <div className="mt-6 p-4 bg-green-50 rounded-lg">
                <p className="text-sm font-medium text-green-800 mb-3">더빙 완료!</p>
                <audio controls src={resultUrl} className="w-full mb-3" />
                <a
                  href={resultUrl}
                  download="dubbed.mp3"
                  className="inline-block px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                >
                  다운로드
                </a>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
