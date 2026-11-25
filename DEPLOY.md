# 部署到 Cloudflare Workers

正式網址：**https://ziwei.yi-bc8.workers.dev/chart.html**（排盤）、https://ziwei.yi-bc8.workers.dev/（斗數堂）。Access 擋全站，只放 yi@honulab.com。

架構：靜態檔（`chart.html`、`app/`、`vendor/`）＋ `worker/index.js`（只處理 `/api/people`）＋ KV（存整包密文）＋ Access（擋在最前面）。
資料在瀏覽器端用 passphrase 導出的金鑰整包 AES-GCM 加密，Cloudflare 只看得到密文。

## 本機先確認

```bash
node --test
```

全綠再往下。

## 一、建 KV namespace

1. Cloudflare dashboard → **Workers & Pages → KV** → **Create a namespace**，名稱 `ziwei-people`。
2. 把它的 **ID** 填進 `wrangler.jsonc` 的 `kv_namespaces[0].id`。

## 二、建 Worker 並連 GitHub

1. **Workers & Pages → Create application → Import a repository**（GitHub 登入選 `yininge`），選 `yininge/ziwei`、branch `chart-system`。
2. Worker 名稱要是 **`ziwei`**（必須跟 `wrangler.jsonc` 的 `name` 一樣，不然 build 會失敗）。
3. Build 設定：
   - Build command：留空
   - Deploy command：留預設 `npx wrangler deploy`（wrangler 版本釘在 `package.json` 的 devDependencies，升版改那一行）
   - Root directory：`/`
4. 先不要按 Deploy，下一步設完 Access 再來。

（之後每次 push `chart-system` 都會自動重新部署。）

## 三、Access 擋在前面

1. 進剛建的 Worker → **Access** 分頁 → **Protect this Worker behind Access**。這會保護這個 Worker 的所有網域（workers.dev、之後加的自訂網域都算）。
2. Policy：只允許妳自己的 email（Include → Emails）。登入方式用 One-time PIN 就好。Session duration 設長一點（例如 1 個月），手機才不用一直登入。
3. 啟用後的彈窗會給兩個值，填進 `wrangler.jsonc` 的 `vars`：
   - `TEAM_DOMAIN`：`https://<team>.cloudflareaccess.com`
   - `POLICY_AUD`：Access application 的 AUD tag（也可在 Zero Trust → Access → Applications → 該 app → Overview 看到）

這兩個值不是秘密，直接 commit 沒關係。Worker 自己會再驗一次 `Cf-Access-Jwt-Assertion`，兩個值沒填時 `/api/people` 會回 500，不會裸奔。

## 四、Commit、push、部署

```bash
git add wrangler.jsonc
```

```bash
git commit -m "wrangler：填入 KV id 與 Access 參數"
```

```bash
git push
```

回 dashboard 看 **Deployments**，綠了就開 https://ziwei.yi-bc8.workers.dev/chart.html。
第一次會先跳 Access 登入，再跳 app 的 passphrase 設定畫面。**passphrase 存進 1Password，忘了沒人能解。**

## 五、手機

Safari 開同一個網址 → 分享 → 加入主畫面。勾「記住這台裝置」就不用每次打 passphrase（金鑰以不可匯出的形式存在瀏覽器的 IndexedDB）。

## 自訂網域（可選）

Worker → **Settings → Domains & Routes → Add → Custom domain**，填妳某個 Cloudflare 託管網域的子網域。Access 的保護會自動涵蓋。

## 已知限制

- KV 不是強一致：兩個裝置在幾秒內同時存，後者可能蓋掉前者（單人使用機率極低）。真要解再上 Durable Objects。
- Cloudflare 帳號本身要開 2FA（最好硬體金鑰）：帳號被拿走的人改得了前端 JS，就能在妳下次登入時偷 passphrase。這是「前端和儲存同一家」的殘餘風險。
- `index.html`（斗數堂 quiz）會一起部署在 `/`，排盤在 `/chart.html`。

## 本機開發

```bash
node server.js
```

開 `http://127.0.0.1:8765/chart.html`。本機存的 `data/people.json` 也是密文，備份請用 app 裡的「匯出」（明文 JSON）。
