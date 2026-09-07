# アンケート API

.NET 10 / Azure Functions v4 isolated worker の HTTP API です。API 契約はルートの README に従います。

## ローカル起動（Azure 接続不要）

.NET 10 SDK と Azure Functions Core Tools v4 が必要です。HTTP トリガーのみのため、File モードでは Azurite と `AzureWebJobsStorage` は不要です。

リポジトリのルートから PowerShell で実行します。

```powershell
Set-Location .\backend\Survey
$env:FUNCTIONS_WORKER_RUNTIME = 'dotnet-isolated'
$env:AZURE_FUNCTIONS_ENVIRONMENT = 'Development'
$env:SurveyStorage__Provider = 'File'
$env:SurveyStorage__FilePath = Join-Path (Get-Location) 'data\surveys.json'
func start --port 7071
```

- POST `http://127.0.0.1:7071/api/surveys`
- GET `http://127.0.0.1:7071/api/surveys/results`

フロントエンドの開発サーバーから `/api` を上記 Functions ホストへプロキシします。別のバックエンドと同時に実行するときは、`--port 7072` など専用ポートを使ってください。

Core Tools 4.9.0 では `AzureWebJobsStorage` 未設定に関するホストのヘルスチェック警告が出ることがあります。HTTP 専用の File モードはこの状態でもリクエストを処理できます。本番環境のホストストレージ設定を省略できるという意味ではありません。

`local.settings.json` は必須ではありません。環境変数の代わりに設定ファイルを使う場合は `Survey/local.settings.example.json` を `Survey/local.settings.json` にコピーします。秘密情報と回答データはコミットしません。

設定ファイルの `Values` も環境変数も `SurveyStorage__Provider` のように `__` 区切りへ統一してください。`.NET` 内では `SurveyStorage:Provider` として参照します。`:` 形式と `__` 形式を同時に設定すると同一設定へ正規化されるため、混在させないでください。結合テストでは設定ファイルなし・環境変数のみの指定を推奨します。

## 設定

| 環境変数 | 説明 |
|---|---|
| `FUNCTIONS_WORKER_RUNTIME` | `dotnet-isolated` |
| `AZURE_FUNCTIONS_ENVIRONMENT` | ローカル File モードは `Development`。本番は `Production` |
| `SurveyStorage__Provider` | `Cosmos`（未指定時の既定）または明示的に `File` |
| `SurveyStorage__FilePath` | File モードで必須。JSON ファイルの絶対パスを推奨。相対パスはワーカーのコンテンツルート基準 |
| `Cosmos__Endpoint` | Cosmos モードで必須。既存アカウント例: `https://cosmos-ghdevdays-260320.documents.azure.com:443/` |
| `Cosmos__DatabaseName` | Cosmos モードで必須。既存データベース名 |
| `Cosmos__ContainerName` | Cosmos モードで必須。パーティションキーが `/date` の既存コンテナー名 |

Cosmos モードは singleton の `CosmosClient` と `DefaultAzureCredential` を使います。デプロイ先ではマネージド ID、開発では既存の Azure CLI サインインなど、Azure SDK がサポートする資格情報を利用できます。ユーザー割り当てマネージド ID を使う場合は `AZURE_CLIENT_ID` を設定します。対象コンテナーの読み取り・作成に必要な Cosmos DB データプレーン権限を事前に割り当ててください。キーや接続文字列はコードに保持しません。

本実装はリソースを作成・変更しません。Cosmos のデータベース・コンテナー作成や権限付与、Azure Functions ホスト自体に必要な本番ストレージ設定は、デプロイ担当者が別途行います。必須設定の欠落・未知の Provider・Development 以外の File 指定は起動エラーです。接続、認証、読み書きの障害は成功扱いや File への自動フォールバックにせず、HTTP 500 を返します。機密情報を返さないため、HTTP 境界では例外種別のみをログに記録します。

## 保存と集計

- 回答項目は `jobRole`（職種の配列、1 つ以上）と `eventRating`（1～5 の整数）が必須です。`jobRoleOther`（100 文字以内、職種に「その他」を選んだ場合は必須）と `feedback`（1000 文字以内）は任意です。
- `id`、`createdAt`、`updatedAt` はサーバー生成です。時刻は UTC、`date` は UTC の `yyyy-MM-dd` です。
- 同じ回答内の職種を重複排除して保存し、集計でも重複を数えません。
- 未知の JSON 項目は無視します。旧形式の追加項目がある保存済み回答も読み取り・集計でき、事前のデータ移行や削除は不要です。新規回答の保存と集計レスポンスには現行の項目だけを含めます。
- 集計結果は回答総数 `totalResponses`、職種別件数 `jobRole`、評価の平均・分布 `eventRating`、自由記述一覧 `feedback` を返します。
- Cosmos の結果は継続ページを最後まで読み取ります。全期間の回答を集計するため、回答数に応じてメモリー使用量と RU 消費が増えます。
- File モードは再起動後も回答を維持します。プロセス内の非同期セマフォとプロセス間の排他ロックを使い、同一ディレクトリで一時ファイルを置換します。ロック競合はキャンセル可能な待機を行い、10 秒経過後は障害として扱います。
- File モードは同一マシンの開発用途専用です。ネットワーク共有や複数マシン間での排他を保証しません。`.lock` は残りますが、ファイルの存在ではなく OS のファイルハンドルでロックします。
- 未作成ファイルのみ空の回答集合として扱います。JSON 破損、不正な保存レコード、重複 ID、読み取り権限エラーは黙殺せず、破損データの上書きを防ぎます。
- 自由記述の空文字・空白のみは集計一覧から除外します。その他は元のテキストを保持します。文字数の上限は .NET / JavaScript と同じ UTF-16 コード単位です。

不正 JSON、非オブジェクト、配列・文字列の型違い、整数でない評価は 400 (`INVALID_REQUEST`)。必須値の欠落/null、未知の選択肢、空の職種、その他の未記入、上限超過、評価範囲外は 422 (`VALIDATION_ERROR`)。ストレージ障害は 500 (`INTERNAL_SERVER_ERROR`) です。

## ビルドとテスト

リポジトリのルートから実行します。

```powershell
dotnet build .\backend\Survey\Survey.csproj --configuration Release
dotnet test .\backend\Survey.Tests\Survey.Tests.csproj --configuration Release
dotnet publish .\backend\Survey\Survey.csproj --configuration Release --output .\backend\Survey\publish
```

自動テストはバリデーション境界、0 件・職種の重複排除の集計、旧保存形式の読み取りと集計、UTC メタデータ、File の永続化・競合・破損、Cosmos SDK のページング・パーティションキー、HTTP ステータス・レスポンス形式を対象にします。Cosmos はモックを使用し、実際の Azure にアクセスしません。公開 API は匿名アクセスのため、実運用時の不正投稿対策や集計結果の公開範囲は別途検討してください。

## 参照

- [Azure Functions isolated worker ガイド](https://learn.microsoft.com/azure/azure-functions/dotnet-isolated-process-guide)
- [Azure Functions isolated worker への移行と公式コード例](https://learn.microsoft.com/azure/azure-functions/migrate-dotnet-to-isolated-model)
- [Cosmos DB .NET SDK の非同期ページングの公式コード例](https://learn.microsoft.com/azure/cosmos-db/find-request-unit-charge#use-the-net-sdk)
- [Azure Identity の DefaultAzureCredential](https://learn.microsoft.com/dotnet/api/azure.identity.defaultazurecredential)

Azure Functions テンプレート用 MCP と Azure best practices MCP は実装時にタイムアウトしたため、公式ガイド・公式コードサンプルを代替として利用しています。
