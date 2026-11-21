import type { DailyHealth, EchoScores, EchoType, PetState } from "@pulseling/engine";
import { TYPE_NAME } from "./text";

/** Daily small surprises (07 §2): every morning without a wild monster gets one, never the same kind within 3 days. */
export type SurpriseKind = "dream" | "item" | "footprint" | "discovery" | "move" | "meteor" | "guest" | "treasure" | "weather";

export interface Surprise {
  date: string;
  kind: SurpriseKind;
  text: string;
  /** Watch-sized line (≈10 chars). */
  short: string;
  item?: string;
  move?: IdleMove;
  /** guest: a wild species that stays the night and is met for sure the next morning. */
  guest?: string;
  /** weather: tomorrow's wild monsters lean towards this type. */
  weather?: EchoType;
  /** treasure: the morning the chest opens. */
  opensOn?: string;
}

export const SURPRISE_LABEL: Record<SurpriseKind, string> = {
  dream: "梦境日记", item: "捡到小东西", footprint: "野怪足迹", discovery: "数据小发现", move: "学会新动作",
  meteor: "流星雨", guest: "迷路的野怪", treasure: "藏宝图", weather: "明天的天气",
};
export const SURPRISE_ICON: Record<SurpriseKind, string> = { dream: "☁", item: "◆", footprint: "∴", discovery: "↗", move: "♪", meteor: "✦", guest: "⌂", treasure: "✉", weather: "☂" };

/** Rare finds from treasure maps; they go into the collection book like other items. */
export const TREASURE_ITEMS = ["旧地图碎片", "金色橡果", "彩虹贝壳", "星砂瓶", "会发光的石头"];
/** Days between finding a treasure map and the chest opening. */
export const TREASURE_DAYS = 3;
const WEATHER: { type: EchoType; name: string; text: string }[] = [
  { type: "water", name: "下雨", text: "明天会下雨，水系野怪会多出来哦" },
  { type: "fire", name: "大晴天", text: "明天是大晴天，火系野怪最喜欢晒太阳了" },
  { type: "flying", name: "刮风", text: "明天有风，飞行系野怪会顺着风飞过来" },
  { type: "electric", name: "雷雨", text: "明天可能打雷，电系野怪会变多" },
];

/** Collectibles by type. They go into the collection book and never give battle power. */
export const ITEMS: Record<EchoType, string[]> = {
  grass: ["四叶草", "橡果", "嫩芽"],
  water: ["小贝壳", "露珠", "蓝色鹅卵石"],
  shadow: ["月光石", "夜来香", "星星碎片"],
  fire: ["火石", "暖暖的炭", "红枫叶"],
  fighting: ["旧护腕", "小哑铃", "拳套扣子"],
  flying: ["白羽毛", "蒲公英", "风车"],
  electric: ["电池石", "闪光的铜线", "雷雨云朵"],
  ground: ["小化石", "陶片", "金色沙粒"],
};

export type IdleMove = "stretch" | "spin" | "hop" | "wave" | "dance";
export const MOVE_NAME: Record<IdleMove, string> = { stretch: "伸懒腰", spin: "转圈", hop: "原地蹦跳", wave: "挥手", dance: "跳舞" };
const MOVES: IdleMove[] = ["stretch", "hop", "spin", "wave", "dance"];

/** What to do more of to meet a type (also used by the dex). */
export const HINT: Record<EchoType, string> = {
  grass: "多走走路", water: "早点睡、睡够", shadow: "睡得深一点", fire: "多活动、出出汗",
  fighting: "做做力量训练", flying: "跑跑步、骑骑车", electric: "试试间歇训练", ground: "每天都动一动、多爬楼",
};

const DREAMS: Record<EchoType, string[]> = {
  grass: ["我梦见自己在一大片草地上一直走一直走……一定是因为你昨天走了好多路", "我梦见跟着一只蜗牛逛完了整个公园，它居然走得比我快", "我梦见脚下每走一步就开出一朵小花"],
  water: ["我梦见自己漂在一片很安静的湖上，睡得好舒服……跟你昨晚一样", "我梦见下了一整晚的小雨，我躲在大叶子下面睡着了", "我梦见自己变成了一条小鱼，在海底打了个长长的盹"],
  shadow: ["我梦见掉进了一个软软的星空里，一点声音都没有", "我梦见月亮给我盖了一床被子，睡得特别沉", "我梦见在一个黑黑的山洞里，结果里面全是萤火虫"],
  fire: ["我梦见自己变成了一团小火苗，蹦来蹦去停不下来", "我梦见在篝火边跳了一整晚的舞，热乎乎的", "我梦见太阳请我去它家玩，我一路小跑过去"],
  fighting: ["我梦见自己举起了一块大石头！醒来手还有点酸", "我梦见跟一只熊掰手腕，打成了平手", "我梦见自己在山顶做俯卧撑，云都在给我数数"],
  flying: ["我梦见自己在云上跑步，风呼呼地吹……一定是因为你昨天去运动了", "我梦见骑着一只大鸟绕着城市飞了一圈", "我梦见自己追着风筝跑，跑着跑着就飞起来了"],
  electric: ["我梦见被闪电追着跑，越跑越快，心跳咚咚咚", "我梦见自己变成了一颗电池，满格的那种", "我梦见在雷雨里冲刺，每一步都噼里啪啦"],
  ground: ["我梦见自己爬上了一座好高好高的山，看到了日出", "我梦见在沙滩上挖到了一块恐龙骨头", "我梦见一级一级地爬楼梯，最上面是一朵云"],
};
const DREAM_PLAIN = "我梦见我们俩坐在一起看星星，什么都没说，但是很开心";

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const worn = (days: DailyHealth[]) => days.filter((d) => d.worn);

/** A positive change this week vs last week, said relative to the player. Null if nothing improved. */
function discovery(history: DailyHealth[]): { text: string; short: string } | null {
  const thisWeek = worn(history.slice(-7));
  const lastWeek = worn(history.slice(-14, -7));
  if (thisWeek.length < 3 || lastWeek.length < 3) return null;
  // Average only the days that have the metric: a night the watch was charging is not a night of zero sleep.
  const known = (days: DailyHealth[], f: (d: DailyHealth) => number | undefined) =>
    days.map(f).filter((v): v is number => typeof v === "number");
  const pick = (f: (d: DailyHealth) => number | undefined) => {
    const now = known(thisWeek, f);
    const then = known(lastWeek, f);
    return now.length >= 3 && then.length >= 3 ? [avg(now), avg(then)] : [0, 0];
  };
  const cands: { score: number; text: string; short: string }[] = [];
  const [bedNow, bedThen] = pick((d) => d.bedtimeMinutes);
  if (bedThen! - bedNow! >= 10) cands.push({ score: (bedThen! - bedNow!) / 30, text: `你这周平均入睡比上周早了 ${Math.round(bedThen! - bedNow!)} 分钟！`, short: `这周早睡了 ${Math.round(bedThen! - bedNow!)} 分钟！` });
  const [sleepNow, sleepThen] = pick((d) => d.sleepMinutes);
  if (sleepNow! - sleepThen! >= 10) cands.push({ score: (sleepNow! - sleepThen!) / 30, text: `你这周平均每晚比上周多睡了 ${Math.round(sleepNow! - sleepThen!)} 分钟`, short: `这周每晚多睡 ${Math.round(sleepNow! - sleepThen!)} 分钟` });
  const [stepNow, stepThen] = pick((d) => d.steps);
  if (stepThen! > 0 && stepNow! / stepThen! >= 1.08) cands.push({ score: stepNow! / stepThen! - 1, text: `你这周平均每天比上周多走了 ${Math.round((stepNow! / stepThen! - 1) * 100)}%`, short: `这周多走了 ${Math.round((stepNow! / stepThen! - 1) * 100)}%` });
  const [cardioNow, cardioThen] = pick((d) => d.cardioMinutes);
  if (cardioNow! - cardioThen! >= 3) cands.push({ score: (cardioNow! - cardioThen!) / 10, text: `你这周的有氧运动比上周多了 ${Math.round((cardioNow! - cardioThen!) * thisWeek.length)} 分钟`, short: `有氧比上周多 ${Math.round((cardioNow! - cardioThen!) * thisWeek.length)} 分钟` });
  cands.sort((a, b) => b.score - a.score);
  return cands[0] ?? null;
}

export interface SurpriseInput {
  userId: string;
  date: string;
  pet: PetState;
  echoes: EchoScores;
  history: DailyHealth[];
  /** Types of wild monsters not captured yet. */
  uncapturedTypes: EchoType[];
  recent: Surprise[];
  /** Date of the last new move, so moves stay rare milestones. */
  lastMoveDate?: string;
  moves: IdleMove[];
  /** Uncaptured wild species that could come to stay the night. */
  guestCandidates?: string[];
  /** A treasure map is already waiting to open. */
  treasurePending?: boolean;
}

export function pickSurprise(x: SurpriseInput): Surprise {
  const top = (Object.entries(x.echoes) as [EchoType, number][]).filter(([, v]) => v > 0.15).sort((a, b) => b[1] - a[1])[0]?.[0];
  const recentKinds = new Set(x.recent.filter((r) => r.date > addDaysStr(x.date, -3)).map((r) => r.kind));
  const disc = discovery(x.history);
  const nextMove = MOVES.find((m) => !x.moves.includes(m));
  // It only dreams on nights it slept on your wrist: a small reward for wearing the watch to bed, never a requirement.
  const sleptWithYou = typeof x.history[x.history.length - 1]?.sleepMinutes === "number";
  const all: { kind: SurpriseKind; w: number }[] = [
    { kind: "dream", w: sleptWithYou ? (top ? 3 : 2) : 0 },
    { kind: "item", w: 3 },
    { kind: "footprint", w: x.uncapturedTypes.length ? 2 : 0 },
    { kind: "discovery", w: disc ? 3 : 0 },
    // New moves come early and then stop, so they feel like milestones.
    { kind: "move", w: nextMove && (!x.lastMoveDate || x.lastMoveDate <= addDaysStr(x.date, -10)) ? 2 : 0 },
    // Events that change tomorrow: rarer, so they still feel like news.
    { kind: "meteor", w: 1 },
    { kind: "guest", w: x.guestCandidates?.length ? 1 : 0 },
    { kind: "treasure", w: x.treasurePending ? 0 : 1 },
    { kind: "weather", w: 1.5 },
  ];
  const pool = all.filter((p) => p.w > 0 && !recentKinds.has(p.kind));
  const choices = pool.length ? pool : [{ kind: "item" as SurpriseKind, w: 1 }];
  const total = choices.reduce((a, p) => a + p.w, 0);
  let r = (hash(`${x.userId}:${x.date}:surprise`) % 1000) / 1000 * total;
  let kind = choices[0]!.kind;
  for (const p of choices) {
    if ((r -= p.w) < 0) { kind = p.kind; break; }
  }
  const h = hash(`${x.userId}:${x.date}:detail`);

  switch (kind) {
    case "dream":
    {
      const text = top ? DREAMS[top][h % DREAMS[top].length]! : DREAM_PLAIN;
      // Specific, not vague: the first clause of the dream itself ("我梦见自己在云上跑步…").
      const first = text.split(/[，……！]/)[0]!;
      return { date: x.date, kind, text, short: first.length > 12 ? first.slice(0, 11) + "…" : first + "…" };
    }
    case "item": {
      const type = top ?? (x.pet.starter as EchoType);
      const list = ITEMS[type];
      const item = list[h % list.length]!;
      return { date: x.date, kind, item, text: `散步的时候捡到了「${item}」，放进收藏册啦`, short: `捡到${item}！` };
    }
    case "footprint": {
      const type = x.uncapturedTypes[h % x.uncapturedTypes.length]!;
      return { date: x.date, kind, text: `附近有${TYPE_NAME[type]}系的足迹……${HINT[type]}，说不定能遇到它`, short: `有${TYPE_NAME[type]}系足迹` };
    }
    case "discovery":
      return { date: x.date, kind, text: disc!.text, short: disc!.short };
    case "move":
      return { date: x.date, kind, move: nextMove!, text: `我学会了「${MOVE_NAME[nextMove!]}」！点点我看看`, short: `学会${MOVE_NAME[nextMove!]}了` };
    case "meteor":
      return { date: x.date, kind, text: "昨晚有流星雨，我许了个愿：明天遇到野怪的机会翻倍！", short: "流星雨！明天好运" };
    case "guest": {
      const id = x.guestCandidates![h % x.guestCandidates!.length]!;
      return { date: x.date, kind, guest: id, text: "有只迷路的野怪来借宿一晚……明早它会来找你比试，赢了就能收服它", short: "有野怪来借宿" };
    }
    case "treasure": {
      const opensOn = addDaysStr(x.date, TREASURE_DAYS);
      return { date: x.date, kind, opensOn, text: `我捡到了一张藏宝图！${TREASURE_DAYS} 天后宝箱就能打开`, short: "捡到藏宝图！" };
    }
    case "weather": {
      const w = WEATHER[h % WEATHER.length]!;
      return { date: x.date, kind, weather: w.type, text: w.text, short: `明天${w.name}` };
    }
  }
}

function addDaysStr(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
