# NeuroCurve

**手描きの活性化関数を、解析し、自分の端末で学習評価する。**

v1.0.0 マルチタスクスコア・デザイン改善の開発候補版。Apache-2.0。ログインなし、下書き自動保存なし、公開一覧なし。

> **状態**: 実行可能なアプリケーションとテストを同梱しています。公開ホスティングへのデプロイ、実機Safari/Firefox検証、本番CDNと復旧運用の検証は未完了です。GitHubの既存リポジトリは変更していません。


## v1.0 マルチタスク評価（開発候補版）

新しい「Challenge Score」画面では、既存3課題を含む10課題から固定スイートを選べます。
基本6課題：Two Moons / Circles / Digits / Iris / Multi-frequency / Chirp。
拡張10課題：さらにSpiral / XOR / Wine / Breast Cancer Wisconsin (Diagnostic)。

ゲームスコアは各タスクのReLU・Swish・GELUの誤差中央値を50点とする、端末内の相対スコアです。
分類は誤分類率 `1 - Accuracy`、回帰は `RMSE` を使用し、`50 + 50*(referenceError - customError)/(referenceError + customError + 1e-6)` で0–100点に変換します。
各タスクは同一シードで比較し、分野（非線形/画像/表データ/信号）を均等重みで集約します。未実行・失敗があると総合点は表示されません。
高速試験の1シードは探索的結果であり、5シードの結果も科学的優位性を証明しません。
標準データの由来とライセンスは `THIRD_PARTY_NOTICES.md` に記載しています。

匿名共有URLは**ChatGPT Sitesの現行静的版では使えません**。スコアをSVGカードまたはテキストで端末から明示的に書き出せますが、ブラウザの計算結果を自動でサーバーへ送りません。数値は自己申告であり、検証済みランキングではありません。共有URLを有効化するにはSitesのAPI/永続DBへの移植と本番試験が必要です。

実行検査：`npm test`, `npm run check`, `npm run build:sites-static`, `npm run benchmark:suite`。

## すぐ動かす

保守中の **Node.js 24 LTS の最新パッチ版**を推奨します。開発環境ではNode.js 22.16.0で検証しました。古い検証版へのダウングレードは不要です。Node標準のSQLite APIを使うため、環境によってExperimentalWarningが出ます。

```sh
cd NeuroCurve-release
npm start
```

表示された `http://localhost:4173` をブラウザで開いてください。**npm install・APIキー・Pythonは実行時に不要**です。Windowsは`start.cmd`、macOS/Linuxは`./start.sh`でも起動できます。

この起動方法では同じPCからの利用に限定します。共有URLを他人の端末から開けるようにするには、[公開運用の手順](docs/OPERATIONS.md)に沿ったHTTPSホスティングが必要です。

`dist/NeuroCurve-local.html` は、解析と学習専用の単一HTML版です。保存してブラウザで開けます。サーバーがないため投稿・削除・共有URLの発行は無効です。モバイルのファイルプレビューはJavaScriptを実行しない場合があります。

## 実装した機能

| 分野 | 機能 |
|---|---|
| 作成 | 手描き、点のドラッグ、数値の制御点、Undo/Redo、数式、標準関数 |
| 谷の調整 | 1〜16個、深さ・幅・位置・成長率・非対称性・内側の波、個別調整 |
| 解析 | 曲線・導関数、局所最小/最大、谷の落差と幅、負勾配、平坦率、端点外挿、数値異常 |
| 手描きの検査 | PCHIP、元の折れ線との重ね描き、制御点誤差、元と補間後の谷の数 |
| 学習 | ブラウザWebGPUコンピュート（対応端末・実行時検証）またはCPU、独立Worker、停止、共通3課題、標準3関数との比較 |
| 結果 | 実測の正解率/RMSE、範囲、中央値、シード対応差、時間、勾配、失敗、谷への入力到達率 |
| 書き出し | JSON、CSV、PNG/SVG、PyTorchコード、実験ログ |
| 共有 | 明示同意、7/30/365日/無期限、匿名削除キー、期限付き非掲載URL、SSRのOG情報、PNG |
| 管理 | レート/サイズ制限、通報、管理CLI、独立した失効台帳、バックアップ保持整理 |

**WebGPU GPU経路を実装しました（実機ブラウザ受け入れ検証は未完了）。** 学習では自動（GPU優先→CPU）、GPU必須、CPUを選択できます。GPUはWGSL計算シェーダーでFloat32順伝播・逆伝播・勾配集約・Adam更新を行い、CPUはJavaScript Float64です。GPUの起動前に実演算と全関数のカーネル検査を行い、最初の学習バッチではCPU逆伝播との勾配照合も行います。数理解析は学習なしで使用できます。詳細：[WebGPU実装と検証条件](docs/GPU_BACKEND.md)。実機で確認するには `http://localhost:4173/gpu-check.html`（公開時は同じパスをHTTPSで利用） を利用してください。

## 数式入力

変数は`x`、定数は`pi`と`e`。演算は`+ - * / ^`、括弧、`sin cos tanh sigmoid swish gelu softplus exp log sqrt abs relu`を使用できます。例は`x*sigmoid(x)`です。指数は定数かつ絶対値16以下、全体64ノード・入れ子16段までです。**evalや任意JavaScriptの実行ではありません。**

全量は無次元の実数スカラーです。GELUはtanh近似、SinLUプリセットは振幅1・周波数3、Snakeは係数1です。表示範囲外は端点接線で延長します。ReLU/absの0では実装上の劣勾配を使用します。

走査点で最大傾き25、最大出力絶対値100、端点傾き10を超える関数は学習を止めます。3073点の走査は全域の安全性の証明ではありません。実学習でも非有限値・過大値・時間予算を検査します。

## 学習プロトコル

共通条件: MLP隠れ2層、32→32、Adam、学習率0.001、バッチ64、勾配ノルム上限5、Xavier/Glorot normal初期化。Custom・ReLU・Swish・GELUで初期重みとバッチ列を対応させます。出力層は分類logitsまたは回帰の線形出力です。

| モード | シード | 各関数の更新数 |
|---|---|---:|
| 高速試験 | 17 | 150 |
| 本評価 | 17, 29, 43, 71, 101 | 600 |

1実行の上限は120秒です。各シードで比較関数の実行順を回します。停止はWorkerの終了で行います。端末が遅い場合は失敗として残し、成功に見せません。

データの約70/15/15を学習/検証/テストへ固定分割し、分類はクラス別の整数切り下げを使用します。そのため実数は各ログに記録した値を正とします。標準化係数は学習データのみから作ります。Digitsは画素値を16で割ります。

- Two Moons: 3000点、ノイズ0.20、同梱生成器。
- Digits: 1797点、8×8、10クラス。同梱JSONのSHA-256検査あり。
- Multi-frequency: 2400点、3周波数の合成、同梱生成器。

固定公開テストを何度も見て曲線を調整するとテストに適応します。本評価も研究上の一般的優位性は`UNCERTAIN`と表示します。シード間の記述的区間はデータ分割不確かさや多重比較を含みません。

## テスト

```sh
npm test
npm run check
# 以下は開発用。Python + numpy + scipy + torchが必要。
python tests/reference.py
# 管理ポリシーでURLアクセスが許可された環境のみ。
python tests/browser.py
```

`tests/browser.py`は、先に`PUBLIC_ORIGIN=http://127.0.0.1:4173 PORT=4173 npm start`で起動したサーバーを使います。`CHROMIUM_PATH`でChromium実行ファイル、`TEST_URL`でURLを指定できます。テスト投稿が3回/時制限に達した場合は専用のテスト用DBで実行してください。本番DBに対して実行しないでください。

今回の環境ではブラウザの全URLが管理ポリシーでブロックされています。WebGPU実機検証もその理由で未実施です。ポリシーを変更せず、`tests/dom_offline.py`で実ソースをabout:blankへ読み込んでDOMを検査しました。HTTP APIテストとNode Workerアダプタのテストは実行していますが、**ブラウザから公開URLへのE2E、実機WebGPUのコンパイル・学習を通過したという意味ではありません**。

[検証報告](docs/VERIFICATION.md)には、通過・未確認・再実行方法を分けて記載しています。実測ログは`evidence/`にあります。過去の会話内のベンチマークは、この実装の検証値として流用していません。

## データの保存

作業内容はタブのメモリだけです。明示された投稿だけを`.runtime/content.sqlite`へ保存します。削除・失効済みIDの最小限のハッシュ台帳は**別管理**の`.revocations/ledger.sqlite`です。どちらも公開静的ファイルには含まれません。

削除キーはブラウザで投稿前に生成し、投稿にはSHA-256だけを送ります。削除操作ではHTTPSのAuthorizationヘッダーを使用します。キーはURL・ログ・共有JSONに入りません。POST応答を失っても同じID・同じ内容で再試行できます。

独立台帳の現在状態を失うと、手動削除した投稿の復活防止を保証できません。既存content DBに対応する台帳がない場合は起動を拒否します。**contentの古いバックアップと一緒にledgerを巻き戻さないでください。**

## ライセンスと資料

コード: [Apache-2.0](LICENSE)。投稿物に本体ライセンスを自動適用しません。[利用条件](public/policy.html)は投稿前に表示されます。

Digitsの出典・ライセンス・加工内容・SHA-256: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) / `public/data/digits-meta.json`。

基準資料:
- Node.js SQLite API: https://nodejs.org/api/sqlite.html
- Node.js保守状況: https://nodejs.org/en/about/previous-releases
- PCHIP: https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.PchipInterpolator.html
- Web Workers: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
- Adam: https://arxiv.org/abs/1412.6980

数値解析が補間・微分、統計学が対応比較と不確かさ、Webセキュリティが匿名共有の権限と失効を担当する構成です。

## UX・スコア信頼性の改善（2026-10-30）

- 手描きの多少の逆方向の筆跡や、同じx座標の点を補正し、最大512制御点のPCHIP関数として扱います。大きく折り返す曲線は単一値の関数にならないため、形状が変わり得ます。
- 描き直し・Undo/Redo・評価範囲・学習モード・CPU/GPU設定を変更した場合、旧スコアを**現在の成績として表示しません**。元の条件に戻した場合のみ、未変更の結果を再表示できます。
- モバイルでは各タスクのAccuracy/RMSE・基準値・相対スコアをカードで表示し、詳細表へのアクセスも残します。各スコアバーには50点の基準線を置きます。
- **関数＋結果をファイル共有**は、本人の明示操作でOS共有メニューへJSONを渡すかJSONを保存する機能です。保存ファイルには削除キー・学習用データを含めません。これは**公開URLの投稿・失効処理の代わりにはなりません**。
- Pull Requestと`main`で自動的に検証するGitHub Actionsを追加。実機WebGPUと本番サイトのE2E合格は別途必要です。

新機能の詳細・テスト条件：[`docs/UX_AUDIT_2026-10-30.md`](docs/UX_AUDIT_2026-10-30.md)

任意のブラウザ操作試験（Python Playwright + Chromiumが必要）：

```sh
npm run build:sites-static
python tests/browser_ux.py       # Workerをモックした画面操作の検証であり、学習計算ではない
python tests/browser_real_cpu.py # CPUによる実学習のブラウザ試験
```
