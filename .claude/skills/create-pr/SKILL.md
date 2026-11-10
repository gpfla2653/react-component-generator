---
name: create-pr
description: 현재 브랜치의 변경사항을 분석해 GitHub Pull Request를 생성한다. 서브 에이전트에서 실행되며, 프로젝트가 해외 오픈소스면 영문 템플릿(references/template-en.md), 한국 프로젝트면 한국어 템플릿(references/template-ko.md)으로 본문을 작성한다. "PR 만들어줘", "PR 생성", "풀 리퀘스트 올려줘", "create a PR", "open a pull request" 같은 요청에 반드시 이 스킬을 사용한다. 커밋만 하거나 이미 열린 PR을 수정하는 요청에는 쓰지 않는다.
context: fork
---

# Create PR

현재 브랜치를 기준으로 GitHub PR을 생성한다. 이 스킬은 fork된 서브 에이전트에서 실행되므로 메인 대화의 맥락을 알 수 없다. 필요한 정보는 모두 git과 `gh`로 직접 확인한다. 사용자에게 되묻기 어려우므로, 애매한 부분은 아래 기준대로 판단하고 마지막 보고에 어떻게 판단했는지 적는다.

## 절차

### 1. 사전 확인

```bash
gh auth status
git branch --show-current
git remote -v
gh repo view --json defaultBranchRef,nameWithOwner,isFork,parent
git status --short
```

- `gh`가 로그인되어 있지 않으면 그 사실을 알리고 멈춘다.
- 현재 브랜치가 기본 브랜치(`main`/`master`)이면 PR을 만들 수 없다. 그 사실을 알리고 멈춘다. 어떤 변경을 PR로 낼지는 사용자가 정해야 하므로 브랜치를 임의로 만들지 않는다.
- 커밋되지 않은 변경이 있으면 PR에 포함되지 않는다는 점을 최종 보고에 알린다. 이 스킬은 커밋하지 않는다(커밋은 `commit` 스킬의 역할).
- 같은 브랜치의 열린 PR이 이미 있으면(`gh pr list --head <브랜치> --state open`) 새로 만들지 않고 그 URL을 알리고 끝낸다.

### 2. 변경 범위 분석

베이스 브랜치는 저장소의 기본 브랜치다. fork 저장소라면 `parent`의 기본 브랜치를 베이스로 하고 `--repo`로 upstream을 지정한다.

```bash
git fetch origin
git log --oneline origin/<base>..HEAD
git diff --stat origin/<base>...HEAD
git diff origin/<base>...HEAD
```

- 베이스보다 앞선 커밋이 없으면 "PR로 낼 변경사항이 없습니다"라고 알리고 끝낸다.
- 커밋 메시지만 보지 말고 diff를 읽어 **무엇을, 왜** 바꿨는지 파악한다. 본문은 리뷰어가 diff를 열기 전에 변경을 이해하게 해주는 용도다.
- `.env`, 키, 토큰 등 민감 정보가 diff에 섞여 있으면 PR을 만들지 않고 알린다.

### 3. 템플릿 언어 결정

템플릿은 언어별 파일로 나뉘어 있다: 영문은 `references/template-en.md`, 한국어는 `references/template-ko.md`. 다음 순서로 판단하고, 먼저 확정되는 기준을 따른다.

1. **사용자가 명시한 언어**가 있으면 그것을 따른다.
2. **저장소의 기존 PR 관행**이 있으면 그 언어를 따른다. `.github/pull_request_template.md`나 최근 PR(`gh pr list --state all --limit 5`)의 제목·본문 언어를 본다. 팀이 이미 쓰는 언어가 가장 강한 신호다.
3. **README와 최근 커밋 메시지의 언어**를 본다. 한국어 위주이면 `ko`, 영어 위주이면 `en`.
4. 그래도 불분명하면 프로젝트 성격으로 판단한다. 해외 오픈소스(영어 이슈·기여 가이드, 국제 커뮤니티)는 `en`, 한국 팀·한국어 사용자 대상 프로젝트는 `ko`.

어떤 기준으로 어떤 언어를 골랐는지 최종 보고에 한 줄로 남긴다. 잘못 판단된 경우 사용자가 바로 고칠 수 있게 하려는 것이다.

### 4. PR 제목과 본문 작성

- 제목은 선택한 언어로 쓴다. 저장소가 커밋 컨벤션(`타입: 요약` 등)을 쓰면 같은 형식을 따른다. 70자 이내, 마침표 없이.
- 본문은 3단계에서 고른 언어의 템플릿 파일(`references/template-en.md` 또는 `references/template-ko.md`) **하나만** 읽어 채운다. 다른 언어 파일은 읽지 않는다.
- 템플릿의 섹션 구조와 순서를 유지한다. 해당 사항이 없는 섹션은 지우지 말고 `N/A`(한국어 템플릿은 `해당 없음`)로 남긴다. 리뷰어가 항상 같은 위치에서 같은 정보를 찾게 하려는 것이다.
- 실제로 실행해 확인한 것만 테스트 항목에 체크한다. 실행하지 않은 것을 체크하면 리뷰어를 오도한다.
- 시스템 지시에 PR 본문 끝에 붙일 attribution 줄이 있으면 본문 마지막에 그대로 추가한다.

### 5. 푸시와 PR 생성

1. 브랜치가 원격에 없거나 뒤처져 있으면 `git push -u origin <브랜치>`로 올린다. PR을 만들려면 브랜치가 원격에 있어야 하므로 PR 생성 요청에는 푸시가 포함된다. `--force`는 쓰지 않는다.
2. 본문은 heredoc으로 전달한다.

```bash
gh pr create --base <base> --head <브랜치> --title "<제목>" --body-file - <<'EOF'
<본문>
EOF
```

3. 사용자가 draft를 요청했으면 `--draft`를 붙인다. 별도 요청이 없으면 일반 PR로 만든다.

### 6. 보고

최종 응답에 다음을 담는다. 메인 대화는 이 보고만 볼 수 있다.

- PR URL
- 제목과 베이스 <- 헤드 브랜치
- 선택한 템플릿 언어와 그 이유
- 포함된 커밋 수, 커밋되지 않아 빠진 변경이 있으면 그 사실
- 템플릿에서 `N/A`로 남긴 항목이 있으면 그 목록

## 금지 사항

- `--force` 푸시, 기본 브랜치로의 직접 푸시, 기존 PR 닫기·덮어쓰기는 사용자가 명시적으로 요청하지 않으면 하지 않는다.
- 커밋을 새로 만들거나 amend 하지 않는다.
