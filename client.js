/**
 * @jinngoo/dsh-transcript-view-dock 的 Client 半边。
 *
 * 把「设置 → 通用设置 → 工作步骤展示」这一个偏好搬到输入框下方那行 dock 的最左侧：
 * 一个紧凑按钮显示当前档位，点开是同样的四档（简洁 / 标准 / 详细 / 完全展开）。
 *
 * 值不在浏览器存储里，而在 ui-chat 的 Host 设置段 `ui-chat.transcriptView`。本插件用
 * Client 侧公共 Service `ctx.configForms.get('ui-chat')` 绑定同一段设置：ConfigForms 按
 * 命名空间共享同一个 ConfigForm 实例，所以本控件与设置页那一行共用一个写队列与同一套
 * revision 栅栏，两边同时改也不会互相覆盖；宿主拒绝时同一个实例会自动回读，控件随之回退。
 *
 * 取值规则与 ui-chat 的 TranscriptViewPolicy 对齐：旧世代保存值 normal / expanded 读作
 * detailed；字段缺失时用平台默认（桌面 standard，Web detailed）。
 *
 * 不读宿主 DOM、不写宿主样式：按钮与菜单都是自带元素 + 主题 token。
 */
window.__ModuleLoader__.load({
  id: '@jinngoo/dsh-transcript-view-dock',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** 本插件占用的语言命名空间。 */
    const NS = 'transcript-view-dock'
    /** 槽位：输入框卡片下方的环境条目（和「内容宽度」滑杆同一行）。 */
    const DOCK_SLOT = 'conversation.composer.dock'
    /** 槽位内的登记 id：必须是自己的 id，复用宿主 id 会顶掉宿主条目。 */
    const DOCK_ID = 'transcript-view'
    /** order 取负值 = 排在这一行最左侧（activity / usage 是 0 / 1，宽度滑杆是 10）。 */
    const DOCK_ORDER = -1
    /** 偏好归属：ui-chat 的 Host 设置段与字段名。 */
    const SETTINGS_NS = 'ui-chat'
    const SETTINGS_FIELD = 'transcriptView'
    /** 四档，顺序与设置页一致。 */
    const MODES = ['compact', 'standard', 'detailed', 'verbose']
    /** 旧世代保存值：只做读取映射，绝不再写回。 */
    const LEGACY_MODES = { normal: 'detailed', expanded: 'detailed' }
    /** 没有保存值时的默认档位：与 ui-chat 的平台默认一致。 */
    const DEFAULT_MODE = 'dshDesktop' in globalThis ? 'standard' : 'detailed'

    const DICTS = {
      zh: {
        title: '工作步骤展示',
        description: '选择希望看到多少工具调用细节',
        buttonAria: '工作步骤展示，当前 {mode}',
        readonly: '设置当前不可写，无法从这里切换',
        compact: '简洁',
        standard: '标准',
        detailed: '详细',
        verbose: '完全展开',
      },
      en: {
        title: 'Work details',
        description: 'Choose how much detail to show for tool calls',
        buttonAria: 'Work details, {mode}',
        readonly: 'Settings are read-only right now',
        compact: 'Compact',
        standard: 'Standard',
        detailed: 'Detailed',
        verbose: 'Verbose',
      },
    }

    /**
     * 组件外观：对齐宿主的 dock 条目规范（ui-chat StatsPills / ui-conversation ContextMeter）——
     * 扁平透明底、label-tertiary、hover 才出 interactive-bg-hover、1px 8px 内边距、
     * --dsw-radius-sm、secondary 字号、tabular-nums。只引用主题 token，
     * token 改名只会掉样式，不会崩渲染。
     */
    const CHROME_CSS = [
      '.tvd{position:relative;display:inline-flex;align-items:center;flex:none;min-width:0}',
      '.tvd-btn{display:inline-flex;align-items:center;gap:6px;padding:1px 8px;border:none;',
      'border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);',
      'font-family:inherit;font-size:var(--dsh-content-font-size-secondary,13px);',
      'line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));',
      'font-variant-numeric:tabular-nums;white-space:nowrap;cursor:pointer}',
      '.tvd-btn:hover:not(:disabled),.tvd-btn[data-open="true"]{background:var(--dsw-alias-interactive-bg-hover);',
      'color:var(--dsw-alias-label-secondary)}',
      '.tvd-btn:disabled{cursor:default;opacity:.55}',
      '.tvd-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.tvd-icon,.tvd-chevron{flex:none}',
      '.tvd-value{color:var(--dsw-alias-label-primary)}',
      '.tvd-chevron{opacity:.7;transition:transform .12s ease}',
      '.tvd-btn[data-open="true"] .tvd-chevron{transform:rotate(180deg)}',
      '.tvd-menu{position:absolute;left:0;bottom:calc(100% + 6px);z-index:40;display:flex;flex-direction:column;',
      'min-width:172px;padding:4px;border-radius:var(--dsw-radius-lg);',
      'background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay));',
      'backdrop-filter:var(--dsw-menu-backdrop-filter,none);box-shadow:var(--dsw-elevation-prominent);',
      'color:var(--dsw-alias-label-primary)}',
      '.tvd-menu-head{padding:4px 8px 6px}',
      '.tvd-menu-title{font-size:12px;line-height:16px;font-weight:500}',
      '.tvd-menu-desc{padding-top:2px;font-size:11px;line-height:15px;',
      'color:var(--dsw-alias-label-secondary);white-space:normal}',
      '.tvd-item{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;',
      'height:26px;padding:0 8px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;',
      'color:inherit;font:inherit;font-size:13px;line-height:26px;text-align:left;white-space:nowrap;cursor:pointer}',
      '.tvd-item:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.tvd-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.tvd-check{flex:none;color:var(--dsw-alias-brand-primary)}',
    ].join('')

    /** 把宿主接受的设置段折成四档里的一个。 */
    function toMode(section) {
      const saved = section === undefined || section === null ? undefined : section[SETTINGS_FIELD]
      const legacy = LEGACY_MODES[saved]
      if (legacy !== undefined) return legacy
      return MODES.includes(saved) ? saved : DEFAULT_MODE
    }

    /**
     * 一份偏好供所有挂载实例共享（槽位是常驻的，但不保证单例）。
     * 状态永远从宿主接受的 ConfigForm 快照派生；用户点选只做一次乐观更新，
     * 宿主拒绝或传输失败时立刻回退到宿主现值。
     */
    function createStore(form) {
      const listeners = new Set()
      const read = () => {
        const snapshot = form.getSnapshot()
        return { mode: toMode(snapshot.value), writable: snapshot.writable }
      }
      let state = read()
      const publish = (next) => {
        if (next.mode === state.mode && next.writable === state.writable) return
        state = next
        for (const listener of [...listeners]) listener()
      }
      const unsubscribe = form.subscribe(() => { publish(read()) })

      return {
        get: () => state,
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        select(mode) {
          if (!MODES.includes(mode) || mode === state.mode) return
          publish({ ...state, mode })
          const settle = (accepted) => {
            // 宿主拒绝时 ConfigForm 已自行回读；把控件拉回它读到的值。
            if (!accepted) publish(read())
          }
          Promise.resolve(form.set(SETTINGS_FIELD, mode)).then(settle, () => { settle(false) })
        },
        dispose() { unsubscribe() },
      }
    }

    /** 一个描边 SVG 图标（fill 空、currentColor 描边），尺寸与 viewBox 由调用处给。 */
    function strokeIcon(viewBox, size, paths, className = 'tvd-icon') {
      return h('svg', {
        viewBox, width: size, height: size, 'aria-hidden': true, className,
      }, paths.map(path => h('path', {
        key: path, d: path, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      })))
    }

    /** dock 按钮的前置图标：三行长度递减的工作步骤（与插件图标同构）。 */
    function stepsIcon() {
      return strokeIcon('0 0 18 18', 14, ['M3 4.5h9', 'M3 9h6.5', 'M3 13.5h4'])
    }

    /** 菜单项选中标记：12px 描边勾。 */
    function checkIcon() {
      return strokeIcon('0 0 12 12', 12, ['M2.5 6.5 5 9l4.5-5'])
    }

    /**
     * dock 里的控件：一个按钮显示当前档位，点开是四档菜单。
     * props 由本插件 activation 提供：store（共享偏好）与 t（翻译）。
     */
    function Switcher(props) {
      const { store, t } = props
      const state = React.useSyncExternalStore(store.subscribe, store.get, store.get)
      const [open, setOpen] = React.useState(false)
      const wrapRef = React.useRef(null)
      const buttonRef = React.useRef(null)

      const close = (restoreFocus) => {
        setOpen(false)
        if (restoreFocus && buttonRef.current !== null) buttonRef.current.focus({ preventScroll: true })
      }

      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          if (wrapRef.current !== null && !wrapRef.current.contains(event.target)) setOpen(false)
        }
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          close(true)
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [open])

      const current = t(state.mode)
      const choose = (mode) => {
        close(true)
        store.select(mode)
      }

      return h(React.Fragment, null,
        h('style', null, CHROME_CSS),
        h('div', { className: 'tvd', ref: wrapRef },
          h('button', {
            ref: buttonRef,
            type: 'button',
            className: 'tvd-btn',
            'data-open': open ? 'true' : 'false',
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            'aria-label': t('buttonAria', { mode: current }),
            title: state.writable ? t('title') + ' · ' + t('description') : t('readonly'),
            disabled: !state.writable,
            onClick: () => { setOpen(value => !value) },
          },
            stepsIcon(),
            h('span', { className: 'tvd-value' }, current),
            strokeIcon('0 0 12 12', 10, ['M2.5 4.5 6 8l3.5-3.5'], 'tvd-chevron'),
          ),
          open ? h('div', { className: 'tvd-menu', role: 'menu', 'aria-label': t('title') },
            h('div', { className: 'tvd-menu-head' },
              h('div', { className: 'tvd-menu-title' }, t('title')),
              h('div', { className: 'tvd-menu-desc' }, t('description')),
            ),
            MODES.map(mode => h('button', {
              key: mode,
              type: 'button',
              role: 'menuitemradio',
              'aria-checked': mode === state.mode,
              className: 'tvd-item',
              onClick: () => { choose(mode) },
            },
              h('span', null, t(mode)),
              mode === state.mode
                ? h('span', { className: 'tvd-check' }, checkIcon())
                : null,
            )),
          ) : null,
        ),
      )
    }

    return {
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)

        ctx.effect(() => {
          const disposeZh = ctx.locale.register(NS, 'zh', DICTS.zh)
          const disposeEn = ctx.locale.register(NS, 'en', DICTS.en)
          return () => { disposeZh(); disposeEn() }
        }, 'transcript-view-dock: dictionaries')

        // 只有 Host 真的服务 ui-chat 设置段时才挂控件：没有那一段就没有可写的地方，
        // 与其挂一个点了没反应的按钮，不如根本不出现。
        ctx.effect(() => ctx.configForms.whileServed([SETTINGS_NS], () => {
          const form = ctx.configForms.get(SETTINGS_NS)
          const store = createStore(form)

          /** 注册进槽位的组件：store 与翻译由本次 activation 持有。 */
          function Dock() {
            return h(Switcher, { store, t })
          }

          const disposeSlot = ctx.slots.inject(DOCK_SLOT, () => ctx.slots.register({
            name: DOCK_SLOT,
            id: DOCK_ID,
            order: DOCK_ORDER,
            locale: NS,
          }, Dock))

          return () => {
            disposeSlot()
            store.dispose()
          }
        }), 'transcript-view-dock: composer dock entry')
      },
    }
  },
})
