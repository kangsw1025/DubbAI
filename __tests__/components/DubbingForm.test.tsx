jest.mock("@/lib/utils/deviceDetect", () => ({
  isIOS: jest.fn(),
  isAndroid: jest.fn(),
}));

import { render, screen, fireEvent } from "@testing-library/react";
import { DubbingForm } from "@/components/DubbingForm";
import { isIOS, isAndroid } from "@/lib/utils/deviceDetect";

const mockOnSubmit = jest.fn();
const mockIsIOS = isIOS as jest.MockedFunction<typeof isIOS>;
const mockIsAndroid = isAndroid as jest.MockedFunction<typeof isAndroid>;

const TIMELINE_LEFT = 100;
const TIMELINE_WIDTH = 400;

function loadVideoMetadata(duration: number) {
  const video = document.querySelector("video");
  if (!video) throw new Error("video element not found");
  Object.defineProperty(video, "duration", {
    configurable: true,
    value: duration,
  });
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    writable: true,
    value: 0,
  });
  fireEvent.loadedMetadata(video);
  return video;
}

function mockTimelineRect() {
  const timeline = screen.getByTestId("timeline-track");
  Object.defineProperty(timeline, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: TIMELINE_LEFT,
      top: 0,
      width: TIMELINE_WIDTH,
      height: 32,
      right: TIMELINE_LEFT + TIMELINE_WIDTH,
      bottom: 32,
      x: TIMELINE_LEFT,
      y: 0,
      toJSON: () => ({}),
    }),
  });
}

function clientXForTime(time: number, duration = 120) {
  return TIMELINE_LEFT + (time / duration) * TIMELINE_WIDTH;
}

function dragHandle(testId: string, targetTime: number, duration = 120) {
  fireEvent.pointerDown(screen.getByTestId(testId), {
    clientX: clientXForTime(0, duration),
  });
  fireEvent.mouseMove(document, {
    clientX: clientXForTime(targetTime, duration),
  });
  fireEvent.mouseUp(document);
}

describe("DubbingForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsIOS.mockReturnValue(false);
    mockIsAndroid.mockReturnValue(false);
    URL.createObjectURL = jest.fn().mockReturnValue("blob:preview");
    URL.revokeObjectURL = jest.fn();
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: jest.fn(),
    });
  });

  it("파일이 없으면 더빙 시작 버튼이 비활성화 되어야 한다", () => {
    render(<DubbingForm onSubmit={mockOnSubmit} isProcessing={false} />);

    expect(screen.getByRole("button", { name: "더빙 시작" })).toBeDisabled();
  });

  it("처리 중일 때 로딩 텍스트를 표시해야 한다", () => {
    render(<DubbingForm onSubmit={mockOnSubmit} isProcessing={true} />);

    expect(screen.getByText("처리 중...")).toBeInTheDocument();
  });

  it("처리 중일 때 버튼이 비활성화 되어야 한다", () => {
    render(<DubbingForm onSubmit={mockOnSubmit} isProcessing={true} />);

    expect(screen.getByRole("button", { name: "처리 중..." })).toBeDisabled();
  });

  it("언어 선택 드롭다운이 렌더링 되어야 한다", () => {
    render(<DubbingForm onSubmit={mockOnSubmit} isProcessing={false} />);

    expect(screen.getByLabelText("타겟 언어 선택")).toBeInTheDocument();
  });

  it("파일 업로드 후 파일명이 표시되어야 한다", () => {
    render(<DubbingForm onSubmit={mockOnSubmit} isProcessing={false} />);

    const input = screen.getByTestId("file-input");
    const file = new File(["audio content"], "test.mp3", { type: "audio/mp3" });

    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText("test.mp3")).toBeInTheDocument();
  });

  it("짧은 모바일 비디오도 시작/종료 crop UI를 표시해야 한다", () => {
    mockIsIOS.mockReturnValue(true);

    render(<DubbingForm onSubmit={mockOnSubmit} isProcessing={false} />);

    const input = screen.getByTestId("file-input");
    const file = new File(["video"], "short.mp4", { type: "video/mp4" });

    fireEvent.change(input, { target: { files: [file] } });
    loadVideoMetadata(45);
    mockTimelineRect();

    expect(screen.getByLabelText("구간 시작 선택")).toBeInTheDocument();
    expect(screen.getByLabelText("구간 종료 선택")).toBeInTheDocument();
    expect(screen.getByLabelText("미리보기 헤드 선택")).toBeInTheDocument();
    expect(
      screen.getByText("모바일에서는 최대 1:00까지 선택할 수 있습니다."),
    ).toBeInTheDocument();
  });

  it("비디오 제출 시 선택한 시작/종료 시간을 전달해야 한다", async () => {
    render(<DubbingForm onSubmit={mockOnSubmit} isProcessing={false} />);

    const input = screen.getByTestId("file-input");
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });

    fireEvent.change(input, { target: { files: [file] } });
    loadVideoMetadata(120);
    mockTimelineRect();

    dragHandle("start-handle", 10);
    dragHandle("end-handle", 50);
    fireEvent.click(screen.getByRole("button", { name: "더빙 시작" }));

    expect(mockOnSubmit).toHaveBeenCalledWith(file, "EN-US", 10, 50);
  });

  it("모바일에서는 종료 시간을 옮기면 선택 구간을 60초 이내로 보정해야 한다", () => {
    mockIsAndroid.mockReturnValue(true);

    render(<DubbingForm onSubmit={mockOnSubmit} isProcessing={false} />);

    const input = screen.getByTestId("file-input");
    const file = new File(["video"], "mobile.mp4", { type: "video/mp4" });

    fireEvent.change(input, { target: { files: [file] } });
    loadVideoMetadata(120);
    mockTimelineRect();

    dragHandle("end-handle", 90);

    expect(screen.getByTestId("selection-summary")).toHaveTextContent(
      "0:30 ~ 1:30 (1:00)",
    );
  });

  it("PC에서는 60초보다 긴 선택 구간도 유지해야 한다", () => {
    render(<DubbingForm onSubmit={mockOnSubmit} isProcessing={false} />);

    const input = screen.getByTestId("file-input");
    const file = new File(["video"], "desktop.mp4", { type: "video/mp4" });

    fireEvent.change(input, { target: { files: [file] } });
    loadVideoMetadata(180);
    mockTimelineRect();

    dragHandle("end-handle", 120, 180);

    expect(screen.getByTestId("selection-summary")).toHaveTextContent(
      "0:00 ~ 2:00 (2:00)",
    );
  });

  it("빈 타임라인 클릭으로는 값이 바뀌지 않아야 한다", () => {
    render(<DubbingForm onSubmit={mockOnSubmit} isProcessing={false} />);

    const input = screen.getByTestId("file-input");
    const file = new File(["video"], "preview.mp4", { type: "video/mp4" });

    fireEvent.change(input, { target: { files: [file] } });
    loadVideoMetadata(120);
    mockTimelineRect();

    fireEvent.pointerDown(screen.getByTestId("timeline-track"), {
      clientX: clientXForTime(90),
    });
    fireEvent.mouseUp(document);

    expect(screen.getByTestId("playhead-time-label")).toHaveTextContent("0:00");
  });

  it("미리보기 헤드는 드래그로만 선택 구간 안에서 움직여야 한다", () => {
    render(<DubbingForm onSubmit={mockOnSubmit} isProcessing={false} />);

    const input = screen.getByTestId("file-input");
    const file = new File(["video"], "preview.mp4", { type: "video/mp4" });

    fireEvent.change(input, { target: { files: [file] } });
    loadVideoMetadata(120);
    mockTimelineRect();

    dragHandle("start-handle", 20);
    dragHandle("end-handle", 40);
    dragHandle("playhead-handle", 30);

    expect(screen.getByTestId("playhead-time-label")).toHaveTextContent("0:30");
  });

  it("시작 핸들을 플레이헤드 너머로 드래그하면 플레이헤드가 같이 움직여야 한다", () => {
    render(<DubbingForm onSubmit={mockOnSubmit} isProcessing={false} />);

    const input = screen.getByTestId("file-input");
    const file = new File(["video"], "follow-start.mp4", { type: "video/mp4" });

    fireEvent.change(input, { target: { files: [file] } });
    loadVideoMetadata(120);
    mockTimelineRect();

    dragHandle("playhead-handle", 20);
    dragHandle("start-handle", 30);

    expect(screen.getByTestId("playhead-time-label")).toHaveTextContent("0:30");
    expect(screen.getByTestId("selection-summary")).toHaveTextContent(
      "0:30 ~ 2:00 (1:30)",
    );
  });

  it("종료 핸들을 플레이헤드 안쪽으로 드래그하면 플레이헤드가 같이 움직여야 한다", () => {
    render(<DubbingForm onSubmit={mockOnSubmit} isProcessing={false} />);

    const input = screen.getByTestId("file-input");
    const file = new File(["video"], "follow-end.mp4", { type: "video/mp4" });

    fireEvent.change(input, { target: { files: [file] } });
    loadVideoMetadata(120);
    mockTimelineRect();

    dragHandle("playhead-handle", 90);
    dragHandle("end-handle", 80);

    expect(screen.getByTestId("playhead-time-label")).toHaveTextContent("1:20");
    expect(screen.getByTestId("selection-summary")).toHaveTextContent(
      "0:00 ~ 1:20 (1:20)",
    );
  });

  it("재생 중에는 미리보기 위치가 현재 재생 시간을 따라가야 한다", () => {
    render(<DubbingForm onSubmit={mockOnSubmit} isProcessing={false} />);

    const input = screen.getByTestId("file-input");
    const file = new File(["video"], "timeline.mp4", { type: "video/mp4" });

    fireEvent.change(input, { target: { files: [file] } });
    const video = loadVideoMetadata(120) as HTMLVideoElement;
    mockTimelineRect();

    dragHandle("start-handle", 20);
    dragHandle("end-handle", 40);

    Object.defineProperty(video, "currentTime", {
      configurable: true,
      writable: true,
      value: 32,
    });
    fireEvent.timeUpdate(video);

    expect(screen.getByTestId("playhead-time-label")).toHaveTextContent("0:32");
  });

  it("재생이 선택 종료 시간을 넘기면 미리보기가 종료 지점에서 멈춰야 한다", () => {
    render(<DubbingForm onSubmit={mockOnSubmit} isProcessing={false} />);

    const input = screen.getByTestId("file-input");
    const file = new File(["video"], "stop.mp4", { type: "video/mp4" });

    fireEvent.change(input, { target: { files: [file] } });
    const video = loadVideoMetadata(120) as HTMLVideoElement;
    mockTimelineRect();
    const pauseMock = jest.fn();
    Object.defineProperty(video, "pause", {
      configurable: true,
      value: pauseMock,
    });

    dragHandle("start-handle", 20);
    dragHandle("end-handle", 40);

    Object.defineProperty(video, "currentTime", {
      configurable: true,
      writable: true,
      value: 45,
    });
    fireEvent.timeUpdate(video);

    expect(screen.getByTestId("playhead-time-label")).toHaveTextContent("0:40");
    expect(pauseMock).toHaveBeenCalled();
  });
});
