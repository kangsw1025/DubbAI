"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export function Header() {
  const { data: session } = useSession();

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-3xl mx-auto px-4 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">DubbAI</h1>
        {session ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{session.user?.email}</span>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-sm text-red-500 hover:underline"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            Google 로그인
          </button>
        )}
      </div>
    </header>
  );
}
