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

### 本番リソース

サブスクリプションは **Azure subscription 1**、リソースグループは **rg-ghdevdays-260320** です。
既存の別イベント用 Static Web Apps `stapp-ghdevdays-260320` は本アプリのデプロイ対象ではありません。

| 用途 | リソース・値 |
| --- | --- |
| フロントエンド | `swa-devdays-260905`（Standard） |
| 公開 URL | <https://proud-field-021987600.6.azurestaticapps.net> |
| バックエンド | `func-devdays-survey`（Linux / Flex Consumption、.NET 10 isolated） |
| API ベース URL | `https://func-devdays-survey-dvd0bzbje3ejfcfv.japaneast-01.azurewebsites.net/api` |
| Cosmos DB アカウント | `cosmos-ghdevdays-260320` |
| データベース / コンテナー | `ghdevdays` / `survey` |
| パーティションキー | `/date`（サーバー生成の UTC 日付 `yyyy-MM-dd`） |

### Functions の環境変数

Azure Portal の **func-devdays-survey → 設定 → 環境変数 → アプリ設定** に設定します。
名前の階層区切りには、Linux でも機能するダブルアンダースコア `__` を使用してください。

| 名前 | 本番の値・設定方法 |
| --- | --- |
| `AZURE_FUNCTIONS_ENVIRONMENT` | `Production` |
| `SurveyStorage__Provider` | `Cosmos` |
| `Cosmos__Endpoint` | `https://cosmos-ghdevdays-260320.documents.azure.com:443/` |
| `Cosmos__DatabaseName` | `ghdevdays` |
| `Cosmos__ContainerName` | `survey` |
| `AzureWebJobsStorage` | 作成時のホストストレージ接続文字列を保持。秘密情報のためソースやログに出さない |
| `DEPLOYMENT_STORAGE_CONNECTION_STRING` | 作成時のデプロイ用 Blob ストレージ接続文字列を保持。値を公開しない |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | 既存の Application Insights 接続設定を保持 |

この本番環境は **Flex Consumption** です。ランタイムは環境変数ではなく
リソースの `properties.functionAppConfig.runtime` を `name=dotnet-isolated` / `version=10.0` に設定します。
`FUNCTIONS_WORKER_RUNTIME`、`FUNCTIONS_WORKER_RUNTIME_VERSION`、`FUNCTIONS_EXTENSION_VERSION`、
`WEBSITE_RUN_FROM_PACKAGE`、`SCM_DO_BUILD_DURING_DEPLOYMENT` は本番 Flex 環境に追加しないでください。
`FUNCTIONS_WORKER_RUNTIME=dotnet-isolated` は上記の**ローカル起動**で使用する設定です。
既存の `functionAppConfig.deployment.storage` とストレージ接続設定を削除・置換しないでください。

`SurveyStorage__FilePath` はローカル File モード専用で、本番には設定しません。
File モードは Development 以外では起動エラーになり、Cosmos DB の障害時にも切り替わりません。

### Cosmos DB の認証と CORS

**func-devdays-survey → ID → システム割り当て**を有効にし、アプリの `DefaultAzureCredential` がその ID を使用します。
この構成では Functions の環境変数 `AZURE_CLIENT_ID`、クライアントシークレット、Cosmos のアカウントキーは不要です。
後述の GitHub 用 `AZURE_CLIENT_ID` を Functions に設定しないでください。

Functions の実行 ID に、Cosmos の **Cosmos DB Built-in Data Contributor**
（ロール ID `00000000-0000-0000-0000-000000000002`）を
`/dbs/ghdevdays/colls/survey` スコープで付与します。
これは Cosmos の**データプレーン**のロールであり、Azure IAM の `Contributor` では代用できません。
新しい回答の保存とクエリの読み取りに使用します。既存レコードの削除・一括移行は不要で、使わなくなった追加フィールドは読み飛ばします。

Functions の **API → CORS** で `https://proud-field-021987600.6.azurestaticapps.net` を許可します。
`*` は不要です。フロントはこの API へ直接通信し、SWA の `/api` バックエンド連携には依存しません。

### GitHub Actions の変数・シークレット

リポジトリの **Settings → Secrets and variables → Actions** で設定します。
次の公開 ID は Repository **variables**、SWA のデプロイトークンのみ Repository **secret** です。

| 種類 | 名前 | 値・用途 |
| --- | --- | --- |
| Variable | `VITE_API_BASE_URL` | `https://func-devdays-survey-dvd0bzbje3ejfcfv.japaneast-01.azurewebsites.net/api` |
| Variable | `AZURE_CLIENT_ID` | `77416e90-b34a-48d4-924d-c91172df3a51`（デプロイ専用 ID のクライアント ID） |
| Variable | `AZURE_TENANT_ID` | `164bdd76-e1fc-43d1-8d2d-b0c6c87ac808` |
| Variable | `AZURE_SUBSCRIPTION_ID` | `92b0d2db-6657-41a8-b1a0-9299dd0b4a6d` |
| Secret | `AZURE_STATIC_WEB_APPS_API_TOKEN_PROUD_FIELD_021987600` | `swa-devdays-260905` の既存デプロイトークン。値を README やコードに記載しない |

`VITE_API_BASE_URL` は**ビルド時**に埋め込まれます。SWA の Azure 側アプリ設定に追加するだけでは反映されません。
変更した場合はフロントを再ビルド・再デプロイしてください。
未設定なら同一オリジン `/api` となるため、この本番構成では必ず設定します。
`VITE_` 変数はブラウザに公開されるので、接続文字列・関数キーなどの秘密情報は含めないでください。

Functions の CI 認証には、ユーザー割り当てマネージド ID **id-devdays-github-deploy** の OIDC を使用します。
フェデレーション資格情報 `github-main` は次のように設定します。

| 設定 | 値 |
| --- | --- |
| Issuer | `https://token.actions.githubusercontent.com` |
| Subject | `repo:yuma-722/devdays-githubviberiders-260905:ref:refs/heads/main` |
| Audience | `api://AzureADTokenExchange` |
| Azure IAM ロール | `Website Contributor`、対象 `func-devdays-survey` リソースだけのスコープ |

このデプロイ ID に Cosmos のデータアクセス権限は付与しません。Functions の実行 ID と CI のデプロイ ID を分離しています。
GitHub Actions は `id-token: write` で短時間のトークンを取得するため、Azure の長期クライアントシークレットは不要です。

### 本番への反映

`main` に変更を反映すると、フロント・バックそれぞれの GitHub Actions がテスト後にデプロイします。
フロントは Node.js 22 で `npm ci`、`npm test`、`npm run build` を実行し、`frontend/build` を配信します。
バックは .NET テスト後に発行し、`.azurefunctions` を含む ZIP を Flex Consumption にデプロイします。
バックの変更とデプロイ用ワークフローの変更がない場合、バックの自動デプロイは実行しません。
手動再実行は GitHub の Actions で対象ワークフローを選び、**Run workflow → main** を指定します。

Functions のデプロイ権限は `main` に限定しています。PR プレビューは本番 API を参照するため、
プレビュー画面から送信しても本番の回答として保存されることに注意してください。
本番でテスト用の回答を作らない確認には、集計 API の GET と、無効な入力に対する POST の 422 応答を使用します。

参考: [Functions の GitHub Actions デプロイ](https://learn.microsoft.com/azure/azure-functions/functions-how-to-github-actions)、
[Flex Consumption のアプリ設定](https://learn.microsoft.com/azure/azure-functions/functions-app-settings#flex-consumption-plan-deprecations)。

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
  "jobRole": ["フロントエンドエンジニア", "バックエンドエンジニア", "フルスタックエンジニア", "DevOpsエンジニア", "データエンジニア", "モバイルエンジニア", "その他"],
  "jobRoleOther": "string",
  "eventRating": 5,
  "feedback": "string"
}
```

**フィールド説明**

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
