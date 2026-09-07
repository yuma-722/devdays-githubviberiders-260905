# フロントエンド（Dev Days Tokyo 事後アンケート）

React 19 + TypeScript + Vite で実装した、イベント事後アンケートの入力・集計結果表示 UI です。
API 契約はリポジトリルートの `README.md` に厳密に従います。

## 技術スタック

| 用途 | ライブラリ |
| --- | --- |
| UI | React 19, TypeScript 5 |
| ビルド / 開発サーバー | Vite 6 |
| テスト | Vitest 3, Testing Library (react / user-event / jest-dom), jsdom |

## セットアップと起動

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000 （ポート固定）
```

- `npm run dev` は `/api` へのリクエストを既定で `http://127.0.0.1:7071`（Azure Functions ローカル）へプロキシします。
- プロキシ先を変えたい場合は環境変数 `API_PROXY_TARGET` を設定します。
  - 例: `API_PROXY_TARGET=http://127.0.0.1:7171 npm run dev`（PowerShell: `$env:API_PROXY_TARGET='http://127.0.0.1:7171'; npm run dev`）

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー起動（ポート 3000、`/api` プロキシ付き） |
| `npm run build` | 型チェック後に本番ビルド。出力先は `build/`（SWA workflow の `output_location` と一致） |
| `npm run preview` | `build/` をローカル配信 |
| `npm test` | Vitest を単発実行（CI / E2E 前提） |
| `npm run test:watch` | Vitest をウォッチ実行 |
| `npm run typecheck` | `tsc --noEmit` |

## 環境変数

`.env.example` を参照してください（機密情報は含めません）。

| 変数 | 用途 | 既定 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | API のベース URL。**`/api` まで含めて**指定 | 未設定時は同一オリジンの `/api` |
| `API_PROXY_TARGET` | `npm run dev` 時の `/api` プロキシ先 | `http://127.0.0.1:7071` |

- Azure Static Web Apps で Functions を同一オリジン（`/api`）に統合する場合は `VITE_API_BASE_URL` は不要です。
- Functions を別オリジンで運用する場合は、SWA のビルド時に `VITE_API_BASE_URL=https://<functions>.azurewebsites.net/api` を渡してください（Functions 側で CORS 許可が必要）。
- `public/staticwebapp.config.json` で SPA フォールバック（`/api/*` を除外）を設定しています。

## 画面構成

ハッシュルーティング（`#/` と `#/results`）を採用しており、SWA 上でもリロードに耐えます。

| ルート | 画面 | 主な状態 |
| --- | --- | --- |
| `#/` | アンケート入力 | 入力中 → 送信中（ボタン無効化・二重送信防止）→ 完了（`surveyId` 表示）/ エラー（入力内容を保持し「再送信する」） |
| `#/results` | 集計結果 | 読み込み中 → 表示 / 0 件の空状態 / 取得失敗（「再試行」） |

### デザイン方針

「東京の路線図」をモチーフに、3 つの設問を縦のレール上の駅として並べ、回答が済むほどレールが塗り進みます。
装飾ではなく進捗の手がかりとして機能させ、`prefers-reduced-motion` ではアニメーションを抑制します。

## バリデーション（クライアント側）

サーバー側と同じ規則をクライアントでも先に検証し、エラーは設問ごとに日本語で表示します。

- `jobRole`: 1 件以上必須（7 種類）
- `jobRoleOther`: 「その他」選択時は必須、100 文字以内
- `eventRating`: 1〜5 の整数、必須
- `feedback`: 任意、1000 文字以内

文字数は UTF-16 コード単位で数えます（バックエンド .NET の `string.Length` と同一基準。絵文字などのサロゲートペアは 2 文字）。`maxLength` 属性・文字数カウンター・検証のいずれも同じ基準です。

API エラー時にサンプルデータや偽の成功表示へフォールバックすることはありません。
集計結果も README の契約（`totalResponses`、全選択肢・全評価のキー、`average`、`feedback` 配列）が欠けている・型が壊れている場合は `INVALID_RESPONSE` として失敗表示にし、偽の 0 件集計は表示しません。
リクエストは 15 秒でタイムアウトし、ヘッダー受信後の本文読み込みまでを対象とします。

## ブラウザ E2E 向けアクセシブル名一覧

主要コントロールは日本語の label / role で取得できます。

### アンケート入力（`#/`）

| 要素 | role | name |
| --- | --- | --- |
| フォーム | `form` | `イベントの感想を教えてください` |
| 職種 | `group` | `職種` |
| 職種選択肢 | `checkbox` | `フロントエンドエンジニア` … `その他`（README の 7 種類） |
| その他の職種 | `textbox` | `その他の職種`（「その他」チェック時のみ表示） |
| 満足度 | `radiogroup` | `イベントの満足度` |
| 満足度の各値 | `radio` | `1: 非常に不満` / `2: 不満` / `3: どちらでもない` / `4: 満足` / `5: 非常に満足` |
| 自由記述 | `textbox` | `ご意見・ご感想`（部分一致） |
| 送信 | `button` | `アンケートを送信`（送信中は `送信中…` かつ disabled） |
| エラー要約 | `alert` | 送信時の検証エラー / API エラー |
| 送信完了 | `status` | 完了メッセージ。`data-testid="survey-id"` に `surveyId` |
| 完了後リンク | `link` | `集計結果を見る` |
| 完了後ボタン | `button` | `もう一度回答する` |
| 失敗後ボタン | `button` | `再送信する` |

### 集計結果（`#/results`）

| 要素 | role / testid | name |
| --- | --- | --- |
| ナビゲーション | `link` | `アンケートに回答` / `集計結果` |
| 回答数 | `data-testid="total-responses"` | — |
| 平均評価 | `data-testid="rating-average"` | — |
| 評価分布 | `list` | `満足度ごとの回答数` |
| 職種集計 | `region` | `職種` |
| 自由記述 | `region` | `ご意見・ご感想` |
| 再読込 | `button` | `最新の結果を取得` |
| 失敗時 | `button` | `再試行` |
| 空状態テキスト | — | `まだ回答がありません` / `自由記述はまだありません。` |

## テスト

```bash
npm test
```

- `src/lib/validation.test.ts` — 入力検証とリクエスト整形（重複除去、その他の扱い、文字数上限）
- `src/lib/api.test.ts` — API クライアント（201 / 400 / 422 / 500、ネットワーク断、ヘッダー前・本文読み込み中のタイムアウト、外部 abort、不正レスポンス、集計データの契約検証）
- `src/components/SurveyForm.test.tsx` — フォームの操作・送信・二重送信防止・失敗時の入力保持
- `src/components/ResultsView.test.tsx` — 読み込み / 空 / エラー / 表示
- `src/App.test.tsx` — ルーティングとナビゲーション

テストでは `vi.mock` により API モジュールを差し替えており、本番コードにモックは含まれません。

## ディレクトリ構成

```
frontend/
├── index.html
├── public/staticwebapp.config.json
├── src/
│   ├── main.tsx / App.tsx / styles.css
│   ├── components/   SurveyForm, RatingScale, ResultsView
│   ├── lib/          survey (定数・型), validation, api, router
│   └── test/setup.ts
├── vite.config.ts    ポート 3000 / /api プロキシ / outDir=build / Vitest 設定
└── .env.example
```
