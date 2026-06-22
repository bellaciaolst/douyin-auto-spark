import 'dotenv/config'
import { chromium, type Cookie } from 'playwright'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import type { DouyinCookie, SameSite } from './types/douyin-cookie'

const DOUYIN_COOKIE_KEY = 'DOUYIN_COOKIE'
const DOUYIN_TARGET_NAMES_KEY = 'DOUYIN_TARGET_NAMES'

/**
 * 启动本机 Chrome 浏览器并携带 Cookie 访问抖音聊天页。
 */
async function main(): Promise<void> {
  const browserPath = resolveBrowserPath()
  const headless = resolveHeadless()
  const autoClose = resolveAutoClose()
  const douyinCookies = resolveDouyinCookies()
  const targetNames = resolveDouyinTargetNames()
  
  const browser = await chromium.launch({
    headless,
    ...(browserPath ? { executablePath: browserPath } : {}),
  })

  const context = await browser.newContext()
  await context.addCookies(douyinCookies)

  const page = await context.newPage()
  await page.goto('https://www.douyin.com/chat', {
    waitUntil: 'domcontentloaded',
  })

  // 等待页面流式数据加载完毕
  await page.waitForTimeout(10000)

  for (const targetName of targetNames) {
    console.log(`正在寻找联系人: ${targetName}`)
    const target = page.locator('[data-e2e="conversation-item"]').filter({
      has: page.getByText(targetName, { exact: true }),
    })
    
    // 确保联系人元素存在再点击
    await target.waitFor({ state: 'visible', timeout: 5000 })
    await target.click()

    // 定位输入框
    const editorInput = page.locator('.messageEditorimChatEditorContainer [data-slate-editor="true"][contenteditable="true"]')
    await editorInput.waitFor({ state: 'visible', timeout: 5000 })
    await editorInput.click()
    
    // 输入并发送消息
    await page.keyboard.insertText('自动续火花（10:10定时版测试）')
    await page.keyboard.press('Enter')
    console.log(`已向 ${targetName} 发送续火消息`)
  }

  // 等待消息发送完毕的缓冲时间
  await page.waitForTimeout(5000)

  // 如果不是自动关闭（通常在本地调试时），则等待用户回车
  if (!autoClose) {
    const readline = createInterface({
      input,
      output,
    })

    await readline.question('Chrome 已打开抖音聊天页，按回车键关闭浏览器...')
    readline.close()
  }

  await browser.close()
  console.log('任务结束，浏览器已关闭。')
}

/**
 * 解析 Playwright 可选的浏览器启动路径。
 */
function resolveBrowserPath(): string | undefined {
  const browserPathFromEnv = process.env.PLAYWRIGHT_BROWSER_PATH?.trim()

  if (browserPathFromEnv) {
    return browserPathFromEnv
  }

  return undefined
}

/**
 * 解析 Playwright 是否使用无头模式。
 */
function resolveHeadless(): boolean {
  const headless = process.env.PLAYWRIGHT_HEADLESS?.trim().toLowerCase()

  if (!headless) {
    return true
  }

  if (headless === 'true') {
    return true
  }

  if (headless === 'false') {
    return false
  }

  throw new Error('PLAYWRIGHT_HEADLESS 只能配置为 true 或 false')
}

/**
 * 解析脚本结束后是否自动关闭浏览器。
 * 在 GitHub Actions 环境下强制返回 true，防止 CI 卡死。
 */
function resolveAutoClose(): boolean {
  // 核心安全保障：如果在 GitHub Actions 环境中，强制自动关闭，不进行命令行交互
  if (process.env.GITHUB_ACTIONS === 'true') {
    return true
  }

  const autoClose = process.env.AUTO_CLOSE?.trim().toLowerCase()

  if (!autoClose) {
    return true
  }

  if (autoClose === 'true') {
    return true
  }

  if (autoClose === 'false') {
    return false
  }

  throw new Error('AUTO_CLOSE 只能配置为 true 或 false')
}

/**
 * 解析抖音访问需要携带的 Cookie。
 */
function resolveDouyinCookies(): Cookie[] {
  const douyinCookieText = process.env[DOUYIN_COOKIE_KEY]?.trim()

  if (!douyinCookieText) {
    throw new Error(`请设置环境变量 ${DOUYIN_COOKIE_KEY}，或在 .env 中配置 ${DOUYIN_COOKIE_KEY}`)
  }

  const douyinCookies = JSON.parse(douyinCookieText) as DouyinCookie[]

  if (!Array.isArray(douyinCookies)) {
    throw new Error(`${DOUYIN_COOKIE_KEY} 必须是 Cookie 数组 JSON 字符串`)
  }

  return douyinCookies.map(toPlaywrightCookie)
}

/**
 * 解析需要发送消息的抖音会话名称。
 */
function resolveDouyinTargetNames(): string[] {
  const targetNamesText = process.env[DOUYIN_TARGET_NAMES_KEY]?.trim()

  if (!targetNamesText) {
    throw new Error(`请设置环境变量 ${DOUYIN_TARGET_NAMES_KEY}，或在 .env 中配置 ${DOUYIN_TARGET_NAMES_KEY}`)
  }

  const targetNames = JSON.parse(targetNamesText) as string[]

  if (!Array.isArray(targetNames) || targetNames.length === 0 || targetNames.some((targetName) => typeof targetName !== 'string' || !targetName.trim())) {
    throw new Error(`${DOUYIN_TARGET_NAMES_KEY} 必须是非空字符串数组 JSON`)
  }

  return targetNames.map((targetName) => targetName.trim())
}

/**
 * 将抖音 Cookie 数据转换为 Playwright Cookie 数据。
 */
function toPlaywrightCookie(cookie: DouyinCookie): Cookie {
  const playwrightCookie: Cookie = {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.session ? -1 : (cookie.expirationDate ?? -1),
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: toPlaywrightSameSite(cookie.sameSite),
  }

  return playwrightCookie
}

/**
 * 将抖音 Cookie 的 SameSite 值转换为 Playwright Cookie 值。
 */
function toPlaywrightSameSite(sameSite: SameSite | null): Cookie['sameSite'] {
  if (sameSite === 'no_restriction') {
    return 'None'
  }

  return 'Lax'
}

// 启动主函数
main().catch((error: unknown) => {
  console.error('启动 Chrome 访问抖音聊天页失败:', error)
  process.exitCode = 1
})
