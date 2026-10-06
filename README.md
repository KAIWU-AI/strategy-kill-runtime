# Strategy Kill Runtime

固定版本的 Strategy Kill 浏览器引擎、适配器、许可证及完整对应源码。包名 `@kaiwu-ai/strategy-kill-runtime`，ESM，零依赖，无安装脚本、无运行时解包。0.2.0 增加独立浏览器控制器；Node 资源入口仍要求 Node.js ≥20。浏览器入口不导入 Node、React、账号或产品 UI，不改变 `strategy-kill/v1` 消息。

## Node 资源入口

```js
import { runtimeManifest, readRuntimeAsset } from '@kaiwu-ai/strategy-kill-runtime';

const entry = runtimeManifest.entry; // sandbox.html
const bytes = readRuntimeAsset(entry); // 同步返回新的 Buffer
for (const file of runtimeManifest.files) {
  // file: { path, byteLength, sha256 }
  // 构建工具可按原 path 发射 readRuntimeAsset(file.path)
}
```

`runtimeManifest` 深冻结，内容与原 manifest 一致。`readRuntimeAsset(path)` 只接受 manifest 中原样路径；不规范化、不解码 URL，不接受未列出的资源。每次读取验证常规文件、字节数和 SHA-256，拒绝资源/数据目录符号链接；错误直接抛出，不返回部分内容。消费者继续负责 HTTP 白名单、CSP 和响应类型，不能把整个包设为静态目录。浏览器控制器校验入口 URL 并设置 iframe 沙箱。

资源按 SHA-256 保存为 `data/blobs/*` 原始字节，避免 npm 删除嵌套 `node_modules/.pnpm` 的问题。manifest 中原路径不变。无需 `prepareRuntime`，不创建缓存或临时目录。包安装位置及代码属于可信边界；路径检查不构成对恶意本地进程并发替换目录的操作系统级沙箱。摘要验证只会返回固定的获批字节。

## 浏览器入口

```ts
import {
  StrategyRuntimeController,
  type StrategyRuntimeConfig,
  type StrategyRuntimeEvent,
} from '@kaiwu-ai/strategy-kill-runtime/browser';

// 宿主拥有 iframe 的 DOM、title、样式、ref、导航、主题与外部帮助。
// loadApprovedConfig 是宿主的资源函数；不向 SDK 传递账号或凭据。
declare function loadApprovedConfig(signal: AbortSignal): Promise<StrategyRuntimeConfig>;
const frame = document.querySelector<HTMLIFrameElement>('#match')!;
const controller = new StrategyRuntimeController({
  frame,
  runtimeUrl: new URL('/strategy-runtime/sandbox.html', location.href),
  provideConfig: loadApprovedConfig,
  paused: false,
  onStatusChange(status) { document.querySelector('#status')!.textContent = status; },
  onEvent(event: StrategyRuntimeEvent) {
    if (event.type === 'finished') console.info('Match result:', event.result);
  },
  onFailure(reason) { document.querySelector('#status')!.textContent = reason; },
});
controller.start();
controller.setPaused(true); // 不活跃或打开宿主阻塞帮助
controller.setPaused(false); // 只有文档可见时才请求继续
// 卸载/退出/重开时 controller.dispose()；重开必须创建新 controller。
```

`StrategyRuntimeOptions` 的必填字段为 `frame: HTMLIFrameElement`、`runtimeUrl: string | URL`、`provideConfig: (signal: AbortSignal) => StrategyRuntimeConfig | Promise<StrategyRuntimeConfig>`。可选字段为 `paused: boolean`、`onEvent`、`onStatusChange`、`onFailure`，具体签名见 `browser.d.ts`。入口必须是同源 HTTP(S)、路径以 `/sandbox.html` 结尾，无查询、片段或 URL 凭据。控制器以 32 位随机小写十六进制 session 和 parentOrigin 写入片段，设置 `sandbox="allow-scripts"`、`referrerpolicy="no-referrer"` 并移除覆盖导航的 srcdoc。

`StrategyRuntimeConfig` 包含 `setup: StrategySetup`，可选 `portraits: Readonly<Record<string, string>>`、`cardBack: string`。`StrategySetup` 为 `{ selectedCharacter: string, playerCount: 3 | 4 | 5 | 6, characters: readonly StrategyCharacter[], translations: Readonly<Record<string, string>> }`；`StrategyCharacter` 为 `{ heroId, id, name, group, sex: 'male' | 'female', hp: number, skills: readonly string[] }`。人物与翻译必须匹配 `approved-setup.json`，仅人物选择与人数可以变化。控制器验证结构、31 人唯一人物池、选中人物和位图 data URL；原生适配器独立验证完整批准内容。portraits 的键必须是 heroId，图片仅接受 png/jpeg/webp base64 data URL，每项至多 3,000,000 字符；不接受远程地址或 SVG。SDK 不内置宿主人物知识、肖像、账户或另一套规则。

| API / 回调 | 合同 |
| --- | --- |
| `start(): void` | 首次获取 iframe 独占权、安装监听并导航；同实例重复调用无效，不会重开终态。45 秒期限从调用开始，到收到匹配配置人物/人数且 rosterCount=31 的 running 才解除。 |
| `setPaused(paused: boolean): void` | 配置后请求 host paused OR document.hidden 的暂停状态；配置前记住最新值。已结束、失败或销毁不再发消息。原生适配器仍独立检查可见性、finished、内部帮助和帮助打开前的原生暂停，宿主继续请求不能绕过这些保护。 |
| `dispose(): void` | 幂等。先提交 disposed，移除监听/计时器并 abort；只释放、导航自己的 iframe 到 about:blank。先 dispose 再用同一 iframe 创建新实例，支持 React StrictMode setup/cleanup。 |
| `status` / `onStatusChange(status)` | 只读状态 / 同步回调：`idle \| loading \| running \| paused \| finished \| failed \| disposed`。idle 是初始值，无初始回调；仅状态改变时通知。ready 以及运行前 paused/resumed 仍为 loading，不表示已经开局。 |
| `onEvent(event)` | 只收到经过 source、opaque origin=`null`、当前 session 和精确字段校验的六种 v1 消息：ready、paused、resumed、running、finished、failed。每项都有 channel/session/type；running 另有 selectedCharacter、players、rosterCount:31；finished 另有 result:`win \| loss \| draw`；failed 另有 code:`INVALID_CONFIG \| BOOT_FAILED \| RUNTIME_FAILED`。ready/running 各交付一次；未配置的 paused/resumed/finished 忽略。 |
| `onFailure(reason)` | 接收下表固定原因，不包含异常文本、工具内容或配置。原生 failed 还交付对应 onEvent；本地失败不伪造桥消息。 |

配置提供器仅在首次 ready 后调用一次；它应将 signal 传给 fetch/资源转换并及时停止工作。终态、超时和销毁会 abort。即使提供器不配合，迟到结果也不会发送；控制器复制已验证配置，避免之后的对象修改改变 running 确认条件。ready 不是 running，paused/resumed 不延长启动期限。finished/failed 停止监听、期限和配置工作，不接受后续消息；只有回调交付异常可以把 finished 转为 failed。

所有状态在回调前提交。回调可同步调用 setPaused/dispose，旧实例不会继续配置、导航或更新新实例。终态仍持有 iframe，直到 dispose 才允许替换。回调只在宿主调用，不通过 postMessage 发送函数、脚本、引擎对象、隐藏身份、对手手牌或牌局快照。宿主不得访问原生私有 DOM 或导入内部引擎来实现产品功能。

| 固定失败原因 | 含义 |
| --- | --- |
| `INVALID_CONFIG` | 控制器拒绝配置结构/克隆，或原生拒绝批准配置。 |
| `BOOT_FAILED` / `RUNTIME_FAILED` | 原生启动 / 运行失败。 |
| `CONFIG_FAILED` | 配置提供器抛出或拒绝。 |
| `CONFIG_MISMATCH` | running 人物或人数与已发送配置不一致。 |
| `START_TIMEOUT` | 45 秒内未确认 running，包括配置悬挂及启动前暂停。 |
| `START_FAILED` | 随机会话或 iframe 初始导航失败。 |
| `MESSAGE_FAILED` | iframe 无 contentWindow 或 postMessage 失败。 |
| `CALLBACK_FAILED` | SDK 回调抛出；先进入 failed，最多调用一次 onFailure，不重放或重启。 |

若 onFailure 自身抛出，控制器不递归通知，向调用栈抛出新的 `Error('CALLBACK_FAILED')`；异步路径表现为同样固定内容的拒绝/浏览器错误。若回调已销毁控制器再抛出，或 disposed 状态回调抛出，也仅抛出此固定错误，不复活实例。SDK 不记录原始异常。构造参数错误抛 `TypeError('INVALID_OPTIONS')`；非 boolean 的 setPaused 抛 `TypeError('INVALID_PAUSED')`；竞争实例的 start 抛 `Error('FRAME_IN_USE')`；销毁后的 start 抛 `Error('CONTROLLER_DISPOSED')`。这些是调用错误，不通过 onFailure 报告。

## 维护

```sh
npm run build
npm test
npm run test:pack -- /absolute/path/to/artifacts
# STRATEGY_BROWSER_TOOLS 指向已有 playwright-core/typescript 工作区的 package.json
npm run test:browser -- /absolute/path/to/browser-evidence
npm run test:native -- /absolute/path/to/native-evidence
```

浏览器验证使用已安装工具和 Windows Edge，不安装依赖；检查独立真实 import、严格 DOM-only 类型、正/负消息、可控期限及生命周期。原生验证通过公开控制器驱动实际引擎，覆盖人数、装备、技能说明、暂停/焦点、响应/弃牌、自然结束与重开。Node 单元测试使用可控计时器覆盖 45 秒边界，不等待真实超时。

### 0.2.0 牌桌适配

上游引擎与 approved-setup 映射不变；不增加消息类型、联网、依赖或安装脚本。适配器为系统/时间、对手、行动提示/公开卡、记录、原生操作、自己的装备及手牌分别留出区域。宿主保留既有 board-scroller，原生画布最低 900 × 720 CSS px，不缩小卡牌来挤进窄屏。

只有无技能选择的 chooseToUse/chooseToRespond/chooseToDiscard 纯文本提示使用新区域。选将、技能、卡牌选择和结算仍由原生引擎拥有。记录展示原生已公开的日志，保留最近 200 条并允许滚动；不从事件、隐藏身份或手牌采集信息。

自己的装备区常驻，空状态与标签在 `node.equips` 之外。装备卡、虚拟装备、废除/可选空槽、选择状态和卡牌归属由引擎拥有。对手装备保留原生紧凑结构，修复前景对比度。技能说明是与目标选择分开的键盘按钮；说明使用完整名称和当前公开技能，Escape/关闭后返回焦点。关闭时保留宿主暂停、后台可见性和已有原生暂停，不开放隐藏菜单。

修改 `vendor/strategy-kill/adapter-source/` 后：

1. 运行 `python vendor/strategy-kill/assemble.py`。它只刷新四个适配器、对应源码和清单，继续拒绝改变的上游字节。
2. 核对改变的清单成员，显式更新 `lib/manifest.js` 的 byteLength/SHA-256。
3. 在新 checkout 运行 build/test/pack；已有 `data/` 仅验证，不覆盖已损坏输出或手改生成文件。
4. `STRATEGY_BROWSER_TOOLS` 指向已安装 `playwright-core` 的工作区 `package.json` 后，运行 `npm run test:native`。Windows 使用现有 Edge；不安装依赖。可传输出目录参数。

### 发布渠道

正式发布使用 <https://github.com/KAIWU-AI/strategy-kill-runtime/releases> 的固定 tgz asset，而不是 npm registry。首次发布基线为 v0.1.0；当前版本的发布状态以 Release 页面为准。发布负责人评审并提交对应源码后，创建匹配版本标签的 Release，上传 `kaiwu-ai-strategy-kill-runtime-0.2.0.tgz`，匿名下载核对 SHA-256 后消费者才固定正式 URL：

```text
https://github.com/KAIWU-AI/strategy-kill-runtime/releases/download/v0.2.0/kaiwu-ai-strategy-kill-runtime-0.2.0.tgz
```

仅列出上述 URL 不构成发布证明；发布门禁仍需回读 Release 和匿名下载。不得覆盖已发布的旧 tgz；回退固定旧版本 URL。`npm pack` 生成发布体，不执行 `npm publish`，本地验证不代表已经发布或获法律认证。

`vendor/strategy-kill/` 原样保留迁移时全部维护材料，包括 842 项运行时资源和 431 份可读 `src/` 文件。构建严格校验固定 manifest、资源哈希及完整文件集合；已有输出仅验证，不覆盖损坏输出。更新版本需评审引擎字节、源码与许可证，并显式更新 `lib/manifest.js` 固定摘要。清理旧构建目录后才能生成经批准的新版本。

tgz 发布体仅包含 Node/浏览器 API 及类型、运行时字节、对应源码、适配器、构建说明及许可；不包含测试、报告、会话笔记或本机路径。`source.tar.gz` 通过 `readRuntimeAsset('source.tar.gz')` 获取；原始上游归档及适配器也保留于包内。原 `assemble.py` / `BUILD.txt` 是保留的产品组装来源说明，不是本包构建命令。

## 来源与许可

- 包仓库：<https://github.com/KAIWU-AI/strategy-kill-runtime>
- 迁移基线：AgentV `790ab55630628545bc655c7acd9de7e8ff424376`。
- 上游：`libnoname/noname`，`2367607e246d21aae168dba15c01151ee0651f30`（v1.11.6）。
- 包许可：`GPL-3.0-only`；保留所有第三方通知及完整对应源码。
- 上游 README 另含非商业措辞；保留原文，发布负责人须评估其影响。本地打包验证不代表法律审查通过。
- 不包含原作图片、字体、语音或音效。本包不宣称上游重新构建可字节复现。
