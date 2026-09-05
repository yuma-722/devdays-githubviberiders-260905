# Dev Days Tokyo - GitHub Copilot appに入門！

https://azure-waigaya.connpass.com/event/405261/

## プロジェクト概要

GitHub Vibe Ridersのイベント「Dev Days Tokyo」の事後アンケートシステムです。
GitHub Copilot Agentを活用して、バックエンドとフロントエンドに分かれて開発します。

React の回答フォーム・集計画面と、.NET 10 Azure Functions の登録・集計 API を備えています。
本番用の保存先は Azure Cosmos DB、ローカル開発では認証情報不要の File モードを利用できます。
File モードは開発専用であり、Cosmos DB の障害時に自動で切り替わるものではありません。

## ディレクトリ構成

| パス | 内容 |
| --- | --- |
| `frontend/` | React・TypeScript のフロントエンドと単体テスト |
| `backend/Survey/` | .NET 10 isolated worker の Azure Functions |
| `backend/Survey.Tests/` | API・検証・集計・保存処理のテスト |
| `tests/api.integration.test.mjs` | 実 HTTP API に対する結合テスト |

## ローカル起動

Node.js 22、.NET 10 SDK、Azure Functions Core Tools v4 が必要です。
以下のコマンドはリポジトリのルートから PowerShell で実行します。

1. バックエンドを File モードで起動します。`local.settings.json` をまだ作成していない状態で、次を実行してください。

```powershell
$env:FUNCTIONS_WORKER_RUNTIME = 'dotnet-isolated'
$env:AZURE_FUNCTIONS_ENVIRONMENT = 'Development'
$env:SurveyStorage__Provider = 'File'
$env:SurveyStorage__FilePath = Join-Path $PWD 'backend\Survey\data\surveys.json'
Set-Location backend\Survey
func start --port 7071
```

2. 別のターミナルでフロントエンドを起動します。

```powershell
Set-Location frontend
npm ci
npm run dev
```

3. ブラウザで <http://localhost:3000> を開きます。`/api` への通信は Vite がバックエンドの `http://127.0.0.1:7071` に転送します。

File モードの回答は指定した JSON ファイルに保存され、再起動後も保持されます。
本番の資格情報や実際のアンケート回答を Git に追加しないでください。
詳細な設定は各ディレクトリの README を参照してください。

## テスト

フロントエンドの単体テスト・ビルドと、バックエンドのテストを実行します。

```powershell
npm --prefix frontend test
npm --prefix frontend run build
dotnet test backend\Survey.Tests --configuration Release
```

GitHub Actions の `アンケートアプリのテスト` ワークフローでも、同じテストとフロントエンドのビルドを実行します。
実 HTTP の結合テストは次の手順でローカル実行します。

1. 開発用 Functions を停止してから、空のテスト専用ファイルを指定して起動します。通常の回答ファイルは削除しません。

```powershell
$env:FUNCTIONS_WORKER_RUNTIME = 'dotnet-isolated'
$env:AZURE_FUNCTIONS_ENVIRONMENT = 'Development'
$env:SurveyStorage__Provider = 'File'
$env:SurveyStorage__FilePath = Join-Path ([System.IO.Path]::GetTempPath()) ('survey-e2e-' + [guid]::NewGuid().ToString('N') + '.json')
Write-Host "テスト用保存先: $env:SurveyStorage__FilePath"
Set-Location backend\Survey
func start --port 7071
```

2. フロントエンドも起動し、別ターミナルのリポジトリルートで次を実行します。

```powershell
$env:SURVEY_TEST_API_URL = 'http://localhost:3000/api'
node --test tests\api.integration.test.mjs
```

Vite のプロキシを経由して、空の集計、400/422 エラー、文字数境界、複数・重複選択、
同時登録、8 件の回答の集計を確認します。テストはローカル HTTP 接続のみ許可し、
回答が既に存在する場合は書き込まず停止します。再実行時は新しいテスト専用ファイルで起動してください。
テスト終了後は Functions を停止し、表示されたテスト専用ファイルのみ削除できます。

## Azure での設定

フロントエンドのビルド出力は `frontend/build` です。
既存の Static Web Apps ワークフローは GitHub の Repository variable `VITE_API_BASE_URL` をビルド時に渡します。
別オリジンの Functions を利用する場合は、`https://<Function App のホスト名>/api` を設定し、
Functions 側の CORS でフロントエンドのオリジンを許可してください。
未設定なら同一オリジンの `/api` を使用するため、Static Web Apps と既存 Functions の連携設定が必要です。
`VITE_` 変数はブラウザに公開されるので、接続文字列・関数キーなどの機密情報は含めないでください。

バックエンドの本番保存先は Cosmos DB です。アカウント `cosmos-ghdevdays-260320` を使用する場合も、
エンドポイント・データベース・コンテナー・アクセス権はバックエンドの README に従って設定してください。
コンテナーのパーティションキーは `/date` で、回答にはサーバーが UTC 日付 `yyyy-MM-dd` を付与します。
File モードは本番では利用できません。デプロイ用ワークフローの実行には Azure の既存リソース・認証設定が別途必要です。

## API仕様書

### ベースURL

```
http://localhost:3000/api
```

### エンドポイント一覧

#### 1. アンケート登録API

**POST** `/surveys`

イベント参加者のアンケート回答を登録します。

**リクエストボディ**

```json
{
  "communityAffiliation": ["VS Code Meetup", "GitHub dockyard"],
  "jobRole": ["フロントエンドエンジニア", "バックエンドエンジニア", "フルスタックエンジニア", "DevOpsエンジニア", "データエンジニア", "モバイルエンジニア", "その他"],
  "jobRoleOther": "string",
  "eventRating": 5,
  "feedback": "string"
}
```

**フィールド説明**

- `communityAffiliation`: 複数選択可能な配列形式。参加者が所属しているコミュニティを全て選択。どちらでもない場合は空配列 `[]` を指定
- `jobRole`: 複数選択可能な配列形式。参加者の職種を全て選択（複数の職種を兼務している場合を考慮）
- `jobRoleOther`: `jobRole`に「その他」が含まれている場合に具体的な職種を入力（最大100文字）
- `eventRating`: 1-5の整数（1=非常に不満、5=非常に満足）
- `feedback`: 任意のフィードバック（最大1000文字）

**レスポンス**

```json
{
  "success": true,
  "message": "アンケートの登録が完了しました",
  "surveyId": "string"
}
```

**エラーレスポンス**

```json
{
  "success": false,
  "error": "エラーメッセージ",
  "code": "ERROR_CODE"
}
```

#### 2. 集計結果取得API

**GET** `/surveys/results`

アンケートの集計結果を取得します。

**レスポンス**

```json
{
  "success": true,
  "data": {
    "totalResponses": 50,
    "communityAffiliation": {
      "VS Code Meetup": 20,
      "GitHub dockyard": 15,
      "どちらでもない": 5
    },
    "jobRole": {
      "フロントエンドエンジニア": 15,
      "バックエンドエンジニア": 12,
      "フルスタックエンジニア": 8,
      "DevOpsエンジニア": 5,
      "データエンジニア": 4,
      "モバイルエンジニア": 3,
      "その他": 3
    },
    "eventRating": {
      "average": 4.2,
      "distribution": {
        "1": 1,
        "2": 2,
        "3": 8,
        "4": 20,
        "5": 19
      }
    },
    "feedback": [
      {
        "id": "string",
        "feedback": "string",
        "timestamp": "2025-06-24T10:00:00Z"
      }
    ]
  }
}
```

## データスキーマ

### Survey Model

```typescript
interface Survey {
  id: string;
  date: string; // サーバーが生成する UTC 日付（yyyy-MM-dd）。Cosmos DB のパーティションキー
  communityAffiliation: ("VS Code Meetup" | "GitHub dockyard")[];
  jobRole: (
    | "フロントエンドエンジニア"
    | "バックエンドエンジニア"
    | "フルスタックエンジニア"
    | "DevOpsエンジニア"
    | "データエンジニア"
    | "モバイルエンジニア"
    | "その他"
  )[];
  jobRoleOther?: string;
  eventRating: 1 | 2 | 3 | 4 | 5;
  feedback: string;
  createdAt: Date;
  updatedAt: Date;
}
```

## バリデーションルール

### 必須フィールド

- `communityAffiliation`: 必須（配列形式。どちらのコミュニティにも所属していない場合は空配列 `[]` を指定）
- `jobRole`: 必須（配列形式、1つ以上選択）
- `eventRating`: 必須（1-5の整数）

### オプショナルフィールド

- `jobRoleOther`: 任意（`jobRole`に「その他」が含まれている場合は必須、最大100文字）
- `feedback`: 任意（最大1000文字）

## HTTPステータスコード

- `200 OK`: 正常処理
- `201 Created`: リソース作成成功
- `400 Bad Request`: リクエストが不正
- `422 Unprocessable Entity`: バリデーションエラー
- `500 Internal Server Error`: サーバーエラー

不正な JSON やフィールドの型不正は `400`、必須項目の欠落・未定義の選択肢・文字数制限・評価範囲などの違反は `422` です。
同じ選択肢が重複して送信されても、1 回答につき 1 回だけ集計します。
回答が 0 件の場合も全選択肢・評価 1〜5 のカウントを `0` で返し、平均は `0`、自由記述は空配列になります。
空または空白のみの自由記述は集計の一覧に含めません。

## 開発環境

- **フロントエンド**: React, Static Web Apps
- **バックエンド**: .NET 10 Azure Functions, Azure Functions
- **データベース**: Azure Cosmos DB (NoSQL)
