import { test, expect } from "@playwright/test";

/**
 * 비인증 상태에서의 랜딩 페이지 E2E 테스트
 * next-auth 세션이 없는 상태를 시뮬레이션하기 위해 API를 인터셉트
 */
test.describe("랜딩 페이지 (비인증)", () => {
  test.beforeEach(async ({ page }) => {
    // NextAuth 세션 API 모킹 — 비인증 상태
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });
  });

  test("헤더에 DubbAI 타이틀이 표시되어야 한다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "DubbAI" })).toBeVisible();
  });

  test("헤더에 Google 로그인 버튼이 표시되어야 한다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Google 로그인" })).toBeVisible();
  });

  test("메인 영역에 서비스 소개 문구가 표시되어야 한다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "AI 더빙 서비스" })).toBeVisible();
    await expect(page.getByText("오디오 또는 비디오 파일을 업로드하면")).toBeVisible();
    await expect(page.getByText("원하는 언어로 더빙된 결과물을 제공합니다.")).toBeVisible();
  });

  test("메인 Google 시작 버튼이 표시되어야 한다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Google로 시작하기" })).toBeVisible();
  });

  test("더빙 폼이 표시되지 않아야 한다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("타겟 언어 선택")).not.toBeVisible();
  });
});
