# 배포 확인 체크리스트

5단계 뒤 바이브 코딩과 Vercel 배포가 끝났을 때 작업 폴더에서 따른다. 결과는
`docs/agent-to-webapp/deploy-report.md` 에 `verify/report.md` 와 같은 헤딩(`## 입력 1` ~ `## 입력 3`)으로 적는다.

- [ ] Vercel 환경변수에 `ANTHROPIC_API_KEY` 가 있다. Supabase 면 URL 과 키도
- [ ] 브라우저 번들에 키가 없다: 빌드 뒤 `grep -r "sk-ant" .next/static` 결과가 비어 있다
- [ ] `docs/agent-to-webapp/runs/inputs/` 의 3건을 배포된 앱에 차례로 넣었다
- [ ] 결과를 `deploy-report.md` 에 `verify/report.md` 의 같은 입력과 나란히 적었다
- [ ] 차이가 report.md 의 차이보다 크면 웹 개발 문제다(에이전트 설계 문제는 4단계에서 끝났다). 단계 분할·시간 제한·상태 저장 중 어디인지 좁혀 적었다
- [ ] 사람 단계가 있으면 UI 승인 없이는 다음 단계로 못 간다
- [ ] 외부 서비스로 뺀 단계가 있으면 stub 이 화면에 명시된다
- [ ] 대상 프로젝트의 로컬 전용 파일(`CLAUDE.local.md` 블록, `settings.local.json` 훅·additionalDirectories)을 지웠다
