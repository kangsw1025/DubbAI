"use client";

import { useSession, signIn } from "next-auth/react";
import { Header } from "@/components/Header";
import { DubbingForm } from "@/components/DubbingForm";
import { DubbingResult } from "@/components/DubbingResult";
import { useDubbing } from "@/hooks/useDubbing";

export default function Home() {
  const { data: session, status } = useSession();
  const { status: dubbingStatus, result, audioUrl, error, dub } = useDubbing();

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-3xl mx-auto px-4 py-12">
        {!session ? (
          <div className="text-center py-20">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">AI 더빙 서비스</h2>
            <p className="text-gray-500 mb-2">오디오 또는 비디오 파일을 업로드하면</p>
            <p className="text-gray-500 mb-8">원하는 언어로 더빙된 결과물을 제공합니다.</p>
            <button
              onClick={() => signIn("google", { callbackUrl: "/" })}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-lg"
            >
              Google로 시작하기
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">파일 더빙</h2>

            <DubbingForm
              onSubmit={dub}
              isProcessing={dubbingStatus === "processing"}
            />

            {error && (
              <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-lg text-sm">
                {error}
              </div>
            )}

            {dubbingStatus === "success" && result && audioUrl && (
              <DubbingResult
                transcript={result.transcript}
                translation={result.translation}
                audioUrl={audioUrl}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
