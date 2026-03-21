/**
 * @jest-environment node
 */

// Mock next/server before any imports to avoid Web API dependency
jest.mock("next/server", () => ({
  NextRequest: jest.fn(),
  NextResponse: class MockNextResponse {
    status: number;
    _body: unknown;
    _headers: Map<string, string>;

    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this._body = body;
      this.status = init?.status ?? 200;
      this._headers = new Map(Object.entries(init?.headers ?? {}));
    }

    async json() { return this._body; }
    async arrayBuffer() { return (this._body as Uint8Array).buffer; }
    get headers() {
      return { get: (key: string) => this._headers.get(key) ?? null };
    }

    static json(body: unknown, init?: { status?: number }) {
      const r = new MockNextResponse(body, init);
      r.json = async () => body;
      return r;
    }
  },
}));

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/services/dubbing.service", () => ({
  dubFile: jest.fn(),
}));

import { POST } from "@/app/api/dub/route";
import { getServerSession } from "next-auth";
import { dubFile } from "@/lib/services/dubbing.service";

type MockRequest = {
  formData: () => Promise<FormData>;
};

function makeRequest(formData?: FormData): MockRequest {
  return {
    formData: formData
      ? () => Promise.resolve(formData)
      : () => Promise.reject(new Error("bad form")),
  };
}

describe("POST /api/dub", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("미인증 요청 시 401을 반환해야 한다", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("form data 파싱 실패 시 400을 반환해야 한다", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { email: "test@test.com" } });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid form data");
  });

  it("file 누락 시 400을 반환해야 한다", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { email: "test@test.com" } });
    const fd = new FormData();
    fd.append("targetLanguage", "KO");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(fd) as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("file");
  });

  it("targetLanguage 누락 시 400을 반환해야 한다", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { email: "test@test.com" } });
    const fd = new FormData();
    fd.append("file", new File(["audio"], "test.mp3", { type: "audio/mp3" }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(fd) as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("targetLanguage");
  });

  it("성공 시 바이너리 오디오와 헤더에 텍스트를 반환해야 한다", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { email: "test@test.com" } });
    (dubFile as jest.Mock).mockResolvedValue({
      transcript: "Hello",
      translation: "안녕하세요",
      audioBuffer: Buffer.from("dubbed audio"),
    });

    const fd = new FormData();
    fd.append("file", new File(["audio"], "test.mp3", { type: "audio/mp3" }));
    fd.append("targetLanguage", "KO");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(fd) as any);
    expect(res.status).toBe(200);
    expect(decodeURIComponent(res.headers.get("X-Transcript") ?? "")).toBe("Hello");
    expect(decodeURIComponent(res.headers.get("X-Translation") ?? "")).toBe("안녕하세요");
  });

  it("서비스 오류 시 500을 반환해야 한다", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { email: "test@test.com" } });
    (dubFile as jest.Mock).mockRejectedValue(new Error("STT 실패"));

    const fd = new FormData();
    fd.append("file", new File(["audio"], "test.mp3", { type: "audio/mp3" }));
    fd.append("targetLanguage", "KO");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(fd) as any);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("STT 실패");
  });
});
