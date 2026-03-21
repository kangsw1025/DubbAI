# DubbAI 개발 계획

---

## 프로젝트 개요

오디오/비디오 파일을 업로드하면 원하는 언어로 더빙된 결과물을 제공하는 AI 더빙 웹 서비스

**처리 흐름:**
```
파일 업로드 → 음성 추출/전사 (ElevenLabs STT) → 번역 (DeepL API) → 더빙 합성 (ElevenLabs TTS) → 재생/다운로드
```

---

## 기술 스택

| 역할 | 기술 |
|------|------|
| 프레임워크 | Next.js (App Router) |
| DB | Turso (libsql) |
| 인증 | NextAuth.js + Google OAuth |
| STT/TTS | ElevenLabs API |
| 번역 | DeepL API (무료) |
| 배포 | Vercel (GitHub 자동 배포) |
| 모바일 ffmpeg 서버 | Railway (외부 마이크로서비스) |
| 클라이언트 영상 클립 | ffmpeg.wasm (PC), captureStream (Android) |

---

## 환경변수 목록

```env
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
ELEVENLABS_API_KEY=
DEEPL_API_KEY=
MUX_URL=                  # Railway 서버 URL (서버 사이드 전용)
MUX_AUTH_TOKEN=           # Railway 인증 토큰 (서버 사이드 전용, NEXT_PUBLIC 금지)
```

**Railway 서버 환경변수** (`dubbai-mux-server`):
```env
MUX_AUTH_TOKEN=           # Vercel과 동일한 값
PORT=                     # Railway 자동 주입
```

---

## 개발 단계

### Phase 1 — 프로젝트 초기 설정
- [x] Next.js 프로젝트 생성 (App Router, TypeScript)
- [x] 폴더 구조 설계
- [x] Turso 연결 설정 (`@libsql/client`)
- [x] 환경변수 `.env.local` 구성

### Phase 2 — DB 스키마 & 초기 데이터
- [x] Turso `allowed_users` 테이블 생성
  - `id` INTEGER PRIMARY KEY
  - `email` TEXT UNIQUE NOT NULL
  - `created_at` TEXT DEFAULT CURRENT_TIMESTAMP
- [x] `kts123@estsoft.com` 초기 데이터 삽입

### Phase 3 — Google OAuth + 화이트리스트
- [x] NextAuth.js 설치 및 설정
- [x] Google OAuth Provider 연동
- [x] 로그인 후 이메일 화이트리스트 검증
- [x] 미들웨어 (`middleware.ts`) 구현 — 비허용 사용자 차단
- [x] 접근 차단 안내 페이지 (`/unauthorized`)

### Phase 4 — AI 더빙 서비스 (핵심)
- [x] 파일 업로드 UI (오디오/비디오, 타겟 언어 선택)
- [x] 파일 업로드 API Route (`/api/dub`)
- [x] ElevenLabs STT — 음성 → 텍스트 전사
- [x] DeepL API — 텍스트 번역 (타겟 언어로, 무료 월 500,000자)
- [x] ElevenLabs TTS — 번역 텍스트 → 더빙 음성 합성
- [x] 결과물 재생 UI + 다운로드 기능


### Phase 5 — 아키텍처 리팩토링 + 테스트 코드 구현

- [x] 패키지 설치 (`jest`, `@testing-library/react`, `@types/jest`)
- [x] jest 설정 (`jest.config.ts`, `jest.setup.ts`)
- [x] `lib/services/` 서비스 계층 분리
  - [x] `elevenlabs.service.ts`
  - [x] `deepl.service.ts`
  - [x] `ffmpeg.service.ts`
  - [x] `dubbing.service.ts` (오케스트레이션)
- [x] `components/` UI 컴포넌트 분리
  - [x] `Header.tsx`
  - [x] `DubbingForm.tsx`
  - [x] `DubbingResult.tsx`
- [x] `hooks/useDubbing.ts` Custom Hook 분리
- [x] `types/index.ts` 타입 정의
- [x] `app/api/dub/route.ts` 리팩토링 (서비스 위임)
- [x] `app/page.tsx` 리팩토링 (컴포넌트 조합)
- [x] 유닛 테스트 작성 (서비스 계층)
- [x] 컴포넌트 테스트 작성
- [x] API 통합 테스트 작성
- [x] E2E 테스트 작성 (Playwright) — 12개 테스트 전체 통과

### Phase 6 — 배포 자동화
- [x] Vercel 프로젝트 연동
- [x] GitHub push → 자동 배포 확인
- [x] Vercel 환경변수 등록
- [x] 배포 URL 확인 및 서비스 동작 검증

### Phase 7 — 문서화
- [x] README.md 완성 (배포 URL 포함, 에이전트 활용 노하우)

### Phase 8 — 모바일 더빙 지원 (Railway ffmpeg 서버)

**배경:** Vercel Lambda는 read-only 파일시스템 + 실행 파일 제한으로 ffmpeg 직접 실행 불가.
외부 ffmpeg 마이크로서비스(Railway)를 별도 레포(`dubbai-mux-server`)로 구성.

#### OS별 더빙 처리 플로우

| 환경 | 클립 방식 | 오디오 추출 | mux |
|------|----------|------------|-----|
| PC | ffmpeg.wasm (클라이언트) | captureStream | ffmpeg.wasm (클라이언트) |
| Android | captureStream 1분 클립 (클라이언트) | captureStream | Railway `/mux` |
| iOS | 원본 그대로 전송 | Railway `/prepare` | Railway `/mux-session` |

#### iOS 단일 업로드 구조 (세션 기반)

iOS는 captureStream 미지원이라 클라이언트 클립 불가. 원본 영상을 한 번만 업로드하도록 세션 방식 사용:

```
1. 원본 영상 → Railway POST /prepare
   └→ 세션ID + 1분 추출 오디오 반환 (영상은 Railway 디스크에 10분 보관)

2. 오디오 → Vercel POST /api/dub
   └→ STT + 번역 + TTS → 더빙 오디오

3. 세션ID + 더빙 오디오(mp3) → Railway POST /mux-session
   └→ 보관된 영상 클립 + mux → 완성 영상 반환 (세션 자동 삭제)
```

#### Railway 엔드포인트

| 엔드포인트 | 용도 | 호출 주체 |
|-----------|------|---------|
| `POST /prepare` | 원본 영상 수신 + 오디오 추출 + 세션 저장 | iOS |
| `POST /mux-session` | 세션 영상 + 더빙 오디오 → mux | iOS |
| `POST /mux` | 클립된 영상 + 더빙 오디오 → mux | Android |
| `GET /health` | 헬스체크 | - |

#### 보안
- `MUX_AUTH_TOKEN`은 서버 사이드 전용 (`NEXT_PUBLIC_` 사용 금지)
- Vercel `GET /api/mux-token` 라우트가 인증된 클라이언트에게 토큰 전달
- Railway 모든 엔드포인트 `Authorization: Bearer` 검증

#### Railway 서버 구성
- Node.js 20 + Express + multer (diskStorage) + ffmpeg-static
- Dockerfile로 빌드 (ffmpeg-static npm 패키지 번들링)
- multer 1GB 제한, diskStorage로 OOM 방지
- 대용량 파일(200MB+)은 Railway 타임아웃(5분) 초과 시 실패 가능 — 경고 문구 표시

- [x] `dubbai-mux-server` 레포 생성 및 Railway 배포
- [x] Dockerfile 작성 (ffmpeg-static 기반)
- [x] Railway `/prepare`, `/mux-session`, `/mux` 엔드포인트 구현
- [x] `hooks/useDubbing.ts` OS별 분기 처리
- [x] `lib/utils/clipVideo.ts` captureStream 클립 유틸
- [x] `lib/utils/deviceDetect.ts` OS/기기 감지 유틸
- [x] `app/api/mux-token/route.ts` 토큰 프록시 라우트
- [x] Vercel 환경변수 `MUX_URL`, `MUX_AUTH_TOKEN` 등록

---

## 폴더 구조 (예정)

```
DubbAI/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts   # NextAuth
│   │   ├── upload/route.ts               # 파일 업로드
│   │   ├── transcribe/route.ts           # STT
│   │   ├── translate/route.ts            # 번역
│   │   └── synthesize/route.ts           # TTS
│   ├── unauthorized/page.tsx             # 접근 차단 페이지
│   └── page.tsx                          # 메인 (더빙 UI)
├── lib/
│   ├── db.ts                             # Turso 연결
│   └── auth.ts                           # NextAuth 설정
├── middleware.ts                         # 화이트리스트 검증
├── .env.local                            # 환경변수 (gitignore)
└── .claude/plans/
    └── PLAN.md                           # 이 파일
```

---

## 아키텍처 설계

### Next.js에서의 MVVM (Swift와 비교)

Swift에서 MVVM을 쓰듯, Next.js App Router에서는 **Service Layer Pattern**이 가장 실용적입니다.

| Swift (MVVM) | Next.js (Service Layer) | 역할 |
|---|---|---|
| SwiftUI View | React Component (`components/`) | UI 렌더링 |
| @ObservableObject ViewModel | Custom Hook (`hooks/useDubbing.ts`) | 클라이언트 상태 관리 |
| UseCase | Service (`lib/services/`) | 비즈니스 로직 |
| Repository | `lib/db.ts` + API 클라이언트 | 데이터 접근 |
| App Router | `app/` | 라우팅 + 얇은 컨트롤러 |

### 핵심 원칙

- **API Route는 얇게** — 요청 파싱 + 서비스 호출만, 로직 없음
- **서비스 계층에 비즈니스 로직** — 외부 API 호출, 오케스트레이션
- **컴포넌트는 UI만** — 상태는 Custom Hook에 위임
- **의존성 역전** — 서비스는 인터페이스에 의존 → 테스트 시 Mock 교체 용이

### 실제 폴더 구조

```
DubbAI/
├── app/                              # Next.js App Router
│   ├── api/
│   │   ├── auth/[...nextauth]/       # NextAuth
│   │   ├── dub/route.ts             # 얇은 컨트롤러 (서비스 호출만)
│   │   └── mux-token/route.ts       # Railway 토큰 프록시 (서버 사이드 전용)
│   ├── unauthorized/page.tsx         # 접근 차단 페이지
│   ├── layout.tsx
│   ├── providers.tsx                 # SessionProvider 래퍼
│   └── page.tsx                      # 레이아웃 + 컴포넌트 조합
├── components/                       # UI 컴포넌트 (View)
│   ├── Header.tsx                    # 헤더 + 로그인/로그아웃
│   ├── DubbingForm.tsx               # 파일 업로드 + 언어 선택
│   └── DubbingResult.tsx             # 결과 재생 + 다운로드
├── hooks/                            # Custom Hooks (ViewModel)
│   └── useDubbing.ts                 # 더빙 상태 및 요청 관리
├── lib/
│   ├── services/                     # 서비스 계층 (UseCase)
│   │   ├── dubbing.service.ts        # 전체 파이프라인 오케스트레이션
│   │   ├── elevenlabs.service.ts     # ElevenLabs STT/TTS 래퍼
│   │   ├── deepl.service.ts          # DeepL 번역 래퍼
│   │   └── ffmpeg.service.ts         # 서버사이드 ffmpeg (영상 오디오 추출)
│   ├── utils/
│   │   ├── clipVideo.ts              # captureStream 1분 클립 (PC/Android)
│   │   ├── deviceDetect.ts           # OS/기기 감지 (isIOS, isAndroid 등)
│   │   ├── extractAudioClient.ts     # 클라이언트 ffmpeg.wasm 오디오 추출
│   │   └── muxAudioToVideo.ts        # 클라이언트 ffmpeg.wasm 영상 합성 (PC)
│   ├── db.ts                         # Turso DB (Repository)
│   └── auth.ts                       # NextAuth 설정
├── types/                            # TypeScript 타입 정의
│   └── index.ts
├── __tests__/                        # 유닛 / 통합 테스트 (Jest)
│   ├── services/
│   │   ├── elevenlabs.service.test.ts
│   │   ├── deepl.service.test.ts
│   │   └── dubbing.service.test.ts
│   ├── api/
│   │   └── dub.test.ts
│   └── components/
│       └── DubbingForm.test.tsx
├── e2e/                              # E2E 테스트 (Playwright)
│   ├── landing.spec.ts               # 비인증 랜딩 페이지
│   └── dubbing.spec.ts               # 인증 사용자 더빙 플로우
├── playwright.config.ts              # Playwright 설정
├── jest.config.ts                    # Jest 설정
└── jest.setup.ts                     # Jest 전역 설정
```

---

## 테스트 계획

### 테스트 도구

| 도구 | 용도 |
|------|------|
| `jest` | 유닛 / 통합 테스트 러너 |
| `@testing-library/react` | 컴포넌트 테스트 |
| `jest-mock` | 외부 API Mock |
| `@types/jest` | TypeScript 지원 |
| `@playwright/test` | E2E 테스트 |

### 테스트 범위 및 전략

#### 1. 서비스 유닛 테스트 (Jest)

**`elevenlabs.service.test.ts`**
- STT: 오디오 파일 → 텍스트 반환 검증
- TTS: 텍스트 → 오디오 버퍼 반환 검증
- 에러 케이스: API 키 없음, 파일 형식 오류

**`deepl.service.test.ts`**
- 텍스트 번역 결과 검증
- 지원 언어 코드 검증
- 에러 케이스: 잘못된 언어 코드

**`dubbing.service.test.ts`**
- 전체 파이프라인 흐름 검증 (Mock 사용)
- 비디오 → 오디오 추출 → STT → 번역 → TTS 순서 확인

#### 2. API Route 통합 테스트 (Jest)

**`dub.test.ts`**
- POST 요청 시 올바른 응답 형식 반환
- 미인증 요청 401 반환
- 필수 파라미터 누락 시 400 반환
- 서비스 오류 시 500 반환

#### 3. 컴포넌트 테스트 (Jest + Testing Library)

**`DubbingForm.test.tsx`**
- 파일 업로드 인터랙션
- 언어 선택 드롭다운 렌더링
- 버튼 비활성화 상태 (파일 없을 때)
- 처리 중 로딩 텍스트 표시

#### 4. E2E 테스트 (Playwright)

**`landing.spec.ts`** — 비인증 랜딩 페이지
- 헤더 DubbAI 타이틀 표시
- Google 로그인 버튼 표시
- 서비스 소개 문구 표시
- 더빙 폼 미노출 확인

**`dubbing.spec.ts`** — 인증 사용자 더빙 플로우
- 인증 후 더빙 폼 표시
- 헤더 이메일 / 로그아웃 버튼 표시
- 파일 미선택 시 버튼 비활성화
- 파일 업로드 후 버튼 활성화 및 파일명 표시
- 언어 드롭다운 선택
- 더빙 성공 시 원본·번역 텍스트 및 오디오 플레이어 표시
- API 오류 시 에러 메시지 표시

> NextAuth 세션과 `/api/dub`는 `route.fulfill()`로 모킹 — 외부 서비스 불필요

### Mock 전략

```typescript
// Jest: 외부 API는 모두 Mock으로 대체
jest.mock("@elevenlabs/elevenlabs-js");
jest.mock("deepl-node");
jest.mock("@/lib/db");

// Playwright: 네트워크 인터셉트로 세션 및 API 모킹
await page.route("**/api/auth/session", route => route.fulfill({ ... }));
await page.route("**/api/dub", route => route.fulfill({ ... }));
```

---

## 핵심 제약사항

- 비허용 사용자는 안내 메시지와 함께 접근 차단
- `NEXT_PUBLIC_` 접두사 환경변수에 API 키 절대 포함 금지