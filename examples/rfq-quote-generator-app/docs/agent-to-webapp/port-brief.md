# 웹 앱 전환 브리프: rfq-quote-generator

작성일: 2026-09-11 · 대상: ../rfq-quote-generator · 설계서: docs/agent-to-webapp/workflow.md · 검증: docs/agent-to-webapp/verify/report.md

이 문서는 같은 폴더의 다음 세션이 읽는 지시문이다. 헤딩은 고치지 않는다(게이트가 찾는다).

## 1. 서버 쪽 호출
Claude 를 부르는 코드와 API 키는 Route Handler 또는 Server Action 에만 둔다. 브라우저 번들에 키가 가지 않는다.
- LLM 단계: 단계 2 스펙 추출(PDF·md 를 문서 블록으로 넣는다), 단계 5 누락 스펙 식별, 단계 8 판정 설명, 단계 9 회신 이메일. 네 단계 모두 도구 1개를 `tool_choice` 로 강제해 JSON 만 받는다(`verify/lib/llm.ts` `callTool`)
- 코드 단계: 1 접수, 3 검증·모드 판정, 6 루트 판정·리드타임, 7 원가·견적 계산, 10 xlsx 생성(exceljs), 11 최종 검증. 사람 단계: 4 견적 전제 확인, 12 발송 전 검토
- `verify/steps/` 의 코드가 최신이다. 재검증에서 단계 5(도구 스키마를 "여섯 key 마다 판정 하나" 로), 단계 9(첨부 파일명 자리표시자 `[[ATTACHMENT]]` 를 코드가 치환), `lib/llm.ts`(도구 input 이 JSON 문자열로 감싸진 경우 풀기)를 고쳤다. workflow.md 의 단계 5·9 프롬프트 초안은 아직 고치기 전 문장이다. 둘이 다르면 코드를 따른다. 근거는 report.md `## 재검증 중 고친 것`
- 환경변수: ANTHROPIC_API_KEY (Vercel 프로젝트 설정), A2W_MODEL (선택, 기본 claude-sonnet-5)
- 로컬 `next dev` 는 이 폴더의 `.env.local` 에 키를 둔다(create-next-app 의 .gitignore 가 가린다). 스킬 `.env` 는 4단계 검증용이라 웹 앱이 읽지 않는다
- 장비 표 `verify/data/available_equipment.csv` 는 서버 쪽 정적 데이터로 함께 옮긴다(단계 6·7 이 읽는다)

## 2. 실행 시간 분할
Vercel 함수는 실행 시간 제한이 있다. report.md 의 단계별 시간을 적고 제한을 넘는 단계는 나눈다.
- 단계별 시간(claude-sonnet-5, 세 입력 관측치): 단계 2 16–20초 · 단계 5 15–30초(재시도 1회면 +15초) · 단계 8 17–19초 · 단계 9 40–60초(재시도 1회면 +40초) · 단계 1·3·4·6·7·10·11·12 각 1초 미만. 입력 하나 합계 105–123초
- 나눌 단계: 한 요청이 전 단계를 돌리면 60초를 넘는다. LLM 단계(2·5·8·9)를 각각 별도 요청(함수 호출)으로 나누고, 코드 단계는 앞뒤 LLM 단계 요청에 붙인다. 묶음은 다섯 개다: [1→2→3(재추출이면 2·3 반복)] · [5] · [6→7→8→10] · [9→11] · [11 실패 시 9 재작성→11]. 단계 9 는 단독으로도 60초에 닿을 수 있으니 `max_tokens` 12,000 을 유지하되 한 요청에 한 번만 부르고, 재작성은 다음 요청으로 넘긴다. 사람 단계 4·12 는 요청 사이에서 멈춘다

## 3. 상태 저장
Supabase
- 판단 근거: 사람 단계 있음(4·12) · 시간 합 105–123초, 60초 초과
- Supabase 면: 테이블 `runs`(입력·상태·결과), `steps`(run_id·단계·상태·입출력 JSON). 단계 함수는 이전 단계의 출력 JSON 을 읽고 자기 출력을 쓴다. 이어 붙이기는 큐 또는 cron
- `runs.status` 는 `running` · `waiting_for_human`(단계 4·12 앞) · `needs_attention`(단계 2·3·5·7·8·9·10·11 의 실패 처리) · `done`. `steps` 에는 재시도 사유(단계 3 의 previous_errors, 단계 5 의 검사 문제, 단계 11 의 email_missing)도 남긴다. report.md 고칠 것 4 가 이 기록이 없어서 원인을 못 본 경우다
- 입력 파일(PDF·md)은 base64 로 `steps` 입력 JSON 에 넣지 말고 Supabase Storage 에 두고 경로만 저장한다(단계 2·5 가 다시 읽는다). xlsx 결과도 Storage 에 두고 단계 12 승인 뒤 내려받게 한다

## 4. 사람 확인 지점
- 단계 4 견적 전제 확인. mode 가 `provisional` 일 때만 열린다(`firm` 이면 `skipped` 로 지나간다). 화면은 provisional_fields 마다 입력 칸: `lot_size` 는 기본값 없이 빈 칸, `delivery_days` 도 빈 칸, `material` 은 도면 값(예: SCM420H)을 보여 주고 그대로 쓸지 받는다. 추가 수량 `extra_lot_sizes` 선택 입력. 승인하면 specs 를 덮어쓰고 `sources[필드] = sales`, `unconfirmed_fields` 는 그대로. DB 상태 `pending → approved`, `approved_by`·`approved_at` 저장. 값이 들어오기 전에는 단계 5 로 가지 않는다
- 단계 12 발송 전 검토. 화면은 headline 루트·단가·대안 설명, 누락 스펙 가정 문구, provisional 이면 가정 표시 세 곳(JSON·xlsx·이메일), 세 언어 이메일과 11단계 checks. 승인(approved) 또는 반려(rejected + comment). 승인하면 xlsx 와 이메일 초안 3통을 내려받게 한다. 이 앱은 메일을 보내지 않는다. 반려면 `needs_attention` 으로 두고 고친 입력은 새 작업으로 돌린다
- 재검증에서 사람이 봤어야 할 것으로 드러난 항목(report.md `## 사람이 봤어야 할 것` 1–7: hardness_test 판정 흔들림, 마스킹 가정 방향, 호칭 성별 추정, 질화 참고 단가 노출, 내부 RFQ 번호 표기)은 단계 12 화면의 확인 목록에 그대로 넣는다

## 5. 외부 서비스로 뺄 단계
- 없음. PDF 는 Claude Messages API 문서 입력, xlsx 는 exceljs, 계산·검증은 TS. `child_process`·Python 없음. PDF 는 32MB·100쪽 한도(API 제약)를 단계 1 이 검사한다

## 6. 인증
범위 밖. 단일 사용자 데모. 로그인·멀티테넌트를 만들지 않는다.

## 7. 배포 후 검증
배포 뒤 `docs/agent-to-webapp/runs/inputs/` 3건을 웹 앱에 넣어 `verify/report.md` 와 비교한다. 절차는 `references/deploy-checklist.md`.
- 비교 기준은 report.md 의 최종 실행(입력 1 `out/1-easy-novadrive/`, 입력 2 `out/2-normal-helios/` 시도 4, 입력 3 `out/3-edge-orion/`)이다. 코드 단계 수치(단계 6·7·10·11)는 같아야 한다. LLM 단계는 report.md 가 적은 흔들림(hardness_test 판정, 마스킹 가정, 호칭) 범위 안이면 같은 것으로 본다
- 입력 3 은 단계 4 에서 lot_size 1000 · delivery_days 12 · material SCM420H 를 넣어야 report.md 와 같은 수치가 나온다
- 단계 5 재시도율과 단계 11 의 이메일 재작성 여부를 `steps` 기록에서 세어 report.md 의 시도 표와 비교한다

## 스타일 (선택)
