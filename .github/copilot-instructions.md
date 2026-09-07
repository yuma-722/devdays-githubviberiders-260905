# Copilot Instructions
ドキュメントやIssue,PRはすべて日本語で記述する

## アーキテクチャ概要
- **フロントエンド**: React（`frontend/`）
- **バックエンド**: .NET 10 Azure Functions（`backend/Survey`）
- **データベース**: Azure Cosmos DB (NoSQL)
- **API**: REST（`/api/surveys`, `/api/surveys/results`）
- **デプロイ**: Azure Static Web Apps（フロント）、Azure Functions（バック）

## スタイル・コーディング規約
- **TypeScript/JavaScript**
  - 型安全を重視（型注釈推奨）
  - インデントはスペース2 or 4（プロジェクト設定に従う）
  - import順序は標準→外部→内部
  - 命名: キャメルケース（変数/関数）、パスカルケース（型/クラス）
  - エラー処理は明示的に
- **C# (.NET)**
  - 型明示、PascalCase命名
  - 非同期処理は `async`/`await`
  - 例外処理は try-catch で明示
- **共通**
  - コメントは日本語可
  - バリデーション・エラーハンドリングはAPI仕様に準拠

## 重要な仕様・ルール（README要約）
- **アンケートAPI**
  - POST `/surveys`: 回答登録
  - GET `/surveys/results`: 集計取得
  - 必須: `jobRole`（配列, 1つ以上）, `eventRating`（1-5）
  - オプション: `jobRoleOther`（"その他"時必須, 100字以内）, `feedback`（1000字以内）
  - レスポンス: `success`, `message`/`error`, `surveyId`/`code`
  - ステータス: 200, 201, 400, 422, 500
- **データモデル**
  - `Survey`型（README参照）
- Cosmos DB
  - 名前：cosmos-ghdevdays-260320
  - partition key: /date
