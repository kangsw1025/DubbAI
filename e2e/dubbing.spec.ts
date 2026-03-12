import { test, expect, Page } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * 인증된 사용자의 더빙 플로우 E2E 테스트
 * next-auth 세션 API와 더빙 API를 모킹하여 외부 서비스 없이 테스트
 */

async function mockAuthSession(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { name: "Test User", email: "test@example.com" },
        expires: "2099-01-01T00:00:00.000Z",
      }),
    });
  });
}

test.describe("더빙 플로우 (인증된 사용자)", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
  });

  test("인증 후 더빙 폼이 표시되어야 한다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "파일 더빙" })).toBeVisible();
    await expect(page.getByRole("button", { name: "파일 업로드" })).toBeVisible();
    await expect(page.getByLabel("타겟 언어 선택")).toBeVisible();
  });

  test("헤더에 사용자 이메일과 로그아웃 버튼이 표시되어야 한다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("test@example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
  });

  test("파일 없이 더빙 시작 버튼이 비활성화되어야 한다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "더빙 시작" })).toBeDisabled();
  });

  test("파일 업로드 후 더빙 시작 버튼이 활성화되어야 한다", async ({ page }) => {
    await page.goto("/");

    // 임시 오디오 파일 생성 후 업로드
    const tempFile = path.join("/tmp", "test-audio.mp3");
    fs.writeFileSync(tempFile, Buffer.alloc(1024));

    const fileInput = page.getByTestId("file-input");
    await fileInput.setInputFiles(tempFile);

    await expect(page.getByRole("button", { name: "더빙 시작" })).toBeEnabled();
    await expect(page.getByText("test-audio.mp3")).toBeVisible();

    fs.unlinkSync(tempFile);
  });

  test("언어 드롭다운에서 언어를 선택할 수 있어야 한다", async ({ page }) => {
    await page.goto("/");

    const select = page.getByLabel("타겟 언어 선택");
    await expect(select).toBeVisible();

    await select.selectOption("KO");
    await expect(select).toHaveValue("KO");

    await select.selectOption("JA");
    await expect(select).toHaveValue("JA");
  });

  test("더빙 성공 시 결과가 표시되어야 한다", async ({ page }) => {
    // API 모킹
    await page.route("**/api/dub", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          transcript: "Hello, this is a test audio.",
          translation: "안녕하세요, 테스트 오디오입니다.",
          audio: btoa("fake-audio-data"),
        }),
      });
    });

    await page.goto("/");

    const tempFile = path.join("/tmp", "test-audio.mp3");
    fs.writeFileSync(tempFile, Buffer.alloc(1024));

    const fileInput = page.getByTestId("file-input");
    await fileInput.setInputFiles(tempFile);

    await page.getByRole("button", { name: "더빙 시작" }).click();

    // 결과 표시 확인
    await expect(page.getByText("원본 텍스트")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Hello, this is a test audio.")).toBeVisible();
    await expect(page.getByText("번역 텍스트")).toBeVisible();
    await expect(page.getByText("안녕하세요, 테스트 오디오입니다.")).toBeVisible();
    await expect(page.getByText("더빙 완료!")).toBeVisible();
    await expect(page.getByRole("link", { name: "더빙 오디오 다운로드" })).toBeVisible();

    fs.unlinkSync(tempFile);
  });

  test("더빙 API 오류 시 에러 메시지가 표시되어야 한다", async ({ page }) => {
    await page.route("**/api/dub", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "STT 처리 중 오류가 발생했습니다." }),
      });
    });

    await page.goto("/");

    const tempFile = path.join("/tmp", "test-audio-err.mp3");
    fs.writeFileSync(tempFile, Buffer.alloc(1024));

    const fileInput = page.getByTestId("file-input");
    await fileInput.setInputFiles(tempFile);

    await page.getByRole("button", { name: "더빙 시작" }).click();

    await expect(
      page.getByText("STT 처리 중 오류가 발생했습니다.")
    ).toBeVisible({ timeout: 10_000 });

    fs.unlinkSync(tempFile);
  });
});
