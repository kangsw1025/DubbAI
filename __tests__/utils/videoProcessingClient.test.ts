import { extractAudioFromVideo } from "@/lib/utils/extractAudioClient";
import { muxAudioToVideo } from "@/lib/utils/muxAudioToVideo";

const loadMock = jest.fn().mockResolvedValue(undefined);
const writeFileMock = jest.fn().mockResolvedValue(undefined);
const execMock = jest.fn().mockResolvedValue(undefined);
const readFileMock = jest
  .fn()
  .mockResolvedValue(new Uint8Array([1, 2, 3]) as unknown as BlobPart);

jest.mock("@ffmpeg/ffmpeg", () => ({
  FFmpeg: jest.fn().mockImplementation(() => ({
    load: loadMock,
    writeFile: writeFileMock,
    exec: execMock,
    readFile: readFileMock,
  })),
}));

jest.mock("@ffmpeg/util", () => ({
  fetchFile: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  toBlobURL: jest.fn().mockImplementation(async (url: string) => url),
}));

describe("client video processing utils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("extractAudioFromVideo는 선택 구간만 ffmpeg로 추출해야 한다", async () => {
    const file = new File(["video"], "sample.mp4", { type: "video/mp4" });

    await extractAudioFromVideo(file, 12, 42);

    expect(execMock).toHaveBeenCalledWith([
      "-ss",
      "12",
      "-i",
      "input.mp4",
      "-t",
      "30",
      "-vn",
      "-acodec",
      "mp3",
      "-y",
      "output.mp3",
    ]);
  });

  it("muxAudioToVideo는 선택 구간 비디오에 더빙 오디오를 합성해야 한다", async () => {
    const file = new File(["video"], "sample.mp4", { type: "video/mp4" });
    const audio = new Blob(["audio"], { type: "audio/mpeg" });

    await muxAudioToVideo(file, audio, 5, 65);

    expect(execMock).toHaveBeenCalledWith([
      "-ss",
      "5",
      "-i",
      "input.mp4",
      "-t",
      "60",
      "-i",
      "dubbed.mp3",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-shortest",
      "-c:a",
      "aac",
      "-y",
      "output.mp4",
    ]);
  });
});
