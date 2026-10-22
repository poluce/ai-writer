/**
 * 生成 `public/` 目录下静态资源的可解析地址。
 *
 * 打包后的渲染进程通过 `file://` 加载 `dist/index.html`（`base: './'`）。此时以
 * `/logo.svg` 这类绝对路径书写的资源会被解析到文件系统根目录而加载失败，因此
 * 必须带上 Vite 的 `BASE_URL` 前缀：开发态为 `/`，构建产物为 `./`。
 */
export function publicAssetUrl(assetPath: string, base: string = import.meta.env.BASE_URL): string {
  const normalized = assetPath.replace(/^\/+/, '')
  const prefix = base === '' ? './' : base
  return `${prefix.endsWith('/') ? prefix : `${prefix}/`}${normalized}`
}
