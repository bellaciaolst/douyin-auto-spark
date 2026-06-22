name: 🚀 续一次火  <-- ❗ 就是这行写错了，把它彻底删掉！
import 'dotenv/config'
import { chromium, type Cookie } from 'playwright'
// ... 后续代码

on:
  workflow_dispatch:
  schedule:
    # 北京时间 10:50 (对应 UTC 时间 02:50)
    - cron: "50 2 * * *"

jobs:
  run:
    runs-on: ubuntu-22.04
    timeout-minutes: 15

    steps:
      - name: 克隆当前仓库 (Clone current repo)
        uses: actions/checkout@v4

      - name: 自动安装 Bun (Set up Bun)
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: 安装运行时依赖 (Install dependencies)
        run: bun install --production

      # 真正下载 Chromium 浏览器（只下载这一个，速度极快）
      - name: 下载 Playwright 浏览器
        run: bunx playwright install chromium

      # 安装 Linux 运行浏览器所需的系统依赖
      - name: 安装 Playwright 系统依赖
        run: bunx playwright install-deps chromium

      # 执行自动化续火脚本
      - name: 续一次火 (Run spark job)
        env:
          DOUYIN_COOKIE: ${{ secrets.DOUYIN_COOKIE }}
          DOUYIN_TARGET_NAMES: ${{ secrets.DOUYIN_TARGET_NAMES }}
          PLAYWRIGHT_HEADLESS: "true"
          AUTO_CLOSE: "true"
        run: bun src/main.ts

      # 【新增优化】无论成功还是失败，都将运行过程中的截图保存下来
      # 方便在 Actions 页面下载查看（防止因风控、滑块验证码或 Cookie 失效导致抓瞎）
      - name: 上传自动化调试截图 (Upload Screenshots)
        if: always() 
        uses: actions/upload-artifact@v4
        with:
          name: douyin-screenshots
          path: "*.png"
          retention-days: 3
