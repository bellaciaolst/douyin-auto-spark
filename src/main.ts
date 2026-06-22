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
    // 💡 针对云端运行的优化：抹除自动化特征，防止无头模式崩溃
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  })

  // 设置统一的伪装 UserAgent
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })
  await context.addCookies(douyinCookies)

  const page = await context.newPage()
  
  console.log('正在打开抖音聊天页面...')
  await page.goto('https://www.douyin.com/chat', {
    waitUntil: 'domcontentloaded',
  })

  // 等待页面流式数据加载完毕
  console.log('等待页面初始加载 (10秒)...')
  await page.waitForTimeout(10000)

  for (const targetName of targetNames) {
    console.log(`----------------------------------------`)
    console.log(`正在寻找联系人: ${targetName}`)
    
    const target = page.locator('[data-e2e="conversation-item"]').filter({
      has: page.getByText(targetName, { exact: true }),
    })
    
    // 确保联系人元素存在再点击
    try {
      await target.waitFor({ state: 'visible', timeout: 8000 })
    } catch (e) {
      console.error(`❌ 未找到联系人 [${targetName}]，可能名字不完全匹配或不在最近列表中。`)
      continue 
    }
    
    await target.click()
    console.log(`已点击联系人 [${targetName}]，等待聊天窗口加载...`)
    
    // 💡 核心稳定性保障：切换联系人后缓冲 2 秒，防止 DOM 没刷新导致发错人
    await page.waitForTimeout(2000)

    // 定位输入框 (整合多重选择器，防止组件更新)
    const editorInput = page.locator('.messageEditorimChatEditorContainer [data-slate-editor="true"][contenteditable="true"], [data-slate-editor="true"]')
    
    try {
      await editorInput.waitFor({ state: 'visible', timeout: 5000 })
      await editorInput.click()
    } catch (e) {
      console.error(`❌ 无法定位到输入框，可能页面结构改变。`)
      continue
    }
    
    // 输入并发送消息（去掉了死的定时测试小尾巴）
    await page.keyboard.insertText('自动续火花 🚀')
    await page.waitForTimeout(500) // 停顿 0.5 秒再敲回车，更安全
    await page.keyboard.press('Enter')
    
    console.log(`✅ 已向 ${targetName} 发送续火消息`)
    
    // 动作间歇，防风控
    await page.waitForTimeout(2000)
  }

  console.log(`----------------------------------------`)
  // 等待消息最终发出的缓冲时间
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
  if (browserPathFromEnv) return browserPathFromEnv
  return undefined
}

/**
 * 解析 Playwright 是否使用无头模式。
 */
function resolveHeadless(): boolean {
  const headless = process.env.PLAYWRIGHT_HEADLESS?.trim().toLowerCase()
  if (!headless) return true
  if (headless === 'true') return true
  if (headless === 'false') return false
  throw new Error('PLAYWRIGHT_HEADLESS 只能配置为 true 或 false')
}

/**
 * 解析脚本结束后是否自动关闭浏览器。
 */
function resolveAutoClose(): boolean {
  if (process.env.GITHUB_ACTIONS === 'true') return true
  const autoClose = process.env.AUTO_CLOSE?.trim().toLowerCase()
  if (!autoClose) return true
  if (autoClose === 'true') return true
  if (autoClose === 'false') return false
  throw new Error('AUTO_CLOSE 只能配置为 true 或 false')
}

/**
 * 解析抖音访问需要携带的 Cookie。
 */
function resolveDouyinCookies(): Cookie[] {
  const douyinCookieText = process.env[DOUYIN_COOKIE_KEY]?.trim()
  if (!douyinCookieText) {
    throw new Error(`请设置环境变量 ${DOUYIN_COOKIE_KEY}`)
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
    throw new Error(`请设置环境变量 ${DOUYIN_TARGET_NAMES_KEY}`)
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
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.session ? -1 : (cookie.expirationDate ?? -1),
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: toPlaywrightSameSite(cookie.sameSite),
  }
}

/**
 * 将抖音 Cookie 的 SameSite 值转换为 Playwright Cookie 值。
 */
function toPlaywrightSameSite(sameSite: SameSite | null): Cookie['sameSite'] {
  if (!sameSite) return 'Lax'
  const str = sameSite.toLowerCase()
  if (str === 'no_restriction' || str === 'none') return 'None'
  if (str === 'strict') return 'Strict'
  return 'Lax'
}

// 启动主函数
main().catch((error: unknown) => {
  console.error('启动 Chrome 访问抖音聊天页失败:', error)
  process.exitCode = 1
})
