import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.MUX_URL;
  const token = process.env.MUX_AUTH_TOKEN ?? "";

  if (!url) {
    return NextResponse.json(
      { error: "MUX_URL not configured" },
      { status: 500 }
    );
  }

  return NextResponse.json({ url, token });
}
