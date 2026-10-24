/**
 * transcript-view-dock bundle 的 Host 半边。
 *
 * 功能全在 Client 半边（`./client.js`，由 package.json 的 `dsh.client` 声明）：它把
 * 输入框下方 dock 的最左侧登记成一个「工作步骤展示」切换器，读写的是 ui-chat 已有的
 * Host 设置段 `ui-chat.transcriptView`，因此不需要任何 Host Service。
 *
 * 这一行只为让 bundle 有一个已挂载的 Loader 条目、从而让 Web 外壳加载它的 Client
 * 半边；它不注册任何 Service、Event 或 Tool。
 */
export function apply() {}
