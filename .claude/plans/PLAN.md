# DubbAI 개발 계획

> Perso AI DevRel 인턴 채용 과제 — AI 더빙 웹 서비스

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
```

---

## 개발 단계

### Phase 1 — 프로젝트 초기 설정
- [ ] Next.js 프로젝트 생성 (App Router, TypeScript)
- [ ] 폴더 구조 설계
- [ ] Turso 연결 설정 (`@libsql/client`)
- [ ] 환경변수 `.env.local` 구성

### Phase 2 — DB 스키마 & 초기 데이터
- [ ] Turso `allowed_users` 테이블 생성
  - `id` INTEGER PRIMARY KEY
  - `email` TEXT UNIQUE NOT NULL
  - `created_at` TEXT DEFAULT (datetime('now'))
- [ ] `kts123@estsoft.com` 초기 데이터 삽입

### Phase 3 — Google OAuth + 화이트리스트
- [ ] NextAuth.js 설치 및 설정
- [ ] Google OAuth Provider 연동
- [ ] 로그인 후 이메일 화이트리스트 검증
- [ ] 미들웨어 (`middleware.ts`) 구현 — 비허용 사용자 차단
- [ ] 접근 차단 안내 페이지 (`/unauthorized`)

### Phase 4 — AI 더빙 서비스 (핵심)
- [ ] 파일 업로드 UI (오디오/비디오, 타겟 언어 선택)
- [ ] 파일 업로드 API Route (`/api/upload`)
- [ ] ElevenLabs STT — 음성 → 텍스트 전사
- [ ] DeepL API — 텍스트 번역 (타겟 언어로, 무료 월 500,000자)
- [ ] ElevenLabs TTS — 번역 텍스트 → 더빙 음성 합성
- [ ] 결과물 재생 UI + 다운로드 기능

### Phase 5 — 배포 자동화
- [ ] Vercel 프로젝트 연동
- [ ] GitHub push → 자동 배포 확인
- [ ] Vercel 환경변수 등록
- [ ] 배포 URL 확인 및 서비스 동작 검증

### Phase 6 — 문서화 & 홍보
- [ ] README.md 완성 (배포 URL 포함, 에이전트 활용 노하우)
- [ ] 개발자 커뮤니티 홍보
  - GeekNews
  - 오픈 카카오톡 개발자 채널
  - X(Twitter)
  - Reddit / Dev.to
  - Velog

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

## 핵심 제약사항

- 화이트리스트에 `kts123@estsoft.com` 반드시 포함
- 비허용 사용자는 안내 메시지와 함께 접근 차단
- `NEXT_PUBLIC_` 접두사 환경변수에 API 키 절대 포함 금지
- 배포 완료 후 서비스 URL을 README.md에 반드시 기재

---

## 제출 항목

1. GitHub 레포지터리 주소 (README.md에 배포 서비스 URL 포함)
2. 홍보 활동 URL 목록 (SNS, 커뮤니티 게시물 링크)
