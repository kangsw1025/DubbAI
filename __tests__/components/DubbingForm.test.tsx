import { render, screen, fireEvent } from "@testing-library/react";
import { DubbingForm } from "@/components/DubbingForm";

const mockOnSubmit = jest.fn();

describe("DubbingForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
