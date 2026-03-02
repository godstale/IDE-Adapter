# src/panel/

VS Code UI 레이어. Activity Bar 사이드바 패널 + 프로토콜 문서 뷰어.

## IdeaPanel.ts — WebviewView (사이드바)

**VIEW_ID**: `'idea.sidebarPanel'` (package.json의 `views` ID와 정확히 일치)

**생성자 파라미터**
```typescript
constructor(
  extensionUri: vscode.Uri,
  logger: IdeaLogger,
  getServerStatus: () => { running, port, connections },
  onToggleServer: () => Promise<void>,
  onApplyPort: (port: number) => Promise<void>,
  onGetAuthConfig: () => Promise<AuthConfig>,
  onToggleAuth: (enabled: boolean) => Promise<void>,
  onRegenerateToken: () => Promise<string>,
  onToggleExposeToken: (expose: boolean) => Promise<void>,
)
```

### 메시지 프로토콜

**Extension → Webview**
| type | 설명 |
|------|------|
| `serverStatus` | `{ running, port, connections }` |
| `logEntry` | `{ entry: SerializedLogEntry }` 실시간 단건 |
| `allLogs` | `{ entries: SerializedLogEntry[] }` 전체 히스토리 |
| `authConfig` | `{ enabled, token, exposeToken }` 인증 설정 |

**Webview → Extension**
| command | 설명 |
|---------|------|
| `ready` | webview 로드 완료 → status + allLogs + authConfig 응답 |
| `toggleServer` | 서버 시작/중지 토글 |
| `applyPort` | `{ port: number }` 포트 변경 후 재시작 |
| `openProtocol` | `{ docType: 'input'|'output' }` 프로토콜 뷰어 열기 |
| `toggleAuth` | `{ enabled: boolean }` 토큰 인증 활성화/비활성화 |
| `regenerateToken` | 토큰 재생성 요청 |
| `toggleExposeToken` | `{ expose: boolean }` settings.json 노출 여부 토글 |

### 탭 구성
- **Settings**: 버전, 프로토콜 버튼, 서버 상태 도트+토글, 연결수, 포트 입력+Apply
  - 인증 섹션: 토큰 인증 토글, 토큰 표시+복사, 재생성 버튼, settings.json 노출 체크박스
  - 개발자 정보 (extensionPath, globalStoragePath)
- **Logs**: 링버퍼 전체 표시, ▶ 클릭 시 JSON 펼치기, 자동 스크롤, Clear 버튼

**CSP**: `script-src 'unsafe-inline'` (인라인 스크립트 사용)

---

## ProtocolViewer.ts — WebviewPanel (문서 뷰어)

```typescript
export function openProtocolViewer(
  extensionUri: vscode.Uri,
  docType: 'input' | 'output',
): void
```

- `docs/IDEA_InputProtocol.md` 또는 `docs/IDEA_OutputProtocol.md` 읽기
- 경량 인라인 Markdown→HTML 변환 (`mdToHtml()`)
- 동일 docType 패널이 이미 열려있으면 `panel.reveal()` 포커스만
- **CSP**: `script-src 'none'` (스크립트 없음)

**지원하는 Markdown 요소**: 코드 펜스, 테이블, 제목(h1-h6), HR, 순서없는 목록, 인라인 코드/볼드/이탤릭/링크
