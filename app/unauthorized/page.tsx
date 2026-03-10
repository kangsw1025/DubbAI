"use client";

import { signOut } from "next-auth/react";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
        <h1 className="text-2xl font-bold text-red-600 mb-4">접근 불가</h1>
        <p className="text-gray-600 mb-6">
          이 서비스는 허용된 사용자만 이용할 수 있습니다.
          <br />
          접근 권한이 없는 계정입니다.
        </p>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          다른 계정으로 로그인
        </button>
      </div>
    </div>
  );
}
