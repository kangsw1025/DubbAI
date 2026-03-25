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

function loadVideoMetadata(duration: number) {
  const video = document.querySelector("video");
  if (!video) throw new Error("video element not found");
  Object.defineProperty(video, "duration", {
    configurable: true,
    value: duration,
  });
  fireEvent.loadedMetadata(video);
  return video;
}

describe("DubbingForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsIOS.mockReturnValue(false);
    mockIsAndroid.mockReturnValue(false);
    URL.createObjectURL = jest.fn().mockReturnValue("blob:preview");
    URL.revokeObjectURL = jest.fn();
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

    expect(screen.getByLabelText("구간 시작 선택")).toBeInTheDocument();
    expect(screen.getByLabelText("구간 종료 선택")).toBeInTheDocument();
    expect(screen.getByLabelText("미리보기 위치 선택")).toBeInTheDocument();
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

    fireEvent.change(screen.getByLabelText("구간 시작 선택"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("구간 종료 선택"), {
      target: { value: "50" },
    });
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

    fireEvent.change(screen.getByLabelText("구간 종료 선택"), {
      target: { value: "90" },
    });

    expect(screen.getByText("0:30 ~ 1:30 (1:00)")).toBeInTheDocument();
  });

  it("PC에서는 60초보다 긴 선택 구간도 유지해야 한다", () => {
    render(<DubbingForm onSubmit={mockOnSubmit} isProcessing={false} />);

    const input = screen.getByTestId("file-input");
    const file = new File(["video"], "desktop.mp4", { type: "video/mp4" });

    fireEvent.change(input, { target: { files: [file] } });
    loadVideoMetadata(180);

    fireEvent.change(screen.getByLabelText("구간 종료 선택"), {
      target: { value: "120" },
    });

    expect(screen.getByText("0:00 ~ 2:00 (2:00)")).toBeInTheDocument();
  });

  it("미리보기 슬라이더는 선택 구간 안에서만 움직여야 한다", () => {
    render(<DubbingForm onSubmit={mockOnSubmit} isProcessing={false} />);

    const input = screen.getByTestId("file-input");
    const file = new File(["video"], "preview.mp4", { type: "video/mp4" });

    fireEvent.change(input, { target: { files: [file] } });
    loadVideoMetadata(120);

    fireEvent.change(screen.getByLabelText("구간 시작 선택"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("구간 종료 선택"), {
      target: { value: "40" },
    });
    fireEvent.change(screen.getByLabelText("미리보기 위치 선택"), {
      target: { value: "30" },
    });

    expect(screen.getByText("0:30")).toBeInTheDocument();
  });
});
