import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { dubFile } from "@/lib/services/dubbing.service";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const targetLanguage = formData.get("targetLanguage") as string | null;

  if (!file || !targetLanguage) {
    return NextResponse.json(
      { error: "file과 targetLanguage가 필요합니다." },
      { status: 400 }
    );
  }

  try {
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const result = await dubFile(fileBuffer, file.name, file.type, targetLanguage);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
