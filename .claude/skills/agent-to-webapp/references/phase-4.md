# 4단계 재검증

언제 읽나: phase-3 통과, phase-4 미통과.

## 1. 전제 확인

- `node --version` 이 24 이상. 아니면 멈추고 알린다(`.ts` 직접 실행이 안 된다)
- `ANTHROPIC_API_KEY` 가 환경에 있다. 없으면 멈추고 알린다. 키를 파일에 쓰지 않는다
- 모델은 `A2W_MODEL`, 기본 `claude-sonnet-5`. 로컬 에이전트가 다른 모델이었으면 차이의 원인이 모델일 수
  있으니 report 에 남긴다

## 2. verify/ 작성

프롬프트 4(`references/prompts.md`)를 이 세션이 수행한다. 구성은 고정이다.

```
$A2W/verify/
  package.json      {"name":"verify","private":true,"type":"module","dependencies":{"@anthropic-ai/sdk":"latest"}} + 단계에 꼭 필요한 순수 JS 패키지
  .gitignore        node_modules
  run.ts            입력 경로를 받아 steps 를 workflow.md 순서로 부르고 결과를 출력
  steps/<n>-<이름>.ts   단계당 export 함수 하나. 입출력 타입은 workflow.md 의 JSON 스키마
  report.md         실행 후 작성
```

`cd $A2W/verify && npm install` 뒤 `node run.ts <입력 폴더>` 로 입력 3개를 차례로 돌린다. 웹 앱 뼈대(Next.js,
app/, pages/)를 만들지 않는다. `child_process` 로 Python 을 부르지 않는다. TS 로 안 되는 단계는 report 의
`## 외부 서비스로 뺄 단계` 에 적고 그 단계는 입력을 그대로 통과시키는 stub 으로 둔다.

## 3. 게이트

```
node $SKILL_DIR/scripts/check_phase.mjs 4
```

통과는 형식만 본다. 세 입력의 차이가 허용 범위인지는 학습자가 판단한다. report 의 `## 입력 N` 세 절을 보여주고
"이 차이로 웹 앱을 만들어도 되는가" 를 묻는다(`--batch` 면 생략). 아니라고 하면 workflow.md 를 고치고
`rollback 3` 후 3단계부터 다시.
