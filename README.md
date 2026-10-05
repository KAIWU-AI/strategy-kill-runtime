# Strategy Kill Runtime

固定版本的 Strategy Kill 浏览器引擎、适配器、许可证及完整对应源码。包名 `@kaiwu-ai/strategy-kill-runtime`，Node.js ≥20，ESM，零依赖，无安装脚本、无联网、无运行时解包。

```js
import { runtimeManifest, readRuntimeAsset } from '@kaiwu-ai/strategy-kill-runtime';

const entry = runtimeManifest.entry; // sandbox.html
const bytes = readRuntimeAsset(entry); // 同步返回新的 Buffer
for (const file of runtimeManifest.files) {
  // file: { path, byteLength, sha256 }
  // 构建工具可按原 path 发射 readRuntimeAsset(file.path)
}
```

`runtimeManifest` 深冻结，内容与原 manifest 一致。`readRuntimeAsset(path)` 只接受 manifest 中原样路径；不规范化、不解码 URL，不接受未列出的资源。每次读取验证常规文件、字节数和 SHA-256，拒绝资源/数据目录符号链接；错误直接抛出，不返回部分内容。消费者继续负责 HTTP 白名单、URL 校验、CSP、iframe 沙箱和响应类型，不能把整个 npm 包设为静态目录。

资源按 SHA-256 保存为 `data/blobs/*` 原始字节，避免 npm 删除嵌套 `node_modules/.pnpm` 的问题。manifest 中原路径不变。无需 `prepareRuntime`，不创建缓存或临时目录。包安装位置及代码属于可信边界；路径检查不构成对恶意本地进程并发替换目录的操作系统级沙箱。摘要验证只会返回固定的获批字节。

## 维护

```sh
npm run build
npm test
npm run test:pack -- /absolute/path/to/artifacts
```

`vendor/strategy-kill/` 原样保留迁移时全部维护材料，包括 842 项运行时资源和 431 份可读 `src/` 文件。构建严格校验固定 manifest、资源哈希及完整文件集合；已有输出仅验证，不覆盖损坏输出。更新版本需评审引擎字节、源码与许可证，并显式更新 `lib/manifest.js` 固定摘要。清理旧构建目录后才能生成经批准的新版本。

npm 发布体仅包含读取 API、运行时字节、对应源码、适配器、构建说明及许可；不包含测试、报告或本机路径。`source.tar.gz` 通过 `readRuntimeAsset('source.tar.gz')` 获取；原始上游归档及适配器也保留于包内。原 `assemble.py` / `BUILD.txt` 是保留的产品组装来源说明，不是本包构建命令。

## 来源与许可

- 包仓库：<https://github.com/KAIWU-AI/strategy-kill-runtime>
- 迁移基线：AgentV `790ab55630628545bc655c7acd9de7e8ff424376`。
- 上游：`libnoname/noname`，`2367607e246d21aae168dba15c01151ee0651f30`（v1.11.6）。
- 包许可：`GPL-3.0-only`；保留所有第三方通知及完整对应源码。
- 上游 README 另含非商业措辞；保留原文，发布负责人须评估其影响。本地打包验证不代表法律审查通过。
- 不包含原作图片、字体、语音或音效。本包不宣称上游重新构建可字节复现。
