# NeuroCurve → ChatGPT Sites / Work 引き継ぎ設計

状態: **Sites対応の実装候補を用意。ChatGPT Sitesへの公開は未実施。**


## v1.0 candidate — Multi-task scoring and redesigned Learning Lab

A new candidate implementation on a separate feature branch (do not overwrite this Sites PR directly) adds:
- Core six-task and extended ten-task local benchmark suites.
- CC BY 4.0 UCI Iris, Wine, WDBC and synthetic Circles, Spiral, XOR, Chirp with attribution and SHA-256 checks.
- Category-balanced baseline-relative game score (baseline=50), every task required, no trust claims or leaderboards.
- Responsive dark-navy/emerald studio hero, onboarding drawing shortcut, scientific per-task metrics, local SVG scorecard export.
- Dependency-free `npm run build:sites-static` keeps anonymous sharing DISABLED until actual Sites bindings/API are connected and tested.
- `npm run benchmark:suite` executes 6 tasks x 4 functions x 1 seed x 150 updates on CPU. Browser HTML acceptance requires pointer-drawing, analysis, six-task training, score export.

**Important:** Training and local share-card export do not implement publishable URL sharing. D1/R2 and `/api/config` remain required. Do not claim publication is complete on the static project. Existing live URL must be preserved when deploying from Work.

## 1. 目的と禁止事項

Railway / Vercel / 常駐のNode専用サーバーへの新規デプロイは不要。**ChatGPT Workの@Sites** を使用し、まずプライベートプレビューを生成して実機検証、その後に公開範囲を「Public」に設定する。

ユーザーのCPU/GPUで活性化関数の設計、解析、学習を実行する。サーバーでニューラルネットワークの学習を走らせてはいけない。ログイン、公開一覧、下書き自動保存、学習結果の自動送信は禁止。共有は明示同意の後に限る。

## 2. 手元のソース

- `public/index.html` — 既存のレスポンシブUI
- `public/app.js`, `public/core/activation.js`, `public/core/webgpu.js`, `public/worker.js` — 作成・解析・ローカル学習エンジン
- `public/data/` — 同梱共通データセット（Two Moons / Digits / Multi-frequency）
- `sites/worker.js` — ChatGPT Sites向け候補のFetch APIハンドラ（Node組み込みモジュールを使用しない）
- `sites/schema.sql` — D1の初期マイグレーション
- `public/og-default.png` — 静的な共有用OG画像（関数ごとの動的画像化は未実装）
- `server/` — 単一Node/SQLite版のローカル参照実装。**Sitesにそのまま配備しない**

## 3. 予定するSiteバインディング

| バインディング | 用途 | 備考 |
|---|---|---|
| `DB` (D1) | 投稿定義、冪等化、匿名レートカウンター、通報 | `sites/schema.sql` を適用 |
| `REVOCATIONS` (R2) | 共有IDのハッシュ付き独立失効記録 | D1の古いスナップショットに依存しない |
| `ASSETS` | 静的画面、JS/CSS、データセット、OG画像 | 実際のSites starterの配信方式に合わせる |
| `RATE_SALT` (Secret) | 匿名アクセスのHMAC鍵 | 32文字以上。公開リポジトリに保存しない |
| `ADMIN_TOKEN` (Secret, optional) | プライベートなメンテナンスAPI | サイトのスケジュール機能から呼ぶ場合のみ設定 |

`.openai/hosting.json`に偽の`project_id`を置かない。WorkでSiteとD1/R2を作成後、**Workが生成したIDとバインディング名をそのまま使用**する。

### 互換性の未検証事項

SitesのビルドシステムがESM Workerをどの入口・バインディング名で受け付けるかは、実際のSiteで確認が必要。`sites/worker.js`はCloudflareスタイルの候補であり、このファイルがあるだけでSitesへの公開が可能だと保証するものではない。Node `node:sqlite` とファイルシステム永続化は対象外。必要ならWorkにSites推奨スターターへ移植させる。

R2に失効記録を書けなければDELETE成功を返さない。R2読み込みに失敗した場合、共有内容は503で停止する（fail closed）。D1復元時にR2の失効記録を巻き戻さない。運営者の削除・通報対応を設ける。

## 4. API（既存ブラウザコードから変更不要を目指す）

- `GET /api/config` — サイトの機能・バックエンドを報告
- `POST /api/shares` — 64 KiBまで、明示同意、期限7/30/365/無期限、同一IDの安全な再試行
- `GET /api/shares/:id` — 有効な関数定義のみ返す
- `DELETE /api/shares/:id` — Authorizationの削除キーで失効
- `GET /f/:id` — 再評価可能なSSR共有ページ（noindex）
- `GET /f/:id/og.png` — OG用PNG。現在はサイト共通画像のみ
- `POST /api/reports` — 通報の受付
- `POST /api/maintenance` — 管理トークンによる期限切れ一括掃除。自動実行はWork上で別途設定要。

いずれも、共有時のHTTPレスポンスを`no-store`とし、期限直前・直後・削除直後に本体が返らないことを必ず実測する。

## 5. 最低限の検証手順

```sh
npm test                # 既存機能 + D1/R2モックの全部
npm run check           # 構文 / 禁止API検査
npm run test:sites      # 共有・期限・R2障害・取り消しAPIの専用テスト
```

Workでの追加必須テスト:

1. Sites開発版で実D1に投稿し、別ブラウザでも読めるか（閲覧URLと削除キーの分離）。
2. 期限切れを現時刻と比較し、HTML/API/OG画像すべてで即時遮断。
3. 失効後に古いD1スナップショットを復元しても、R2で公開を拒否する（R2障害中は503）。
4. Bot大量投稿、制御点512件、64KiB超、複数リクエスト競合、数式攻撃、外部Originの拒否。
5. Chromium/Safari/Firefox、スマートフォンで手描き→数学診断→CPU学習を一貫して完了。
6. WebGPU対応実機で順伝播、逆伝播、CPU比較、実際の学習完走。GPU必須が失敗時に黙ってCPUへ落ちない。
7. データセット3件 × Custom/ReLU/Swish/GELU × 5シードの実学習。HW/精度/バッチ/クロック(可能な場合)/所要時間を表示。
8. 不正な投稿によるXSS、削除キーのログ漏えい、SNSプレビューの残存を確認。
9. 期限切れ本文の定期掃除をSites上で運用できるよう設定し、監視する。現状の定期ジョブは**未設定**。
10. 設計どおり公開一覧・ユーザーアカウント・自動アップロードが存在しないことを確認。

**本番公開ゲート**: 上記の障害を一通り実測し、ユーザーの同意を得てSiteをPublicへ変更。未検証をPASSと表記しない。

## 6. Workでそのまま使う依頼文

以下をWorkで送る（`@Sites` を明示すると分かりやすい）。

> `@Sites NeuroCurveのWebサイトをこのGitHubブランチのコードから作成してください。Railway等の外部デプロイは禁止。NeuroCurveは完全公開・ログイン不要で、ユーザーが活性化関数を手描き・数式・パラメータで設計し、数学解析とCPU/WebGPU学習を利用者の端末で実行するプラットフォームです。ユーザーの明示同意がある場合だけ、7/30/365日または無期限の非掲載共有URLを発行し、削除キーで削除できるようにします。まず既存のpublic/とsites/worker.jsを調べ、ChatGPT Sitesランタイムの互換性を検査してください。DB=D1、REVOCATIONS=独立R2、ASSETS=静的ファイルの3バインディングを適切に用意し、sites/schema.sqlを移行適用してください。NodeのSQLiteサーバーはSitesにデプロイしないでください。ブラウザ実機検証とセキュリティ・期限切れ検証を通るまで一般公開せず、まず公開前のSiteバージョンを保存してプレビューを出してください。残る未検証事項ははっきり列挙してください。`

## 7. 参照URL

- https://help.openai.com/ja-jp/articles/20001339-creating-and-using-chatgpt-sites
- https://learn.chatgpt.com/docs/sites/creating-a-site
- https://learn.chatgpt.com/docs/sites/managing-a-site
- https://learn.chatgpt.com/docs/sites/data-and-connections

このファイルは**引き継ぎ用の実装ガイド**であり、ChatGPT Sites上での公開成功を報告するものではありません。
