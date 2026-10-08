// EdgeOne Node 云函数入口（仅作构建发现用，实际逻辑在 dist-server/edgeone-entry.js）
// 此文件入库，让 EdgeOne 构建前能发现 /api/* 云函数
export function onRequest(context) {
  return import("../../dist-server/edgeone-entry.js").then((m) => m.onRequest(context))
}

export default onRequest
