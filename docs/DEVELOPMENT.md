# 개발 문서

사용 안내는 [README](../README.md)에 있습니다. 이 문서는 코드를 고치거나 배포하는 사람을 위한 것입니다.

## 스택

- Vite + React 19 + TypeScript, Tailwind CSS v4
- 백엔드 없음. BYOK(Bring Your Own Key) 방식으로 브라우저에서 Gemini API를 직접 호출합니다. 키와 모델 선택은 localStorage(`grasps-designer:` 접두어)에 저장합니다.
- Gemini `responseSchema`로 JSON 출력을 강제합니다.
- 엑셀 내보내기 라이브러리(`write-excel-file`)는 버튼을 눌렀을 때만 동적으로 불러옵니다.

## 로컬 실행과 빌드

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc 타입 검사 + 정적 빌드 → dist/
npm run preview  # 빌드 결과 미리보기
```

## 생성 단계의 내부 동작

1. **Stage 1** (`generateStage1`): 성취기준 → 전이 목표·영속적 이해 2·본질적 질문 2.
2. **번들 생성** (`generateBundles`): 청중 근접성 축(`classroom`, `school_community`, `expert_public`)마다 정합한 GRASPS 번들 1개씩, 모두 3개를 따로 호출해 만든 뒤 클라이언트에서 합칩니다. 번들 3개를 한 번에 받는 스키마는 Gemini 스키마 검사에서 400 오류가 나서 축별 호출로 바꿨습니다. 루브릭에 Stage 1 이해에 근거한 준거가 없으면 그 축을 한 번 다시 생성합니다.
3. **요소 재생성** (`regenerateElement`): 잠긴 형제 요소와 Stage 1을 함께 넣어 한 요소만 다시 만듭니다. `src/lib/bundle.ts`의 의존 그래프(`DEPENDENTS`)에 따라 후손 요소를 `stale`로 표시합니다.
4. **정합성 감사** (`auditBundle`): 선택한 번들을 `quality_checklist`에 대조하는 별도 호출입니다. 검사 항목별 결과를 돌려줍니다. 재생성할 때마다 다시 감사합니다.
5. **내보내기 게이트**: `canExport`(stale 요소, Stage 1 이해 근거 준거 부재)와 감사 상태(진행 중·실패)를 함께 보고 내보내기 버튼을 잠급니다.

Gemini 호출(`src/lib/gemini.ts`)

- 429·503은 1회 재시도합니다.
- 404(모델 없음)이면 후보 모델 순서(gemini-2.5-flash → flash-latest → 2.0-flash → 2.5-flash-lite → 2.5-pro)로 자동 대체하고, 성공한 모델을 키별로 캐시합니다.
- 400이면 Gemini가 돌려준 실제 오류 문구를 보여 줍니다(키 오류와 스키마 오류를 구분하기 위해).
- 스키마에는 enum을 쓰지 않고, 유효값은 프롬프트로 지정한 뒤 클라이언트에서 정규화합니다(enum이 400 오류의 원인이었음).

## 구조

```
src/
├─ App.tsx                # 4단계 위저드 상태 머신 (input → stage1 → bundles → refine)
├─ components/
│  ├─ InputForm.tsx       # 성취기준 선택·직접 입력
│  ├─ Stage1Review.tsx    # Stage 1 인라인 검토 (건너뛸 수 없는 관문)
│  ├─ BundleCards.tsx     # 정합 번들 3개 중 선택
│  ├─ BundleEditor.tsx    # 요소별 잠금·재생성, stale 표시, 감사 패널, 내보내기
│  └─ ApiKeyModal.tsx     # BYOK 키·모델 설정
├─ lib/
│  ├─ gemini.ts           # generateStage1 / generateBundles / regenerateElement / auditBundle
│  ├─ prompts.ts          # 프롬프트 빌더와 JSON 스키마
│  ├─ bundle.ts           # 요소 의존 그래프, stale 캐스케이드, 내보내기 게이트
│  ├─ labels.ts           # 축·준거 출처·요소 표시 이름
│  ├─ standards.ts        # 공식 성취기준 로드 + 학교급/과목/영역 단계별 목록
│  ├─ markers.ts          # 정렬 표식 색상
│  ├─ export.ts           # PDF(인쇄)·엑셀(.xlsx)·Markdown 내보내기
│  └─ storage.ts          # localStorage 래퍼
├─ knowledge/             # 시스템 프롬프트에 넣는 요약 지식 (출처는 README '근거 자료')
│  ├─ ubd_stage1.md
│  ├─ grasps.md
│  ├─ six_facets.md
│  ├─ udl.md
│  └─ quality_checklist.md
└─ types.ts

public/
└─ science_standards.json  # 2022 개정 과학과 성취기준 473 + 성취수준 A~E 371
```

GRASPS의 P는 원저에서 Product/Performance/Purpose로 혼용되므로 코드 내부 키는 `performanceProduct`로 통일했습니다.

## 배포

### GitHub Pages (현재 운영)

`.github/workflows/deploy.yml`이 `main`에 push할 때마다(또는 Actions 탭에서 수동 실행) `npm ci && npm run build`를 돌려 결과를 Pages에 올립니다. 별도 시크릿은 필요 없습니다(`GITHUB_TOKEN` 자동 사용).

최초 1회, 저장소 소유자가 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿔야 합니다. 브랜치에서 바로 배포하는 방식은 빌드를 하지 않으므로 이 Vite 앱이 빈 화면으로 나옵니다.

Pages는 `/UbD/` 하위 경로로 서빙되므로, 워크플로가 `GITHUB_PAGES=true`를 지정할 때만 Vite `base`를 `/UbD/`로 둡니다(`vite.config.ts`). 데이터 파일은 `import.meta.env.BASE_URL` 기준으로 불러오므로 경로가 자동으로 맞춰집니다.

- `public/science_standards.json`(약 503KB, gzip 69KB)은 출력 루트에 정적 파일로 서빙됩니다.
- 외부로 나가는 요청은 브라우저 → Google Generative Language API 직접 호출뿐입니다.

### Vercel (대안)

`vercel.json`이 들어 있고 base는 루트 `/`입니다. [vercel.com/new](https://vercel.com/new)에서 저장소를 가져오면 Vite로 자동 인식됩니다.
