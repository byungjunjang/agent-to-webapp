# 4단계 재검증

언제 읽나: phase-3 통과, phase-4 미통과.

## 1. 전제 확인

- `node --version` 이 24 이상. 아니면 멈추고 알린다(`.ts` 직접 실행이 안 된다)
- `node $SKILL_DIR/scripts/check_phase.mjs key` 가 0 으로 끝난다. 키는 스킬 폴더의 `.env` 에서 읽는다. 사용자별로 한 번
  만들면 모든 프로젝트가 다시 쓴다. 이 프로젝트만 다른 키를 쓰려면 `$A2W/verify/.env` 가 덮는다. 1 로 끝나면
  스크립트가 알려 준 경로에 학습자가 `.env.example` 을 `.env` 로 복사해 키를 넣게 안내하고 멈춘다. 스킬은 키를
  받아 적지도 파일을 열어 보지도 않는다. 셸 환경변수 경고가 나오면 그대로 전한다
- 모델은 `A2W_MODEL`, 기본 `claude-sonnet-5`. 로컬 에이전트가 다른 모델이었으면 차이의 원인이 모델일 수
  있으니 report 에 남긴다

## 2. verify/ 작성

프롬프트 4(`references/prompts.md`)를 이 세션이 수행한다. 구성은 고정이다.

```
$A2W/verify/
  package.json      {"name":"verify","private":true,"type":"module","dependencies":{"@anthropic-ai/sdk":"latest"}} + 단계에 꼭 필요한 순수 JS 패키지
  .gitignore        node_modules 와 .env 두 줄
  run.ts            입력 경로를 받아 steps 를 workflow.md 순서로 부르고 결과를 출력
  steps/<n>-<이름>.ts   단계당 export 함수 하나. 입출력 타입은 workflow.md 의 JSON 스키마
  report.md         실행 후 작성
```

`cd $A2W/verify && npm install` 뒤 `check_phase.mjs key` 가 출력한 실행 명령으로 입력 3개를 차례로 돌린다. 그 명령은
스킬 `.env` 와 `verify/.env` 를 차례로 읽는다. **입력은 포그라운드에서 하나씩 돌리고 끝날 때까지 기다린다.** 백그라운드로
넘긴 채 턴을 끝내지 않는다. `--batch`·헤드리스·원격 세션은 완료 알림을 받지 못하고, 세션이 끝나면 실행도 함께 죽는다
(dogfood 에서 세 실행이 1단계만 마치고 사라졌다). `verify/` 가 이미 있으면 다시 쓰지 말고 빠진 것만 채운 뒤 실행한다.

실행이 실패해 단계 코드를 고쳤으면 무엇이 왜 실패했고 무엇을 고쳤는지 report 의 `## 재검증 중 고친 것` 에 적는다.
그리고 workflow.md 의 그 단계(프롬프트 초안, 규칙, 스키마)도 같은 내용으로 고친다. 5단계는 workflow.md 와 이 코드를
함께 넘기므로 둘이 어긋나면 다음 세션이 옛 설계로 웹 앱을 만든다(dogfood 에서 보고서가 "workflow.md 반영 필요" 로만
적고 넘어갔다). 실패 처리를 고쳐 되돌아가는 곳이 바뀌면 `## 흐름도` 의 화살표도 같이 고친다. 단계의 순서나
수가 바뀌는 수정이면 고치지 말고 `rollback 3` 한다.

웹 앱 뼈대(Next.js,
app/, pages/)를 만들지 않는다. `child_process` 로 Python 을 부르지 않는다. TS 로 안 되는 단계는 report 의
`## 외부 서비스로 뺄 단계` 에 적고 그 단계는 입력을 그대로 통과시키는 stub 으로 둔다.

## 3. 게이트

```
node $SKILL_DIR/scripts/check_phase.mjs 4
```

통과는 형식만 본다. 세 입력의 차이가 허용 범위인지는 학습자가 판단한다. report 의 `## 입력 N` 세 절을 보여주고
"이 차이로 웹 앱을 만들어도 되는가" 를 묻는다(`--batch` 면 생략). 아니라고 하면 workflow.md 를 고치고
`rollback 3` 후 3단계부터 다시.
