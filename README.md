# ai-cms-test

CMS を使わずに、**Claude Code で内容ファイルを書き換え、GitHub の PR → マージで公開する**更新の仕組みを試すデモです。
サイトは架空のブランド「MAISON VELISSE」の1ページです（実在のブランドとは関係ありません）。

- フロント：Astro（静的出力）
- 公開先：Cloudflare Workers Static Assets
- デプロイ：GitHub Actions（main へのマージで本番、PR でプレビュー、定時実行で予約公開）

更新担当者向けのルールは [CLAUDE.md](CLAUDE.md)、新しい号を作る手順は [.claude/skills/new-issue/SKILL.md](.claude/skills/new-issue/SKILL.md) にあります。

> 料金・上限・仕様に関する記述は、各記述に付けた日付時点で公式ドキュメントを確認したものです。変わることがあるので、使う前に最新の情報を確認してください。

---

## 目次

1. [仕組み](#仕組み)
2. [手元で動かす](#手元で動かす)
3. [ディレクトリ構成](#ディレクトリ構成)
4. [予約公開](#予約公開)
5. [テスト](#テスト)
6. [GitHub Actions](#github-actions)
7. [初回の設定手順（GitHub・Cloudflare）](#初回の設定手順githubcloudflare)
8. [ブランチ保護（2人以上で運用するとき）](#ブランチ保護2人以上で運用するとき)
9. [エンジニア向けの作業](#エンジニア向けの作業)
10. [費用と上限](#費用と上限)
11. [既知の制約](#既知の制約)

---

## 仕組み

```
更新担当者 ──(Claude Code)──▶ src/content/issues/<号ID>.json ＋ media/<号ID>/
                                   │
                                   ▼ PR
                    ┌──────────────┴───────────────┐
                    │ CI：型チェック・テスト・ビルド │
                    │ Preview：PRごとのプレビューURL │ ← 公開日時前の号も表示
                    └──────────────┬───────────────┘
                                   ▼ 承認・マージ
                    Deploy：本番ビルド → 検査 → wrangler deploy
                                   ▲
                    Scheduled：15分ごとに「公開日時が来た号」を確認し、あれば Deploy を呼ぶ
```

- **見た目は部品で固定**：ブロック部品（`src/components/blocks/`）とデザイントークン（`src/styles/tokens.css`）で決まる。内容ファイルには HTML・CSS・クラス名を書けない（zod のスキーマで拒否）
- **本番とプレビューの出し分け**：`BUILD_MODE`（`production` / `preview`）で切り替える
  - 本番：公開日時を過ぎた号だけを含める。`/` は公開済みの最新号
  - プレビュー：すべての号を含める。`/` は公開日時前の号も含めた最新号。全ページに `noindex` とプレビューの帯を付ける
  - `astro build` の既定は本番、`astro dev` の既定はプレビュー
- **未公開の素材を出さない**：本番ビルドでは、公開済みの号の `media/` だけを読み込み対象にする（`src/integrations/issue-media.ts`）。デプロイ前に `scripts/verify-dist.mjs` で `dist` を検査する
- **画像**：ビルド時に AVIF・WebP の複数サイズを作る（Astro の画像機能）
- **動画**：変換しない。そのビルドに含めた号が参照している動画だけを `dist/media/<号ID>/` にコピーする。画面に近づいてから読み込む
- **演出**：フェードイン・パララックス・背景動画。`prefers-reduced-motion` のときは止め、動画は読み込まない。スクリプトは使うブロックがあるページにだけ載る

## 手元で動かす

Node.js は `package.json` の `volta.node` の版を使います（Volta を入れていれば自動で切り替わります）。

```
npm install
npm run dev
```

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー（プレビュー扱い。公開日時前の号も表示）。ブラウザが開く |
| `npm run build` | 本番ビルド（`dist/`） |
| `npm run build:preview` | プレビュービルド |
| `npm run preview` | `dist/` を手元で配信して確認 |
| `npm run check` | 型チェック |
| `npm test` | テスト（単体＋ビルド） |
| `npm run media:dummy` | 内容ファイルが参照している素材のうち、ないものをダミーで作る（`-- --force` で作り直し） |
| `npm run media:video -- <原本> media/<号ID>/<名前>.mp4` | 背景動画を軽くする（H.264・音声なし・幅1280px以下・24fps・最大15秒） |
| `npm run verify:dist -- production` | `dist` の検査 |
| `npm run deploy:dry-run` | 本番ビルド → 検査 → デプロイの準備まで（Cloudflare には送らない） |

ダミー素材とテストの道具に `ffmpeg-static`（ffmpeg 本体、GPL-3.0）を使っています。開発用で、サイトには含めません。

## ディレクトリ構成

```
├─ CLAUDE.md                     更新担当者向けのルール
├─ .claude/
│  ├─ settings.json              Claude Code の権限（内容ファイル・素材以外の編集を禁止）
│  └─ skills/new-issue/SKILL.md  新しい号を作って PR を出す手順
├─ .github/
│  ├─ CODEOWNERS
│  └─ workflows/                 ci / deploy / preview / scheduled
├─ media/<号ID>/                 画像・動画
├─ src/
│  ├─ content/issues/<号ID>.json 内容ファイル
│  ├─ content.config.ts          content collection の定義
│  ├─ lib/                       スキーマ（schema.ts）・公開判定（issues.ts）など
│  ├─ integrations/issue-media.ts ビルド条件の決定、素材の選別、動画の出力
│  ├─ components/blocks/         ブロック部品
│  ├─ scripts/                   演出のスクリプト
│  ├─ styles/tokens.css          デザイントークン
│  └─ pages/                     / ・ /issues/[id]/ ・ /build-info.json
├─ scripts/                      ダミー素材・動画の変換・dist の検査・予約公開の判定
├─ tests/                        unit（単体）・build（ビルド）・fixtures（テスト用の号）
└─ wrangler.jsonc                Static Assets だけの Worker の設定
```

## 予約公開

- 内容ファイルの `publishAt` を過ぎた号だけが、本番ビルドに含まれます
- 公開日時前に PR をマージしておけば、公開日時のあとの定時実行で自動的に本番が更新されます

### 定時実行の仕組み（`.github/workflows/scheduled.yml`）

1. **15分ごと**（毎時 7・22・37・52 分、UTC の cron）に動く
2. 本番の `/build-info.json`（前回の本番デプロイに含めた号の一覧）と、「今の時刻で本番に出すべき号」を比べる
3. **違うときだけ**本番デプロイ（`deploy.yml`）を呼ぶ。同じなら `npm install` もせず、数秒で終わる

### 反映の遅れ

| 要素 | 遅れ |
|---|---|
| 定時実行の間隔 | 最大15分 |
| ビルドとデプロイ | 2〜3分ほど |
| GitHub 側の遅れ | 混雑時に遅れることがある。負荷が高いと実行されないこともある（2026-11-19確認） |

**目安は公開日時から20分ほど以内ですが、保証はありません。** 時刻ちょうどの公開が必要な場合は、公開日時のあとに Actions の「Scheduled publish」か「Deploy (production)」を手動で実行してください。

- GitHub の定時実行は最短5分間隔です。間隔を短くすると遅れは減りますが、実行回数が増えます
- **Public リポジトリでは、60日間リポジトリに動き（コミットなど）がないと、定時実行が自動で止まります**（2026-11-19確認）。止まった場合は、Actions の「Scheduled publish」を開いて「Enable workflow」を押します

参考：[Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)、[Disabling and enabling a workflow](https://docs.github.com/en/actions/using-workflows/disabling-and-enabling-a-workflow)

## テスト

```
npm test            # すべて
npm run test:unit   # 単体（1秒未満）
npm run test:build  # ビルド（10秒ほど）
```

- **単体**（`tests/unit/`）：スキーマが受け付けるもの・拒否するもの、公開判定（境目の時刻を含む）、号IDの検査、素材の参照の収集、実際の内容ファイルがスキーマに合っているか
- **ビルド**（`tests/build/`）：一時フォルダにテスト専用の号（`tests/fixtures/issues/`）を置いて、実際に `astro build` を実行する
  - 内容ファイルがスキーマに合わない・号IDとファイル名が違う・素材がないと、ビルドが失敗する
  - 本番ビルドに、公開日時前の号のページ・文言・画像・動画が含まれない
  - `/` に公開済みの最新号が出る
  - プレビューでは公開日時前の号も出て、`noindex` と帯が付く
  - `BUILD_TIME` で時刻を固定し、公開日時の境目で切り替わる
  - `NODE_ENV` が `development` や `test` でも、本番ビルドに公開日時前の号が含まれない

`BUILD_TIME`（ISO 8601）を指定すると、ビルドの基準時刻を固定できます。テスト用です。本番のデプロイでは指定しません。

## GitHub Actions

| ワークフロー | 動くとき | 内容 | Secrets |
|---|---|---|---|
| `ci.yml` | PR | 型チェック、テスト、本番・プレビューのビルドと `dist` の検査 | 使わない |
| `deploy.yml` | main への push、定時実行から、手動 | テスト → 本番ビルド → 検査 → `wrangler deploy`。main 以外では動かない | Environment `production` |
| `preview.yml` | PR の作成・更新・クローズ | プレビュービルド → `wrangler preview --name pr-<番号>`。クローズで削除 | Environment `preview` |
| `scheduled.yml` | 15分ごと、手動 | 予約公開の判定。必要なときだけ `deploy.yml` を呼ぶ | 判定には使わない |

安全のための約束事：

- `pull_request_target` は使わない。フォークからの PR には Secrets を渡さない（プレビューは同じリポジトリ内のブランチからの PR だけ）
- 書き込み権限（`permissions: write`）は付けない
- 外部のアクションはコミット SHA で固定する
- `npm ci --ignore-scripts` でインストール時のスクリプトを動かさない
- プレビューURLは PR にコメントせず、実行結果の Summary に出す（Public リポジトリでは Summary も誰でも見られる点に注意）

## 初回の設定手順（GitHub・Cloudflare）

ここに書いた操作は、外部サービスに変更を加えるため、人が行います。

### 1. 公開前の確認

- リポジトリ内に、実在の企業名・個人情報・秘密情報がないこと（`git grep` などで確認）
- `.env` などがコミットに含まれていないこと（`.gitignore` 済み）

### 2. Cloudflare

1. Cloudflare のアカウントを用意する（Workers の Free プランで動きます）
2. **Account ID** を控える：ダッシュボードで `Cmd/Ctrl + K` →「Copy account ID」、または「Workers & Pages」の「Account Details」（2026-11-19確認）
3. workers.dev のサブドメインを用意する：初めて Workers を使う場合は、「Workers & Pages」で workers.dev のサブドメインを登録します。**要確認**：登録の画面と手順は、公式ドキュメントで確認できませんでした
4. **API トークン**を作る：「My Profile → API Tokens → Create Token」で、テンプレート「Edit Cloudflare Workers」を選び、対象のアカウントを1つに絞る（2026-11-19確認）
   - **要確認**：このテンプレートには Workers の編集以外の権限も含まれている可能性があります。権限の一覧は公式ドキュメントに書かれていませんでした。作成の画面で中身を確認し、不要なもの（KV・R2・ゾーン関係など）は外してください
   - 本番用とプレビュー用でトークンを分けると、片方が漏れたときの影響を小さくできます

### 3. GitHub リポジトリ

1. GitHub で **Public** リポジトリを作る（README などは追加しない）
2. 手元のリポジトリを push する。既定のブランチは `main` にする

   ```
   git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
   git push -u origin main
   ```

   この時点で `deploy.yml` が動きますが、Secrets がまだないので失敗します（問題ありません）

3. **CODEOWNERS** の `@YOUR_GITHUB_USERNAME` を、エンジニアの GitHub ユーザー名に差し替えて、PR → マージする（`.github/CODEOWNERS`）
4. **Actions の設定**（Settings → Actions → General）
   - Workflow permissions：「Read repository contents and packages permissions」
   - Fork pull request workflows：外部の人からの PR のワークフローは、承認してから動かす設定にする

### 4. Secrets と変数

Settings → Environments で、Environment を2つ作ります。

| Environment | Deployment branches | Secrets |
|---|---|---|
| `production` | Selected branches：`main` だけ | `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` |
| `preview` | 制限なし（PR のブランチから使うため） | `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` |

- トークンは GitHub の Secrets にだけ置きます。リポジトリや手元のファイル、チャットには書きません

### 5. 初回デプロイ

1. Actions の「Deploy (production)」を開き、「Run workflow」で main から実行する
2. ログの `wrangler deploy` の出力に出る本番のURL（`https://ai-cms-test.<サブドメイン>.workers.dev`）を控える
3. Settings → Secrets and variables → Actions → **Variables** に、リポジトリ変数 `PRODUCTION_URL` として、そのURLを登録する
   - 未登録の間は、定時実行は警告を出して何もしません
4. 「Scheduled publish」を手動で実行し、Summary に「本番の号は最新です」と出ることを確認する

### 6. 最初の PR で確認すること（要確認の項目）

Workers Previews は、2026-11-19 時点で **open beta** です（`wrangler preview --help` の表示より）。次の点は公式ドキュメントで確認できなかったため、最初の PR で確かめてください。

- [ ] Static Assets だけ（Worker のスクリプトなし）の構成で、`wrangler preview` が成功するか
- [ ] `wrangler preview --json` の出力から、`.preview.urls[0]` でURLを取り出せるか（「Preview (PR)」の Summary にURLが出るか）
- [ ] プレビューURLで、公開日時前の号・帯・`noindex`（`X-Robots-Tag` を含む）が確認できるか
- [ ] PR をクローズすると、プレビューが削除されるか

うまくいかない場合は、`wrangler versions upload --preview-alias pr-<番号>`（Version URLs）に置き換える案があります。

### 7. 予約公開の確認

- サンプルの 12月号（`2026-12`）は、公開日時が `2026-12-01T10:00:00+09:00` です
- 公開日時のあと、20分ほどで `/` が 12月号に切り替わることを確認する

## ブランチ保護（2人以上で運用するとき）

GitHub では、PR の作成者は自分の PR を承認できません。アカウントが1つのうちは承認必須にするとマージできなくなるので、更新担当者とエンジニアのアカウントが別にそろってから設定します。

Settings → Rules → Rulesets → New branch ruleset（2026-11-19確認）：

- Enforcement status：Active
- Bypass list：空のまま（管理者も例外にしない）
- Target branches：Include default branch
- Rules：
  - Restrict deletions
  - **Require a pull request before merging**
    - Required approvals：1
    - Dismiss stale pull request approvals when new commits are pushed
    - **Require review from Code Owners**
    - **Require approval of the most recent reviewable push**（最後に push した人以外の承認が必要になる。作成者が自分でマージする形を防ぐ）
  - **Require status checks to pass**：「型チェック・テスト・ビルド」を追加（一度 CI が動いたあとに候補に出ます）
  - Block force pushes

CODEOWNERS との組み合わせ：

- 内容ファイル（`src/content/issues/`）と素材（`media/`）だけの PR：書き込み権限のある人なら誰の承認でもよい
- それ以外のファイルを含む PR：コードオーナー（エンジニア）の承認が必要

参考：[Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)、[About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)

## エンジニア向けの作業

### Claude Code の編集制限を外す

`.claude/settings.json` で、`src/content/issues/` と `media/` 以外の編集を禁止しています。部品などを変えるときは、エディタで `.claude/settings.json` の `deny` を一時的に外してから Claude Code を起動してください（どこか1か所で禁止されたものは、`.claude/settings.local.json` などで許可し直せません）。

- この制限は Claude Code の組み込みツール（Edit・Write など）と、Bash の一部のコマンド（`sed`・`tee`・リダイレクトなど）に効きます。Node や Python のスクリプト経由の書き込みまでは防げません
- 最終的な歯止めは、CODEOWNERS とブランチ保護（エンジニアの承認）です

### ブロックを追加する

1. `src/lib/schema.ts` にブロックのスキーマを追加する
2. `src/components/blocks/` に部品を作り、`src/components/BlockRenderer.astro` に追加する
3. 素材を参照するなら、`src/lib/media-refs.ts` にも追加する
4. `tests/unit/schema.test.ts` にテストを追加する
5. CLAUDE.md の「使えるブロック」を更新する

### 設計上の注意

- ビルドのモードと基準時刻は、`src/integrations/issue-media.ts` が Astro のコマンドから1回だけ決め、`process.env.BUILD_MODE`・`BUILD_TIME` に書き込みます。ページ側でモードを判定するときは `src/lib/build-mode.ts` の `getBuildMode()` を使ってください
  - `import.meta.env.DEV` は `NODE_ENV` に左右されるため使いません（`NODE_ENV=test` で本番ビルドがプレビュー扱いになる不具合がありました）
- 画像は `import.meta.glob` を直接使わず、`src/lib/media.ts` の `loadIssueImage()` を使ってください。`import.meta.glob` は一致したファイルをすべて出力するため、公開日時前の号の画像が `dist` に出てしまいます

## 費用と上限

すべて無料の範囲で動かす想定です（2026-11-19確認）。

| サービス | 内容 |
|---|---|
| Cloudflare Workers（Free） | 静的ファイルへのリクエストは無料で上限なし。1バージョン 20,000 ファイルまで、1ファイル 25MiB まで |
| Cloudflare Workers Previews（Free） | 1つの Worker につき Preview 100件まで（上限を超えると古いものから削除） |
| GitHub Actions | Public リポジトリでは標準のランナーを無料で使える。定時実行は1日96回動く（判定だけなら1回数秒） |

参考：[Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)、[Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)、[Workers Previews](https://developers.cloudflare.com/workers/previews/)、[GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

## 既知の制約

- **公開日時前の号も、GitHub 上では誰でも読めます**（Public リポジトリのため）。本番サイトに出ないだけです
- **プレビューURLは、URLを知っていれば誰でも見られます**。workers.dev のプレビューには `X-Robots-Tag: noindex` が付き、ページにも `noindex` を入れていますが、アクセスの制限はしていません
- 予約公開は定時実行によるため、公開日時ちょうどには切り替わりません（[予約公開](#予約公開)）
- 動画はビルド時に変換しません。置く前に `npm run media:video` で軽くしてください
