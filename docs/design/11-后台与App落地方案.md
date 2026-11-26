# 11 后台与 App 落地方案（2026-11-25）

> 相关：[08 服务器](08-服务器.md) · [10 技术架构](10-技术架构.md) · [03 健康数据](03-健康数据.md) · [06 MVP 与付费](06-MVP与付费.md) · [07 打磨规范](07-打磨规范.md) · [决策记录](../DECISIONS.md)
>
> 本文回答两件事：后台现在到哪了、差什么；手表和手机 App 怎么写、分几步。**需要你拍板的地方都标了 🟡**，汇总在文末。

## 一、后台现状

**结论：Pulseling 还没有后台。** 所有分支（master、site-v1、pet-art-and-random-events）都没有 `apps/server`，也没有管理页面；服务器只存在于 [08](08-服务器.md)、[10](10-技术架构.md) 的设计里。Cloudflare 上的 `xgj-16688` / `xgj.7years.top` 是另一个无关项目，不算在内。

现在线上只有：

| 东西 | 地址 | 状态 |
|---|---|---|
| 落地页 `apps/site` | https://www.pulseling.workers.dev（Worker `www`，纯静态） | 上线；候补名单表单是假的，`site.ts` 里 `WAITLIST_ENDPOINT = null` |
| 网页原型 `apps/web` | pulseling-prototype.pages.dev | 上线；状态存在浏览器里 |
| 规则 `packages/engine`、`packages/game` | — | 写好并有测试，服务器可以直接用（`createGame`、`liveDay`、`fightBoss`、`fightFriend`、`snapshotOf`、`migrate`） |

### 离"可用"还差什么

按要用到的先后顺序排：

| 步 | 内容 | 工作量 | 要 Mac 吗 |
|---|---|---|---|
| ~~S0~~ | ~~候补名单~~（2026-11-25 决定不做） | — | — |
| S1 | 游戏接口：匿名账号、孵化、按天结算、当前状态、Boss、设置（见第三节）；远程配置；OpenAPI 描述 | 1–2 周 | 否 |
| S1 | 让网页原型能切换到"连服务器"模式，在没有 App 之前把接口跑通 | 2–3 天 | 否 |
| S1 | AI 台词：结算时调 new-api 生成，跟早晨卡片一起返回 | 3–5 天 | 否 |
| S2 | 两个验证：Worker 直连 APNs 沙盒推送、Apple 登录验签 | 各半天 | 推送要真机才能收 |
| S3 | 订阅校验 + App Store Server Notifications 回调 | 2–3 天 | 要 App Store Connect |

**🟡 决定 1：后台要做到什么程度。** 建议 MVP 只做一个 Access 保护的 `/admin`：看候补名单、按用户 ID 查存档、删除用户数据（隐私政策承诺要能删）、发一条测试推送、查看和发布远程配置的版本。不做完整的 CMS。远程配置先用仓库里的 JSON 文件，通过 `wrangler` 发布，记下版本号。

**🟡 决定 2：服务器部署在哪。** 建议单独建一个 Worker（如 `pulseling-api`），把落地页那个 Worker（`www`）的 `/api/*` 路由转过去，这样落地页和 API 同域、不用处理跨域。正式域名没定之前先用 workers.dev；**提交审核前要有正式域名**：隐私政策链接、Universal Links、Apple 登录的回调都依赖它（见 [10 还没定](10-技术架构.md) 第 2 条）。

## S1 进度（2026-11-26）

**已完成（本地能跑，没部署）：**

- `apps/server`：Hono + D1，接口见下面第三节那张表，`GET /openapi.json` 自动导出接口文档（以后 Swift 用它生成客户端）。
  - 匿名账号：随机 token，库里只存哈希。
  - 孵化、按天结算（幂等：同一天重传得到同一个结果；中间漏掉的天按"没戴"补上，补过的天不能再传）、Boss、对话、来信、目标形态、进化（服务器检查条件，客户端不能直接要）、技能、数据透明页、删除账号。
  - 并发：乐观锁，两个请求同时结算时只有一个生效，另一个自动重试。
  - 防刷：创建账号按 IP 限流，每分钟 5 个（Cloudflare Rate Limiting 绑定，超出返回 429）。
  - 测试：9 个，包括"通过接口过 30 天，结果和直接跑 `packages/game` 完全一样"。
- **远程配置**：`configs` 表存所有版本（旧版本永远保留，方便重放），同一时间只有一个生效；规则通过 `withConfig` 读配置，每天结算记下用的版本（`days.config_version`、存档里的 `configLog`）。配置坏了自动退回内置数值。活动日历已接进早上的遇怪：可以调遇怪概率、让某系野怪变多，早晨卡片会写原因。`GET /v1/config` 给 App 显示活动横幅。发布：`pnpm --filter @pulseling/server publish-config config/xxx.json [--remote]`。已经放了一个测试活动"初雪周"（11-20 到 12-10）走通整条链路。
- **功能开关和 A/B 分组**：配置里的 `flags`，每个玩家按"账号 + 开关名"的哈希稳定地分到一组，可设比例。第一个实验已接上：第一次会员邀请在第 3 天还是第 6 天（`firstInviteDay`，06 的待测项）。`GET /v1/config` 带 token 时返回这个玩家的分组，以后做统计用。
- **原型的服务器模式**：`pnpm server` + 打开 `/?server=http://127.0.0.1:8787`，宠物存在服务器上，原型每一步都走真实接口（见 [PROTOTYPE](../PROTOTYPE.md)）。
- **游戏文字多语言（决定 6，按 B 做）**：存档里不再存成句的中文，改存"文案 key + 参数"（例如 `{k: "feed.capture", p: {name: {k: "species.murk"}}}`）。服务器按 `?lang=` 或 `Accept-Language` 把同一份存档说成中文或英文，回 `Content-Language`。
  - 文案表：`packages/game/src/copy/zh.ts`（原文）和 `en.ts`（英文，约 420 条，五种性格各有语气）。缺的 key 退回中文，测试保证两种语言 key 一致、没有用到代码不传的参数。
  - 支持数字按语言加千分位、英文单复数（`{n|once|# times}`）、列表（"、" / ", "）、参数为空时去掉多余空格。好友名字原样不翻。
  - 远程配置新增 `copy`（语言 → key → 模板），改一句文案不用发版；活动文字可以写成 `{zh, en}`。
  - `PetView` 现在全是成句文字：早晨卡片、心愿、动态、来信、今天的聊天、快捷回复、记忆、收藏册（物品改用 id）、图鉴名字。
  - 旧存档自动迁移：旧句子当原文保留，收藏册里的中文物品名换成 id。
  - 原型仍显示中文（同一套 key 渲染）。测试：新增 i18n 7 个、接口语言 2 个；跑 120 天模拟，英文输出里没有一个汉字。
- **修了一个规则问题**：`packages/game` 和原型还停在"第 3 天硬付费墙 + 不付费就冬眠"，跟决策第 68 条（免费增值、取消冬眠）矛盾，服务器一上线就会让免费用户的宠物停止成长。已改成：免费照常长大；第 3 天、第一封周信、第一次进化时在"今天"页放一张能收起的会员邀请卡（每 3 天最多一次）；旧存档自动迁移，冬眠过的天数在开试用时还成礼物。

**S1 还没做：**

1. 另外 6 种语言（落地页已有 8 种）：先机器翻译 `en.ts` 再人工校对，加一个文件就行。
2. AI 台词（new-api）：用户 2026-11-26 定了先不做，先用模板台词。免费版周报卡片和会员来信的区分跟它一起再做。
3. 部署：**已上线** https://api.pulseling.workers.dev（2026-11-26，Worker 名 `api`，决定 2 已定）。D1 `pulseling` 在 WNAM 区，0001、0002 迁移已在远程执行。线上跑的是文案 key 改动**之前**的代码，要重新部署一次才有多语言；远程配置还没发布，线上 `/v1/config` 返回 builtin。以后部署都由主会话执行。

## 二、App 架构

### 工程放哪、怎么组织

```
apps/apple/
  project.yml              XcodeGen 描述文件（生成 .xcodeproj，.xcodeproj 不进 git）
  Packages/PulselingKit/   Swift 包，手机和手表共用
    Sources/
      Model/               接口数据结构（由 OpenAPI 生成）+ 本地状态
      API/                 接口客户端、匿名 token、重试、幂等键
      Health/              HealthKit 读取 → DailyHealth / 运动摘要（手机为主）
      Sprites/             序列帧播放器、图片清单和缓存
      Glance/              小组件和手表共用的"瞄一眼"视图模型
      Design/              颜色、字体、动效曲线（对应 07 的 --ease、--t 等）
    Tests/
  iOS/                     手机 App（SwiftUI）
  Watch/                   手表 App（单一 target 的 watchOS App）
  WatchWidgets/            表盘小组件（WidgetKit 扩展）
  Shared/Resources/        String Catalog（.xcstrings）、资产
```

- **Swift 6 + SwiftUI + Observation**，不用第三方 UI 框架。
- **为什么用 XcodeGen**：`.pbxproj` 很难手工合并，在 Windows 上也没法编辑；有了 `project.yml`，你在 Windows 上就能加文件、改配置，在 Mac 或 CI 上生成工程即可。🟡 决定 9。
- **最低系统**：沿用 [10](10-技术架构.md) 的 iOS 17 / watchOS 10（Observation 和表冠竖向翻页都需要这两个版本）。🟡 决定 5：是否提到 iOS 18 / watchOS 11，换更新的小组件相关度接口，代价是少覆盖一些老设备。
- **App Group** `group.<bundle>.shared`：手表 App 和小组件共享最新状态（存一个 JSON 文件）。手机端的小组件以后要加的话也用这个。

### 数据流

```
HealthKit ──(后台唤醒)──▶ iPhone：算出昨天一行 DailyHealth + 运动摘要
                              │ POST /v1/days（带幂等键 = 日期）
                              ▼
                         服务器：liveDay → 存状态 → 生成早晨卡片 + 台词 → APNs 推送
                              │ 返回 PetView + MorningCard
                              ▼
iPhone ──WCSession.updateApplicationContext──▶ 手表 ──写 App Group──▶ 小组件 reloadTimelines
                                                  │
                                    手机不在身边时：手表自己 GET /v1/pet
```

- **规则只在服务器上**（决策 67）。客户端不重算、不预测，只显示服务器返回的视图模型。
- **手表拿 token**：Keychain 在手机和手表之间不同步，首次配对时由手机通过 WatchConnectivity 发过去，手表存进自己的 Keychain。
- **运动后的欢呼**：手表自己读最新的运动记录（`HKWorkout`），比等手机转发快；只用于触发欢呼动画，不上传。

### 白天这层："今天到目前为止"（2026-11-26 定）

只在早上同步一次的话，白天的运动要到第二天早上宠物才"知道"，"它在陪我"的感觉会变弱。完全实时又做不到：iOS 在后台最快大约每小时给一次步数，小组件每天能刷新的次数也有限；而且规则只能一天结算一次（防刷、结果可复现）。所以中间加一层：

| | 做法 | 阶段 |
|---|---|---|
| 数据从哪来 | 打开 App 或手表时，在本机用 `HealthReader` 读今天 0 点到现在的数据（1 秒内）；后台唤醒时顺便更新 App Group 里的 `Glance` | S3 / S4 |
| 心愿进度 | "还差 2,300 步"：目标数字用服务器返回的 `wish.target`，客户端只拿今天的读数去比，不自己算规则 | S3 |
| 运动后欢呼 | 见上一条，手表读 `HKWorkout` | S4 |
| 小组件 | 进度跟着后台唤醒，大约每小时更新一次 | S4 |

- **不变的：** 结算仍然每天一次，在服务器上做；白天这层不改变任何成长数值，也不上传东西，"每天只传一行汇总"这条承诺照旧。
- **为什么不算违反"客户端不重算"：** 客户端只显示"已经走了多少 / 目标多少"，不预测结算结果，不生成台词，也不决定发生什么事件。

### HealthKit 读什么（手机上读，只读不写）

字段和引擎里的 `DailyHealth` 一一对应（`packages/engine/src/types.ts`）：

| DailyHealth 字段 | HealthKit 类型 | 怎么算 |
|---|---|---|
| `steps` | `stepCount` | `HKStatisticsCollectionQuery` 求和（自动合并手机和手表，不自己相加） |
| `standHours` | `appleStandHour` | 当天"站立"的小时数 |
| `activeEnergyKcal` | `activeEnergyBurned` | 求和 |
| `flightsClimbed` | `flightsClimbed` | 求和 |
| `sleepMinutes`、`bedtimeMinutes`、`deepSleepRatio` | `sleepAnalysis` | 只用 asleep 的阶段（Core/Deep/REM/Unspecified）；入睡时间 = 第一段睡眠的开始，相对午夜；深睡比例 = Deep / 总睡眠 |
| `nightHrvMs` | `heartRateVariabilitySDNN` | 睡眠时段内的平均 |
| `restingHr` | `restingHeartRate` | 当天值 |
| `highHrZoneMinutes` | `heartRate` | 超过阈值的分钟数。🟡 决定 10：阈值按年龄算要多申请"出生日期"权限；建议不申请，用"静息心率 + 0.6 ×（190 − 静息心率）" |
| `cardioMinutes`、`strengthMinutes`、`intervalMinutes` | `HKWorkout` | 按运动类型归类：跑步、骑行、游泳等算有氧；`traditional/functionalStrengthTraining` 算力量；`highIntensityIntervalTraining` 算间歇 |
| `highIntensityMinutes` | `appleExerciseTime` | 健身圆环的锻炼分钟数（近似"中高强度"） |
| `distanceKm` | `distanceWalkingRunning` | 求和 |
| `worn` | `heartRate` 的覆盖时长 + `stepCount` | 白天心率覆盖 ≥ 4 小时，或步数 ≥ 1,500（决策 74） |

- 带 `HKMetadataKeyWasUserEntered` 的记录全部过滤掉（防作弊）。
- 第 3 层"运动摘要"：每次运动上传一行（类型、开始时间、时长、距离、平均心率），不传 GPS 路线。
- **后台唤醒**：对睡眠、运动、步数注册 `HKObserverQuery` 和 `enableBackgroundDelivery`（需要 background-delivery 权限）。唤醒延迟要上真机测。
- **把这张对照表做成接口约定**：Swift 端写单元测试，用固定的样本数据算出 DailyHealth，跟 `packages/engine` 的预期结果对照。

### 手表 App

| 部分 | 做法 |
|---|---|
| 三页竖向翻页 | `TabView` + `.tabViewStyle(.verticalPage)`，表冠控制；早晨卡片和演出播放时锁住翻页 |
| 早晨卡片精简版 | 一天第一次打开时播 3 屏，可点击跳过；播过的状态同步给手机，手机上会快速带过 |
| 宠物动画 | 序列帧 + `TimelineView(.animation)`；`isLuminanceReduced`（常亮模式）时显示静止睡姿；减弱动态效果时显示静止姿势 |
| 震动 | `WKInterfaceDevice.play(_:)`，按 [07 §4](07-打磨规范.md) 的对照表，每天 ≤ 3 次 |
| 蓄力 | 对战页：点好友或 Boss → 蓄力条 → 点一下 → `POST` 结果；回放留给手机 |
| 小组件 | WidgetKit 的 `accessoryCircular / Rectangular / Inline / Corner` 四种（内容见 [07](07-打磨规范.md)）；时间线按宠物作息生成睡觉和醒来的条目；用 `TimelineEntryRelevance` 实现智能叠放里的相关度 |
| 通知 | 推送发到手机，手机不在用时系统自动转到手表；可选做一个自定义的长通知界面（宠物 + 一句话） |

### 手机 App

首次打开（选蛋 → 说明页 → 授权 → 读 28 天历史 → 孵化）、今天（早晨卡片完整版、心愿、来信）、宠物（详情、进度、属性图、基因卡、分享图）、图鉴、对战回放、数据透明页（原样列出上传了什么，加"删除全部数据"）、设置（4 个通知开关）、会员（StoreKit 2 的 `SubscriptionStoreView`）。

各页面的交互和动效以网页原型为准，原型就是可以对着做的规格书。

### 和后台的接口（第一版）

用 Hono + `@hono/zod-openapi` 在 TypeScript 里定义接口，自动导出 `openapi.json`；Swift 端用苹果官方的 `swift-openapi-generator` 作为构建插件生成客户端和数据结构。不用手抄字段，也不用 quicktype。

| 接口 | 用途 |
|---|---|
| `POST /v1/accounts` | 生成匿名账号，返回 `userId` 和 token |
| `POST /v1/accounts/apple` | 绑定"通过 Apple 登录" |
| `POST /v1/games` | 选蛋 + 28 天历史 → 孵化结果（`createGame`） |
| `POST /v1/days` | 上传一天的数据（幂等）→ 早晨卡片 + PetView（`liveDay`） |
| `GET /v1/pet` | 当前 PetView，给手表和小组件用 |
| `POST /v1/boss/fight` | 带 `charge` 开打 Boss |
| `PUT /v1/pet/target`、`/evolution`、`/loadout` | 选目标形态、进化、技能和战术 |
| `POST /v1/chat`、`POST /v1/letters/{date}/read` | 对话和来信 |
| `PUT /v1/devices` | APNs token、语言、时区、通知开关 |
| `GET /v1/manifest` | 图片清单 + 远程配置版本 |
| `POST /v1/subscriptions/verify`、`POST /webhooks/appstore` | 订阅 |
| `GET /v1/data`、`DELETE /v1/account` | 数据透明页、删除全部数据 |
| `POST /api/waitlist` | 落地页候补名单 |

第二步再加：好友码、好友列表、快照、切磋、合作 Boss。

**✅ 决定 6：游戏里的文字怎么做多语言（已定 B）。** 原来 `packages/game` 直接拼出中文句子（例如"进化成了成长体！"），而 App 先上海外区、落地页已经有 8 种语言。建议改成服务器返回"文案 key + 参数"，由 App 用 String Catalog 翻译成当地语言；AI 台词按用户的语言生成。这次重构要在 S1 做，越晚越难改。

> **2026-11-26 补充（动手前量了一下）：** `packages/game` 里有约 230 行中文文案（宠物台词、来信、小惊喜、通知、早晨卡片），原型界面另有约 260 行。存档里的动态、来信、聊天记录、记忆存的也都是成句的中文。两种做法：
>
> | | A. App 本地翻译（原建议） | B. 服务器按语言出成句（新建议） |
> |---|---|---|
> | 存档里存什么 | 文案 key + 参数 | 文案 key + 参数（两种都要改） |
> | 谁把 key 变成句子 | 手机和手表的 String Catalog | 服务器，按请求带的语言 |
> | 改文案、加语言 | 要发版 | 不用发版，正好接上远程配置里的 `copy` |
> | 手表、小组件、推送 | 每端都要带一份翻译 | 拿到的就是句子，直接显示 |
> | AI 台词 | 服务器按语言生成 | 同左，和模板走同一条路 |
>
> **用户选了 B（2026-11-26），已实现，见上面"S1 进度"。** 界面上固定的字（按钮、标题）仍用 App 的 String Catalog，只有游戏内容由服务器出句子。工作量：核心加英文大约 2–3 轮循环；其余 6 种语言可以先机器翻译再人工校对。

### AI 和付费

- **🟡 决定 4：AI 走哪条路。** [05](05-AI宠物.md) 写的是优先用苹果 Foundation Models，[10](10-技术架构.md) 写的是服务器生成后跟早晨卡片一起返回，两处有冲突。建议 MVP **只走服务器（new-api）**：只有一条路径，手表不用等手机，记忆也存在服务器上。Foundation Models 以后作为省成本的优化再加。代价是隐私政策要写明"把健康汇总发给第三方 AI"，并在开试用时单独征得同意（[03 合规](03-健康数据.md)）。
- **🟡 决定 3：订阅校验。** 自己用 StoreKit 2 + App Store Server API，在 Worker 里用 `jose` 验签，大约 2–3 天；接 RevenueCat 半天就能接好，收入超过一定额度后按比例收费。建议自己做：只有一个订阅商品，逻辑简单，也少一家拿到用户数据的第三方。

## 三、分阶段落地计划

| 阶段 | 内容 | 产出 / 完成标准 | 要 Mac |
|---|---|---|---|
| **S1** | 游戏接口 + 远程配置 + 文案改成 key + AI 台词；网页原型能切到服务器模式 | 网页原型连服务器过 30 天，结果和本地版一致；OpenAPI 文件导出 | 否 |
| **S2** | 准备 Mac 环境；XcodeGen 骨架；GitHub Actions macOS 自动构建并上传 TestFlight；三个验证（HealthKit 读数、后台唤醒延迟、APNs 沙盒） | 空壳 App 装到你的 iPhone 和手表上；HealthKit 读出来的一行数据和原型格式一致 | 是 |
| **S3** | 手机 MVP：首次打开、今天（含白天的心愿进度）、宠物、图鉴、数据页、设置、通知 | 你自己连续用 7 天，每天早上自动开奖 | 是 |
| **S4** | 手表：三页、早晨卡片精简版、动画、震动、运动后欢呼、四种小组件（含白天进度）、智能叠放、常亮模式、Boss 蓄力 | 真手表上抬腕 2 秒内看到宠物；小组件按作息切换睡觉和醒来 | 是，要真机 |
| **S5** | 会员（StoreKit 2 + 服务器校验）、Apple 登录、隐私政策 / 条款 / 支持页、截图和预览视频 | TestFlight 给 10–20 个朋友，看次日和 7 日留存 | 是 |
| **S6** | 提交审核，上海外区 | — | 是 |
| 之后 | 好友、`/f/` 邀请链接和 Universal Links、`/p/` 分享页、离线兜底（JavaScriptCore 跑 `packages/game`） | — | — |

S1 在 Windows 上就能做（进度见上面"S1 进度"）；S2 开始需要 Mac。

**S2 进度（2026-11-26，不用 Mac 的部分已写完，还没在 Mac 上编译过）：**

- `apps/apple/project.yml`：手机 App、手表 App、手表小组件三个 target，App Group、HealthKit（含后台唤醒）、推送沙盒的权限都已写好。Bundle 前缀和开发团队放在 `Config/Local.xcconfig`（不进 git），CI 从命令行传入。
- `Packages/PulselingKit`：
  - `PulselingAPI`：用 swift-openapi-generator 在编译时根据 `openapi.json` 生成客户端；`openapi.json` 由 `apps/server/test/contract.test.ts` 导出并校验，接口一改测试就会失败（`UPDATE_OPENAPI=1 pnpm test` 更新）。服务器的每个接口都加了 operationId。
  - `Health/`：`HealthReader` 只负责向 HealthKit 取数，`DayRules` 是纯函数，把取到的数据算成一行 DailyHealth。规则按上面"HealthKit 读什么"那张表实现。
  - **约定（新定）：** 一行 DailyHealth 记当天的活动，加上当晚 18:00 到次日中午的睡眠。也就是第二天早上上传时已知的全部数据，下午小睡不算。
  - 对照数据放在 `Tests/.../Fixtures/health-days.json`（4 种情况）：Swift 测试检查算出的结果等于预期；TS 测试检查预期结果能通过服务器校验，引擎也能结算。
  - `PulselingService`：匿名注册、Keychain 存 token、带 Accept-Language、孵化、上传一天、读宠物。`Glance`：手表和小组件通过 App Group 共享的状态。
- 手机端是一个"S2 检查"页，三个验证各有一个按钮：读取昨天并显示 JSON、记录后台唤醒的时间、注册 APNs 拿到 token，另有一个按钮连线上服务器。手表和小组件先只显示第几天和一句话。
- `.github/workflows/apple.yml`：每次改动 `apps/apple` 都会在 GitHub 的 Mac 上跑 Swift 测试，并编译不签名的模拟器版本。另有手动触发的 TestFlight 上传任务，需要开发者账号和 5 个 secret（见文件开头）。
- **还差：** 推到 GitHub 跑第一次 CI，修编译错误；有开发者账号（决定 8）以后传 TestFlight，装到真机上做三个验证。

**🟡 决定 7：Mac 怎么解决。** 云端 Mac 和 GitHub Actions 能编译、能上传 TestFlight，但**调试真手表**（断点、看日志、看 HealthKit 后台唤醒）需要手表和 Mac 在同一个网络里配对使用。建议买一台最便宜的 Mac mini；纯靠云端 Mac 的话，S4 的调试会非常慢。

**🟡 决定 8：Apple 开发者账号用个人还是公司。** App Store 上显示的卖家名称取决于这个选择，落地页和隐私政策里也要写同一个名字。注册和审核要时间，建议在 S1 期间就办。

## 四、App 做完后落地页要跟着改的地方

| App 里的决定 | 落地页要改什么 |
|---|---|
| 美术定稿、真实的手表界面 | 替换现在网页画的宠物和手表画面；补上 15 秒视频（真机录屏） |
| HealthKit 实际读哪些类型、上传哪些字段 | 首屏的承诺（"只读不写""每天只传一行"）和隐私政策逐字段核对；用了第三方 AI 就要写明 |
| 免费 / Plus 的分界、最终价格、试用天数、上线地区 | 价格区、FAQ |
| 支持的系统版本和设备 | "需要 iPhone + Apple Watch，iOS 17 / watchOS 10 以上"之类的说明 |
| App 支持的语言 | 跟落地页的 8 种语言对齐；不支持的语言要说明 |
| App ID、上架链接 | 候补名单表单换成 App Store 按钮，加 `apple-itunes-app` 智能横幅；给候补名单发上线通知 |
| 小组件和表盘样式 | 小组件展示图 |
| 好友系统上线 | 网站要提供 `/.well-known/apple-app-site-association`，以及 `/f/`、`/p/` 两类动态页（由 Worker 处理，不能是纯静态） |
| 卖家名称、正式域名 | 页脚、隐私政策、条款、支持页 |

## 需要你拍板（汇总）

| # | 问题 | 建议 |
|---|---|---|
| 1 | 后台做多少 | 只做 Access 保护的极简 `/admin`；远程配置先放在仓库的 JSON 里 |
| 2 | 服务器部署方式、正式域名 | 单独建 `pulseling-api` Worker，挂在同域的 `/api/*` 下；审核前买好域名 |
| 3 | 订阅校验 | 自己用 StoreKit 2 + App Store Server API |
| 4 | AI 路径 | MVP 只走服务器 new-api，Foundation Models 以后再加 |
| 5 | 最低系统 | iOS 17 / watchOS 10（维持原定） |
| 6 | 游戏文字多语言 | ✅ 已定 B：存档存 key + 参数，服务器按请求语言出成句；界面固定文字用 App 的 String Catalog |
| 7 | Mac | 买 Mac mini，CI 用 GitHub Actions |
| 8 | 开发者账号 | 个人还是公司，S1 期间注册 |
| 9 | Xcode 工程 | XcodeGen 生成，`.xcodeproj` 不进 git |
| 10 | 高心率区间的阈值 | 不申请出生日期权限，按静息心率估算 |
