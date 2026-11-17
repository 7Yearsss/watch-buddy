# 调研：电子宠物 × 健康数据 × 对战 × AI（2026-11）

> 只记录对我们设计有用的结论。数字多来自评测、攻略站和媒体，按"大概"理解。

## 1. 逐个看

### 数码宝贝 Vital Bracelet / Vital Hero（万代）——最接近我们的产品
- 手环记录步数和心率，心率高于静息水平的部分、以及步数都会变成"活力值"（Vital）。
- 活力值决定训练、进化和对战；对战胜负看属性、心情和活力值，赢了加活力值，输了扣活力值还可能受伤需要休息。
- 和朋友对战：两个手环靠近（NFC）或者插"对战卡"。
- 收入扩展靠卖"Dim 卡"（每张卡解锁一批新数码宝贝）。
- 每日挑战（步数、深蹲、挥拳），每项一天只能完成一次，防止过度运动。
- **差评：** 不戴手环每 5 分钟扣 50 活力值，惩罚重；说明书太复杂；早期进化要等很久；计步不准（开车也算步数）；对战本质是按键时机小游戏。
- **对我们的启发：** 玩法已被验证有人买单（万代持续出新款）；我们要反着做它的痛点：不戴表不扣、上手简单、第一次进化要快、数据用苹果的更准。"Dim 卡 = 限定蛋 / 限定野怪包"可以直接借鉴为付费内容。

### Pokémon Sleep——"数据→一个分数→早上开奖"的标杆
- 睡眠分 × 卡比兽强度 = 催眠能量，决定第二天早上有多少只、多稀有的宝可梦来。
- 一天分三段（夜 / 早 / 下午），白天助手宝可梦采树果、做料理提升卡比兽强度。
- **周循环：** 每周一重置，强度一周内不断累积，越到周末越容易遇到稀有宝可梦。
- 满月附近的"好眠日"活动加倍奖励；研究等级限制宝可梦等级上限。
- **对我们的启发：** 周循环是让"每天都有点盼头、周末有大高潮"的成熟做法；把健康数据压成**一个**直观分数给玩家看；活动日加倍。

### Pikmin Bloom（Niantic → Scopely）——轻量走路游戏也能赚钱
- 累计收入超过 1 亿美元，2025 年是收入最高的一年（上线第四年还在涨）。
- 本质是"走路日记"：走路长花、种花、养皮克敏；收入高峰来自限时活动（社区日、周年挑战）；付费主要是"省时间"。
- **对我们的启发：** 轻度循环 + 定期活动能长期活；付费卖"方便"与我们的原则一致。

### Finch——不惩罚、靠感情留人
- 完成自我照顾目标 → 给小鸟能量 → 小鸟去冒险、成长；桌面小组件持续展示宠物状态。
- 有说法次日留存约 60%（营销文章，未核实）。感情是主要留存手段，但也有人认为收集要素起了很大作用。
- **对我们的启发：** 小组件 / 表盘就是我们的"常驻存在感"；感情 + 收集两条腿走路。

### 拓麻歌子 Uni / Tamaverse（万代）
- 第一款带 Wi-Fi 的拓麻歌子，可进入线上"Tamaverse"：和全球玩家的宠物互动、参加全球活动和比赛、下载新区域（如 2026 年 3 月的丛林区）。
- **对我们的启发：** 实体宠物也在往"联网 + 定期下载新内容 + 全球活动"走，我们做 App 天然更容易。

### Habitica、Zombies, Run! 等健身游戏化
- Habitica 自己打勾算完成，没有真实数据校验，这是它最大的短板；漏做每日任务会掉血。
- Zombies, Run! 靠故事留人，但新鲜感会消退。
- 学术研究（CHI 2017）：游戏化健身的参与度会持续下降，**但定期更新内容可以把它拉回来**。
- **对我们的启发：** 真实数据是我们相对 Habitica 的优势；一定要有内容更新节奏。

### AI × 健康数据 × 宠物
- 没找到把 HealthKit（尤其 HRV）+ AI 性格 + 宠物做成产品的成熟应用，这个位置确实空着。
- 有开源的 Apple Watch AI 宠物项目（shanwangwsd/virtualpet），值得借鉴的原则：**AI 永远不改游戏数值**，数值由确定性的规则引擎在服务器算；AI 输出要结构化、校验，不合格就退回规则模板；AI 读健康摘要需要用户单独同意。

## 2. 怎么集成到一起

```
HealthKit 数据
   │（服务器，确定性规则，可复现）
   ▼
回响（每种属性一个分数） ──► 成长值 / 状态 / 进化
   │                            │
   ├──► 野怪遭遇（属性按回响加权）  │
   │                            ▼
   └──────────────────────► 对战引擎（种子固定，可回放）
                                │
                                ▼
                 AI 只负责"讲出来"：把数字和结果翻译成宠物的话
```

1. **规则引擎说了算，AI 只负责讲。** 所有数值、遭遇、胜负都由服务器上的确定性代码算；AI 拿到结构化事实后，用宠物口吻解释。这样数值可测试、可复现，AI 出错也不会坏档。
2. **AI 的价值在"串因果"：** 把健康 → 宠物 → 对战这条链讲给玩家听。例如"周三你睡满 8 小时，我的恢复涨了，所以周日打 Boss 我撑到了最后一回合"。玩家理解了因果，才会为了宠物去改变生活。
3. **一个主分数给玩家看，细节藏在后面**（学 Pokémon Sleep）：比如每天显示一个"今日回响"总分 + 最高的那个属性，详细分项放在二级页面。
4. **周循环把日常和对战连起来**（学 Pokémon Sleep）：一周的回响累积 → 周日结算 Boss / 周信 / 稀有遭遇。
5. **反着做 Vital Bracelet 的痛点：** 不戴表不扣分、上手 30 秒、第一次进化当天就有。
6. **定期内容更新**（学 Pikmin Bloom、Tamaverse）：限时野怪、活动 Boss、节日外观，这也是以后付费内容的主要来源。

## 3. 健康指南参考值（用于生活方式倾向）

- WHO（2020）：成人每周 150–300 分钟中等强度有氧，或 75–150 分钟高强度；每周至少 2 天力量训练。
- 成人每晚至少 7 小时睡眠（CDC 和美国睡眠医学会的共识）。
- 健康成人深睡约占整晚的 13–23%，随年龄下降（单一临床机构文章，非正式指南，仅作参考）。

## 来源
- [WHO 身体活动说明](https://www.who.int/europe/news-room/fact-sheets/item/physical-activity)
- [WHO 推荐的运动量（EMRO）](https://www.emro.who.int/health-education/physical-activity/promoting-physical-activity/What-is-the-recommended-amount-of-exerci.html)
- [CDC：约三成美国成人睡眠不足 7 小时（ABC30）](https://abc30.com/post/cdc-report-finds-third-us-adults-not-getting-enough-sleep/19100094/)
- [深睡需要多少（Healthline）](https://www.healthline.com/health/how-much-deep-sleep-do-you-need)
- [睡眠实验室的深睡数据（Acibadem）](https://acibademinternational.com/?p=345645)
- [Digimon Vital Bracelet review（Inverse）](https://www.inverse.com/input/reviews/digimon-vital-bracelet-review-fitness-meets-digital-monsters)
- [Vital Hero review（The Toy Insider）](https://thetoyinsider.com/vital-hero-review/)
- [Vital Bracelet SP 说明书](https://p-bandai.com/us/contents/div/2030/images/VITAL%20BRACE_SP_manual_EN2.pdf)
- [Pokémon Sleep 玩法循环（Serebii）](https://serebii.net/pokemonsleep/gameplay.shtml)
- [Pokémon Sleep（Bulbapedia）](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Sleep)
- [Pikmin Bloom 突破 1 亿美元（PocketGamer.biz）](https://www.pocketgamer.biz/pikmin-bloom-hits-100m-after-four-years-as-2025-becomes-its-best-year-yet)
- [Pikmin Bloom 第五年（PocketGamer.biz）](https://www.pocketgamer.biz/pikmin-bloom-blossoms-in-fifth-year-with-record-36m/)
- [Finch 小组件与留存（Deconstructor of Fun）](https://www.deconstructoroffun.com/blog/x0hd2ssr80y5n7gv0w967pg7hwd7tl)
- [Finch 评论与情感依恋（appbot）](https://appbot.co/blog/finch-app-reviews-emotional-attachment-user-retention-product-loyalty/)
- [Tamagotchi Uni 发布（Toybook）](https://toybook.com/bandai-namco-luanches-tamagotchi-uni)
- [Tamazon Jungle Tour（All Ages of Geek）](https://allagesofgeek.com/tamazon-jungle-tour/)
- [游戏化健身参与度研究（CHI 2017）](https://www.csit.carleton.ca/~arya/pubs/chi-2017.pdf)
- [健身 RPG 应用对比（FitCraft）](https://getfitcraft.com/guides/fitness-rpg-apps)
- [shanwangwsd/virtualpet（GitHub）](https://github.com/shanwangwsd/virtualpet)
