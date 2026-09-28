# 4단계 재검증

언제 읽나: phase-3 통과, phase-4 미통과.

## 1. 전제 확인

- `node --version` 이 24 이상. 아니면 멈추고 알린다(`.ts` 직접 실행이 안 된다)
- `node $SKILL_DIR/scripts/check_phase.mjs key` 가 0 으로 끝난다. 키는 스킬 폴더의 `.env` 에서 읽는다. 사용자별로 한 번
  만들면 모든 프로젝트가 다시 쓴다. 이 프로젝트만 다른 키를 쓰려면 `$A2W/verify/.env` 가 덮는다. 1 로 끝나면
  스크립트가 알려 준 경로에 학습자가 `.env.example` 을 `.env` 로 복사해 키를 넣게 안내하고 멈춘다. 스킬은 키를
  받아 적지도 파일을 열어 보지도 않는다. 셸 환경변수 경고가 나오면 그대로 전한다
- 모델은 STATUS 의 `model` 이다. `check_phase.mjs key` 가 실행 명령에 `A2W_MODEL=<ID>` 를 붙여 준다. 관찰과 같은 모델이라
  차이의 원인에서 모델이 빠진다. Codex 대상은 관찰 모델이 다르므로 report 에 남긴다

## 2. verify/ 작성

러너와 라이브러리는 스킬 자산이다. 먼저 템플릿을 복사한다. `-n` 이라 이미 있는 파일(의존을 더한 package.json 등)은 덮지 않고 빠진 것만 채운다.

```
cp -rn "$SKILL_DIR/assets/verify-template/." "$A2W/verify/"
```

구성은 고정이다. LLM 이 쓰는 것은 `steps/` 와 `package.json` 의 의존 목록, 실행 뒤의 `report.md` 뿐이다.

```
$A2W/verify/
  run.ts            템플릿. 단계를 순서대로 부르고 out/ 에 단계별 JSON 과 summary.json 을 쓴다. 고치지 않는다
  lib/step.ts       템플릿. 단계 계약(Step, Goto, Skip, NeedsAttention, ctx). 고치지 않는다
  lib/llm.ts        템플릿. callTool(도구 1개 호출, JSON 만), fileBlocks(PDF·이미지·텍스트). 고치지 않는다
  package.json      템플릿. 단계에 꼭 필요한 순수 JS 패키지만 dependencies 에 더한다
  .gitignore        템플릿. node_modules, .env (out/ 은 커밋한다. 재검증 증거이고 --from 이 읽는다)
  steps/index.ts    `steps: Step[]` 를 내보낸다. workflow.md 의 번호·이름·실행 주체 순서 그대로
  steps/<nn>-<이름>.ts   단계당 함수 하나. 입출력 타입은 workflow.md 의 JSON 스키마
  out/<입력>/       실행이 쓴다. NN-이름.json(단계 출력), summary.json(상태·시간·LLM 사용량·사람 메모·되돌아가기)
  report.md         실행 후 작성
```

게이트는 `run.ts`·`lib/*.ts` 가 템플릿과 다르면 경고한다. 러너에 정말 결함이 있으면 고치되 report 의
`## 재검증 중 고친 것` 에 적는다. 그 수정은 스킬 자산으로 돌아가야 한다.

단계 계약(`lib/step.ts` 주석이 정본):
- `run(input, ctx)` 는 출력을 돌려준다. 앞 단계 출력이 input 이고, `ctx.outputs.get(n)` 으로 더 앞 단계도 읽는다
- 되돌아가기(재추출·재작성)는 `return new Goto(단계, 사유, payload)`. 되돌아간 단계는 `ctx.feedback` 으로 사유를 받고
  `ctx.attempt` 로 몇 번째인지 안다. 같은 단계 3번을 넘으면 러너가 needs_attention 으로 멈춘다
- 건너뛰기(외부 서비스로 뺄 단계의 stub)는 `return new Skip(사유)`. 입력이 그대로 다음 단계로 간다
- 멈춤은 `throw new NeedsAttention(단계, 사유, payload)`
- 실행 주체가 사람인 단계는 사람이 넣었을 값을 코드가 넣고 `ctx.note(...)` 로 남긴다. 러너가 "자동 승인" 을 기록한다
- LLM 단계는 `callTool({ step, system, content, tool })` 로 도구 1개를 부르게 해 JSON 만 받는다. 파일은 `fileBlocks(files)`

### 프롬프트 4 — 재검증 스크립트

report 절 이름(`## 모델`, `## 입력 N`, `## 재검증 중 고친 것`, `## 사람이 봤어야 할 것`, `## 외부 서비스로 뺄 단계`)은 게이트가
그대로 찾는다.

```
<A2W>/workflow.md 의 단계를 <A2W>/verify/steps/ 에 TypeScript 함수로 구현해줘.
러너(run.ts)와 lib/ 는 템플릿에서 복사돼 있다. 고치지 말고 steps/ 만 쓴다. 계약은 lib/step.ts 의 주석이다.
- steps/index.ts 가 `steps: Step[]` 를 내보낸다. workflow.md 의 번호·이름·실행 주체 그대로, 순서대로. 단계마다 steps/<nn>-<이름>.ts 에 함수 하나
- 단계 함수는 (input, ctx) 를 받아 출력을 돌려준다. 되돌아가기는 new Goto(단계, 사유), 건너뛰기는 new Skip(사유), 멈춤은 throw new NeedsAttention(단계, 사유)
- 단계 사이에 넘기는 데이터는 workflow.md 의 JSON 스키마를 그대로 쓸 것
- LLM 단계는 lib/llm.ts 의 callTool 로 도구 1개를 부르게 해 JSON 만 받는다. 파일은 fileBlocks 로 넘긴다. 모델은 환경변수 A2W_MODEL, 없으면 claude-sonnet-5
- 실행 주체가 "사람" 인 단계는 사람이 넣었을 값을 코드가 넣고 ctx.note 로 남긴다(자동 승인)
- 의존은 @anthropic-ai/sdk 와 그 단계에 꼭 필요한 순수 JS 패키지만 package.json 에 더한다. Vercel 서버리스에서 안 도는 것(네이티브 바이너리, 브라우저 자동화, Python, child_process)은 금지. TS 로 안 되는 단계는 Skip 으로 두고 report 의 "## 외부 서비스로 뺄 단계" 에 적을 것
- Node 24 에서 node run.ts 로 바로 실행된다. tsx 나 빌드 없음. import 는 .ts 확장자까지 쓴다. 웹 앱 뼈대는 만들지 말 것
- 키를 코드에 쓰지도, .env 파일을 열어 보지도 말 것. 실행 명령은 check_phase.mjs key 가 준다
- 작성 후 cd <A2W>/verify && npm install 하고, <A2W>/runs/inputs/ 의 입력 3개를 포그라운드에서 하나씩 실행한다(백그라운드로 넘긴 채 끝내지 말 것).
  첫 입력이 done 이 될 때까지 다음 입력을 돌리지 않는다. 코드를 고친 뒤에는 --from N 으로 고친 단계부터 이어 돌린다
- 로컬 에이전트 결과(<A2W>/runs/run-N.md)와 비교해 <A2W>/verify/report.md 에 아래 절로 보고한다. 짧게 쓴다
  ## 모델            (실제로 쓴 모델명 한 줄. summary.json 의 model)
  ## 입력 1: <이름>   (차이 표 하나: | 항목 | 로컬 | 스크립트 | 판정 |. 로컬 결과와 스크립트 결과를 따로 서술하지 않는다. 일치한 항목은 "일치: …" 한 줄)
  ## 입력 2: <이름>
  ## 입력 3: <이름>
  ## 재검증 중 고친 것   (단계 코드를 고쳤으면 무엇이 왜 실패했고 무엇을 고쳤는지. workflow.md 의 그 단계도 같이 고칠 것. 없으면 - 없음)
  ## 사람이 봤어야 할 것   (summary.json 의 human_notes 와, 사람이 봤다면 잡았을 것. 없으면 - 없음)
  ## 외부 서비스로 뺄 단계  (없으면 - 없음)
  단계별 시간과 LLM 호출 수는 summary.json 의 timings·usage 에서 옮긴다. workflow.md 에 없는 검증(selftest 등)을 새로 만들지 않는다.
  실패한 시도의 out/ 폴더나 고치기 전 코드 사본을 남기지 않는다. 러너가 out/<입력>/ 을 덮어쓰고 summary.json 의 control·attention 이 기록이다
```

위키 원문과 다른 점: Node 24 직접 실행, 러너·라이브러리는 템플릿, 단계 계약, 모델 지정, 사람 단계 처리, child_process 금지,
report 절 고정과 차이 표만, 키는 스킬 `.env` 에서, `--from` 이어 돌리기. dogfood 에서 러너 19KB 를 매번 새로 썼고 API 28회
중 13회만 최종 실행이었다.

## 3. 실행과 고치기

`check_phase.mjs key` 가 출력한 실행 명령으로 돌린다. 그 명령은 스킬 `.env` 와 `verify/.env` 를 차례로 읽는다.
**입력은 포그라운드에서 하나씩 돌리고 끝날 때까지 기다린다.** 백그라운드로 넘긴 채 턴을 끝내지 않는다. `--batch`·헤드리스·
원격 세션은 완료 알림을 받지 못하고, 세션이 끝나면 실행도 함께 죽는다(dogfood 에서 세 실행이 1단계만 마치고 사라졌다).

실행이 실패해 단계 코드를 고쳤으면 `--from <고친 단계>` 로 이어 돌린다. `out/<입력>/` 의 앞 단계 JSON 을 그대로 쓰므로
PDF 를 다시 읽는 LLM 호출이 빠진다. 고친 단계보다 앞의 단계를 고쳤으면 처음부터 돌린다. 무엇이 왜 실패했고 무엇을 고쳤는지
report 의 `## 재검증 중 고친 것` 에 적고, workflow.md 의 그 단계(프롬프트 초안, 규칙, 스키마)도 같은 내용으로 고친다.
5단계는 workflow.md 와 이 코드를 함께 넘기므로 둘이 어긋나면 다음 세션이 옛 설계로 웹 앱을 만든다. 실패 처리를 고쳐
되돌아가는 곳이 바뀌면 `## 흐름도` 의 화살표도 같이 고친다. 단계의 순서나 수가 바뀌는 수정이면 고치지 말고
`rollback 3` 한다.

## 4. 게이트

```
node $SKILL_DIR/scripts/check_phase.mjs 4
```

게이트는 `workflow.md` 의 `### 단계 N` 과 `steps/` 의 단계 객체를 번호로 짝지어 이름·실행 주체를 대조한다. 하나라도
다르면 실패다. 학습자가 3단계에서 승인한 설계와 5단계가 복사하는 코드가 어긋나는 것을 모델의 자기 보고에 기대지 않고
잡기 위해서다. 단계 파일은 `n:`, `name:`, `actor:` 를 그 순서로 한 줄씩 두고 `run` 은 그 뒤에 쓴다. `n:` 이 없는 파일
(`common.ts` 같은 보조 파일)은 대조에서 뺀다.

게이트는 `runs/inputs/` 의 입력 폴더마다 `verify/out/<입력>/summary.json` 을 읽는다. 없으면 실패다. 보고서 글이 아니라 러너가
남긴 이 파일이 실행 증거다. status 가 done 이 아니면, model 이 STATUS 와 다르면, `--from` 으로 이어 돌려 시간 합이 부분이면, report 의
`## 모델` 절이 summary 의 model 과 다르면 경고한다. `--from` 기록은 앞 단계 시간이 없으니 브리프 2절의 시간 합에는 처음부터 돌린
실행의 값을 쓴다.

그 밖의 통과는 형식만 본다. 세 입력의 차이가 허용 범위인지는 학습자가 판단한다. report 의 `## 입력 N` 세 절의 차이 표를
보여주고 "이 차이로 웹 앱을 만들어도 되는가" 를 묻는다(`--batch` 면 생략). 아니라고 하면 workflow.md 를 고치고
`rollback 3` 후 3단계부터 다시.
