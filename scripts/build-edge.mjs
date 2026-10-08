import esbuild from "esbuild"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const NODE_BUILTINS = [
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
]

const emptyNodeDriverPlugin = {
  name: "empty-node-driver",
  setup(build) {
    build.onResolve({ filter: /drivers[\\/](sftp|ftp)([\\/].*)?$/ }, (args) => {
      return { path: args.path, namespace: "empty-node-driver" }
    })
    build.onResolve({ filter: /^(ssh2|cpu-features|iconv-lite)(\/.*)?$/ }, (args) => {
      return { path: args.path, namespace: "empty-node-driver" }
    })
    build.onResolve({ filter: /^mysql2(\/.*)?$/ }, (args) => {
      return { path: args.path, namespace: "empty-node-driver" }
    })
    build.onLoad(
      { filter: /.*/, namespace: "empty-node-driver" },
      () => {
        return {
          contents: `
// Edge/Serverless 构建专用空壳桩模块 — Node 专属驱动（sftp/ftp/ssh2/mysql2）在边缘/Serverless 运行时中不可用。
export const SFTPDriver = class { constructor() { throw new Error("[Edge/Serverless] SFTP driver requires full Node.js runtime"); } };
export const normalizeSFTPAddition = (v) => v;
export const FTPDriver = class { constructor() { throw new Error("[Edge/Serverless] FTP driver requires full Node.js runtime"); } };
export const SFTPClient = class { constructor() { throw new Error("[Edge/Serverless] SFTP client requires full Node.js runtime"); } };
export const parseAddress = () => ({ host: "127.0.0.1", port: 22 });
export const Client = class { constructor() { throw new Error("[Edge/Serverless] ssh2 is not available in edge/serverless runtime"); } };
export const createPool = () => { throw new Error("[Edge/Serverless] mysql2 is not available in edge/serverless runtime"); };
export default {};
`,
          loader: "js",
        }
      },
    )
  },
}

const normalizeHtmlEolPlugin = {
  name: "normalize-html-eol",
  setup(build) {
    build.onLoad({ filter: /\.html$/ }, async (args) => {
      const contents = await fs.promises.readFile(args.path, "utf8")
      return { contents: contents.replace(/\r\n?/g, "\n"), loader: "text" }
    })
  },
}

const nodeShimPlugin = {
  name: "node-shim",
  setup(build) {
    const nodeModules = ["crypto", "buffer", "util", "stream", "zlib", "module", "fs", "path"]
    const shimPath = path.resolve(__dirname, "node-shim.mjs")
    const bareFilter = new RegExp(`^(${nodeModules.join("|")})$`)
    build.onResolve({ filter: bareFilter }, (args) => {
      return { path: shimPath, external: false }
    })
    const nodeFilter = new RegExp(`^node:(${nodeModules.join("|")})$`)
    build.onResolve({ filter: nodeFilter }, (args) => {
      return { path: shimPath, external: false }
    })
  },
}

async function build() {
  await esbuild.build({
    entryPoints: ["api/[...route].ts"],
    bundle: true,
    platform: "neutral",
    outfile: "dist-server/api/[...route].js",
    minify: true,
    format: "esm",
    mainFields: ["module", "main"],
    external: [
      "ssh2",
      "cpu-features",
      "iconv-lite",
      "mysql2",
      "node:*",
      ...NODE_BUILTINS,
    ],
    loader: { ".node": "empty" },
    plugins: [emptyNodeDriverPlugin],
  })

  // EdgeOne Makers Node 云函数实际 bundle 产物
  // 入口文件 cloud-functions/api/[[default]].js 已入库，构建时生成实际逻辑到此处
  await esbuild.build({
    entryPoints: ["api/_makers.ts"],
    bundle: true,
    platform: "node",
    target: "node22",
    outfile: "dist-server/edgeone-entry.js",
    minify: true,
    format: "esm",
    external: ["ssh2", "cpu-features", "iconv-lite", "mysql2"],
    loader: { ".html": "text", ".node": "empty" },
    plugins: [emptyNodeDriverPlugin, normalizeHtmlEolPlugin],
  })

  if (fs.existsSync("esa-entry.ts")) {
    await esbuild.build({
      entryPoints: ["esa-entry.ts"],
      bundle: true,
      platform: "browser",
      outfile: "dist/esa-entry.js",
      minify: true,
      format: "esm",
      mainFields: ["browser", "module", "main"],
      conditions: ["browser"],
      external: [
        "ssh2",
        "cpu-features",
        "iconv-lite",
        "mysql2",
      ],
      loader: { ".html": "text", ".node": "empty" },
      plugins: [emptyNodeDriverPlugin, normalizeHtmlEolPlugin, nodeShimPlugin],
    })
  }

  console.log(
    "✓ Edge build complete -> dist-server/api/[...route].js & dist-server/edgeone-entry.js",
  )
}

build().catch((err) => {
  console.error(err)
  process.exit(1)
})
