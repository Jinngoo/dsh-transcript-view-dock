/**
 * 离线冒烟验证：用真实的 client.js + 真 React（从本机 DSH checkout 的 pnpm 虚拟仓解析）
 * 配合假 ctx / 假 ConfigForm，SSR 出标记并走一遍读写状态机。
 *
 * 用途：改完 client.js 后，不打开浏览器就能确认槽位登记、markup、写入/回退逻辑没坏。
 * 运行：node tests/client-render.check.mjs
 *       DSH_CHECKOUT=<checkout 根目录> 可覆盖默认的 E:/Work/Git/deepseek-harness
 */
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
// client.js 里假定自己跑在浏览器里；这里只提供 window.__ModuleLoader__ 与 console。
// Node 的 ESM 里没有 process.exitCode 之外的全局，所以 `'dshDesktop' in globalThis` 为 false，
// 插件取 Web 默认档 detailed——与浏览器一致。
const checkout = process.env.DSH_CHECKOUT ?? 'E:/Work/Git/deepseek-harness'
const pnpmStore = join(checkout, 'node_modules', '.pnpm')
const find = (pattern) => {
  const hit = readdirSync(pnpmStore).find(name => pattern.test(name))
  if (hit === undefined) throw new Error(`找不到匹配 ${pattern} 的包，检查 DSH_CHECKOUT`)
  return hit
}
const requireReact = createRequire(join(pnpmStore, find(/^react@18/), 'node_modules/react/index.js'))
const requireReactDom = createRequire(join(pnpmStore, find(/^react-dom@18/), 'node_modules/react-dom/index.js'))
const React = requireReact('react')
const { renderToStaticMarkup } = requireReactDom('react-dom/server')

const code = readFileSync(join(here, '..', 'client.js'), 'utf8')

const failures = []
const check = (ok, label, detail) => {
  if (ok) console.log('PASS', label)
  else { failures.push(label + (detail ? ` :: ${detail}` : '')); console.log('FAIL', label, detail ?? '') }
}

// ---- 假 Host 设置段：ui-chat.transcriptView ----------------------------------------------
const settings = {
  value: { transcriptView: 'detailed', performanceUsage: 'detailed' },
  writable: true,
  status: 'ready',
  writes: [],
  refuse: false,
  fail: false,
}
const listeners = new Set()
const form = {
  getSnapshot: () => ({
    status: settings.status,
    value: settings.status === 'ready' ? settings.value : undefined,
    writable: settings.writable,
  }),
  subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
  set: async (field, value) => {
    settings.writes.push([field, value])
    if (settings.fail) throw new Error('transport down')
    if (settings.refuse) return false
    settings.value = { ...settings.value, [field]: value }
    for (const fn of [...listeners]) fn()
    return true
  },
}
const publishHostValue = (patch) => {
  settings.value = { ...settings.value, ...patch }
  for (const fn of [...listeners]) fn()
}
const republish = () => { for (const fn of [...listeners]) fn() }

// ---- 假 ctx ------------------------------------------------------------------------------
let captured = null
let currentRegistration = null
const ctx = {
  effect: (fn) => { const off = fn(); return () => { if (typeof off === 'function') off() } },
  locale: {
    register: () => () => {},
    bind: () => (key, params) => {
      const template = captured.dict[key]
      if (template === undefined) return `«${key}»`
      if (!params) return template
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
    },
  },
  configForms: {
    whileServed: (namespaces, register) => {
      const off = register(new Set(namespaces))
      return typeof off === 'function' ? off : () => {}
    },
    get: () => form,
  },
  slots: {
    inject: (name, callback) => {
      const off = callback()
      return typeof off === 'function' ? off : () => {}
    },
    register: (options, Component) => {
      currentRegistration = { options, Component }
      return () => {}
    },
  },
}

const fakeWindow = { __ModuleLoader__: { load: (registration) => { captured = registration } } }
const sandbox = { window: fakeWindow, console }
sandbox.globalThis = sandbox
vm.runInNewContext(code, sandbox, { filename: 'client.js' })

check(captured !== null, 'client.js 注册了模块工厂')
check(captured.id === '@jinngoo/dsh-transcript-view-dock', '模块 id 与包名一致', captured.id)

const plugin = captured.factory((specifier) => {
  if (specifier === 'react') return React
  throw new Error('unexpected require ' + specifier)
})

// 把工厂里注册的 zh 字典捞出来，让假翻译函数能查表
captured.dict = {}
const apply = plugin.apply
plugin.apply = (realCtx) => {
  const register = realCtx.locale.register
  realCtx.locale.register = (ns, localeId, dict) => {
    if (localeId === 'zh') Object.assign(captured.dict, dict)
    return register(ns, localeId, dict)
  }
  return apply(realCtx)
}
plugin.apply(ctx)

check(plugin.inject.join(',') === 'slots,locale,configForms', 'inject 声明包含 configForms', plugin.inject.join(','))
check(currentRegistration !== null, '注册进 dock 槽位')
check(currentRegistration.options.name === 'conversation.composer.dock', '槽位=conversation.composer.dock')
check(currentRegistration.options.id === 'transcript-view', '槽位 id 是自己的，不顶掉宿主条目', currentRegistration.options.id)
check(currentRegistration.options.order === -1, 'order=-1（排在最左）', String(currentRegistration.options.order))

const render = () => renderToStaticMarkup(React.createElement(currentRegistration.Component))
const html1 = render()
check(html1.includes('tvd-btn'), '渲染出按钮')
check(html1.includes('tvd-icon'), '按钮带 14px 前置图标')
check(html1.includes('>详细<'), '按钮显示当前档位「详细」')
check(!html1.includes('tvd-name') && !html1.includes('tvd-dot'), '按钮不再渲染冗余文字标签（图标+当前值）')
check(html1.includes('aria-label="工作步骤展示，当前 详细"'), 'aria-label 保留完整语义')
check(html1.includes('title="工作步骤展示 · 选择希望看到多少工具调用细节"'), 'title 保留设置页文案')
check(!html1.includes('class="tvd-menu"'), '菜单默认收起')
check(html1.includes('aria-haspopup="menu"'), '按钮带 aria-haspopup=menu')
check(html1.includes('aria-expanded="false"'), '按钮带 aria-expanded=false')

// Dock() 不走 hook，返回元素的 props 里就是本次 activation 持有的 store
const dockEl = currentRegistration.Component()
const store = dockEl.props.store
check(typeof store.select === 'function', '拿到共享 store')

store.select('compact')
check(
  settings.writes.length === 1 && settings.writes[0][0] === 'transcriptView' && settings.writes[0][1] === 'compact',
  '写入 ui-chat.transcriptView=compact', JSON.stringify(settings.writes),
)
check(store.get().mode === 'compact', '控件立即切到 compact')
check(render().includes('>简洁<'), '切换后按钮显示「简洁」')

publishHostValue({ transcriptView: 'verbose' })
check(store.get().mode === 'verbose', '外部改动后跟随到 verbose')
check(render().includes('>完全展开<'), '按钮显示「完全展开」')

publishHostValue({ transcriptView: 'normal' })
check(store.get().mode === 'detailed', '旧值 normal 读作 detailed')
check(settings.writes.length === 1, '旧值不会被写回', JSON.stringify(settings.writes))

publishHostValue({ transcriptView: 'standard' })
settings.refuse = true
store.select('compact')
await new Promise(resolve => setTimeout(resolve, 0))
check(store.get().mode === 'standard', '宿主拒绝写入后回退到 standard', store.get().mode)

settings.refuse = false
settings.fail = true
store.select('verbose')
await new Promise(resolve => setTimeout(resolve, 0))
check(store.get().mode === 'standard', '传输失败后回退到 standard', store.get().mode)
settings.fail = false

settings.writable = false
republish()
const readonlyHtml = render()
check(readonlyHtml.includes('disabled'), 'settings 不可写时按钮 disabled')
check(readonlyHtml.includes('设置当前不可写'), 'disabled 时 title 解释原因')
settings.writable = true
republish()

publishHostValue({ transcriptView: 'wat' })
check(store.get().mode === 'detailed', '未知值回落到 web 默认 detailed')

if (failures.length > 0) {
  console.log(`\n${failures.length} 项失败:\n- ` + failures.join('\n- '))
  process.exitCode = 1
} else {
  console.log('\n全部通过')
}
