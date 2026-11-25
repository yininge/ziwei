# ziwei

紫微斗數的兩個小工具，同一個 Cloudflare Worker 部署，Access 擋全站。

| | 網址 | 本機 |
|---|---|---|
| 排盤（命盤、大限流年、合盤、問事紀錄） | https://ziwei.yi-bc8.workers.dev/chart.html | `node server.js` → http://127.0.0.1:8765/chart.html |
| 斗數堂（四化／干支速記 quiz） | https://ziwei.yi-bc8.workers.dev/ | 直接開 `index.html` |

排盤結果以老師的 https://andylifemap-ziwei.pages.dev/ 為準（`test/golden/`），引擎用 iztro 2.6.5（`vendor/`）。
人員資料在瀏覽器端用 passphrase 整包 AES-GCM 加密後才存 KV，Cloudflare 只看得到密文；**passphrase 忘了沒人能解**。

```bash
node --test        # 55 tests
node server.js     # 本機開發，資料在 data/people.json（不進 git）
git push           # main 推上去 Cloudflare Workers Builds 自動部署
```

部署與設定細節見 [DEPLOY.md](DEPLOY.md)。GitHub Pages 已於 2026-11-25 關閉，舊網址 yininge.github.io/ziwei 不再服務。
