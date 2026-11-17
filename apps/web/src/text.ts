import type { AdultVariant, EchoScores, ElementType, HatchFacts, Personality, Rarity, SkillId, Stat, Tactic } from "@pulseling/engine";

export const TYPE_NAME: Record<ElementType, string> = {
  grass: "草", water: "水", fire: "火", electric: "电", ground: "地面", fighting: "战斗", flying: "飞行", shadow: "暗影", dragon: "龙",
};
export const RARITY_NAME: Record<Rarity, string> = { common: "普通", uncommon: "不普通", rare: "稀有", epic: "史诗", legendary: "传说" };
export const VARIANT_NAME: Record<AdultVariant, string> = {
  pure: "纯系强化", flying: "飞行", fighting: "战斗", ground: "地面", electric: "电", shadow: "暗影", dragon: "龙",
};
export const STAT_NAME: Record<Stat, string> = { hp: "体力", recovery: "恢复", attack: "攻击", speed: "速度", defense: "防御" };
export const PERSONALITY_NAME: Record<Personality, string> = { genki: "元气", tsundere: "傲娇", gentle: "温柔", chuuni: "中二", chill: "佛系" };
export const TACTIC_NAME: Record<Tactic, string> = { aggressive: "激进", balanced: "稳健", cautious: "保守" };

export const SPECIES_NAME: Record<string, string> = {
  sprout: "芽芽", puddle: "水洼", spark: "火星", zap: "噼噼", pebble: "石子", knuckle: "拳拳", feather: "羽羽", murk: "暗暗", wyrmling: "小龙崽",
  thornback: "刺背", coralis: "珊瑚灵", cinderfox: "烬狐", voltail: "电尾", dunemole: "沙鼹", brawlbit: "斗斗",
  skylark: "云雀", umbra: "影魅", elderwyrm: "古龙",
  "training-dummy": "训练假人",
};
export const speciesName = (id: string) => SPECIES_NAME[id] ?? (id.startsWith("boss-") ? `${TYPE_NAME[id.slice(5) as ElementType] ?? ""}系 Boss` : id);

export const SKILL_NAME: Record<string, string> = {
  tackle: "撞击", guard: "护盾", rest: "休息", chill: "冷场",
  "leaf-cut": "叶刃", "tide-push": "浪推", "ember-bite": "火咬", "static-jolt": "静电", "rock-stomp": "岩踏", "iron-fist": "铁拳",
  "gust-dive": "俯冲", "night-fang": "夜牙", "wyrm-claw": "龙爪",
  "bloom-storm": "花暴", "tidal-crash": "潮涌", "blaze-burst": "爆焰", "sky-strike": "天击", "titan-blow": "巨力拳",
  "dragon-roar": "龙吼", "thunder-dash": "雷冲", quake: "地震", eclipse: "日蚀",
};
export const skillName = (id: SkillId | string) => SKILL_NAME[id] ?? id;

const h = (min: number) => `${Math.floor(min / 60)} 小时${min % 60 ? ` ${min % 60} 分` : ""}`;

type Lines = Record<Personality, string>;
const say = (p: Personality, lines: Lines) => lines[p];

export function hatchLine(p: Personality, facts: HatchFacts): string {
  if (facts.historyDays < 7)
    return say(p, {
      genki: "你好呀！我们一起从今天开始吧！",
      tsundere: "……哼，我才刚出来，先看看你表现怎么样。",
      gentle: "初次见面，我们慢慢来就好。",
      chuuni: "契约已成立。吾将与汝之心跳共鸣。",
      chill: "嗯……醒了。从今天开始吧。",
    });
  const steps = Math.round((facts.avgSteps ?? 0) / 100) * 100;
  const cardio = Math.round(facts.weeklyCardioMinutes ?? 0);
  const fact = cardio >= 60 ? `你每周跑步大概 ${cardio} 分钟` : `你平均每天走 ${steps} 步`;
  return say(p, {
    genki: `我在蛋里都感觉到啦！${fact}！`,
    tsundere: `${fact}……还、还行吧，本大人勉强认可。`,
    gentle: `我知道哦，${fact}。辛苦啦。`,
    chuuni: `汝过去一月之律动……${fact}，已刻入吾之灵魂。`,
    chill: `${fact}啊……挺好，挺好。`,
  });
}

export type Mood = "happy" | "sleepy" | "bored";

export function moodOf(echoes: EchoScores, sleepMinutes?: number): Mood {
  if ((sleepMinutes ?? 420) < 360 || (echoes.water ?? 0) < -0.3) return "sleepy";
  const active = Math.max(echoes.grass ?? 0, echoes.flying ?? 0, echoes.fighting ?? 0, echoes.fire ?? 0);
  if (active < -0.3) return "bored";
  return "happy";
}

export function morningLine(p: Personality, sleepMinutes: number | undefined, mood: Mood, encounter: boolean, captured: boolean, wildName: string): string {
  const sleep = sleepMinutes === undefined ? "" : `昨晚睡了 ${h(sleepMinutes)}，`;
  if (mood === "sleepy")
    return say(p, {
      genki: `${sleep}我电量只剩一格了……今晚早点睡好不好！`,
      tsundere: `${sleep}……也不是说我困啦，只是这种数字本大人不太满意。`,
      gentle: `${sleep}今天别太勉强自己，我陪你慢慢来。`,
      chuuni: `${sleep}封印之夜过于短暂……吾之力量尚未觉醒。`,
      chill: `${sleep}困了就再眯会儿，我也眯会儿。`,
    });
  if (encounter && captured)
    return say(p, {
      genki: `${sleep}我在梦里遇到了${wildName}，还把它打赢啦！`,
      tsundere: `${sleep}顺手收服了${wildName}，小意思。`,
      gentle: `${sleep}梦里遇到了${wildName}，我们成了朋友。`,
      chuuni: `${sleep}梦境之中，${wildName}已臣服于吾。`,
      chill: `${sleep}梦里碰到${wildName}，就……打赢了。`,
    });
  if (encounter)
    return say(p, {
      genki: `${sleep}梦里遇到${wildName}，差一点点！下次一定！`,
      tsundere: `${sleep}${wildName}跑掉了……下次绝对不会让它跑！`,
      gentle: `${sleep}${wildName}跑掉了，没关系，还会再见的。`,
      chuuni: `${sleep}${wildName}逃离了吾之领域……暂且放它一马。`,
      chill: `${sleep}${wildName}跑了，随它去吧。`,
    });
  if (mood === "bored")
    return say(p, {
      genki: `${sleep}最近都没怎么出门，想出去走走～`,
      tsundere: `${sleep}……我才没有很想出去玩呢。`,
      gentle: `${sleep}有空的话，我们一起去散散步吧。`,
      chuuni: `${sleep}吾之力量正在沉睡……需要外界的刺激。`,
      chill: `${sleep}最近挺安静的，也行。`,
    });
  return say(p, {
    genki: `${sleep}今天也元气满满！`,
    tsundere: `${sleep}状态还不错，算你厉害。`,
    gentle: `${sleep}早安，今天也要好好照顾自己哦。`,
    chuuni: `${sleep}吾之力量正在苏醒。`,
    chill: `${sleep}早。今天也慢慢来。`,
  });
}
