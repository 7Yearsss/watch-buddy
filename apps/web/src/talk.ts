import type { DailyHealth, EchoType, Personality } from "@pulseling/engine";
import { TYPE_NAME } from "./text";

export type ReplyId = "pet" | "cheer" | "sleep-early" | "move" | "tired";

export const REPLIES: { id: ReplyId; label: string }[] = [
  { id: "pet", label: "摸摸它" },
  { id: "cheer", label: "加油！" },
  { id: "sleep-early", label: "我今晚早点睡" },
  { id: "move", label: "我明天去运动" },
  { id: "tired", label: "今天好累" },
];

export const CHATS_PER_DAY = 3;

type ByPersonality = Record<Personality, string>;

const REPLY_LINES: Record<ReplyId, ByPersonality> = {
  pet: {
    genki: "嘿嘿，好痒！再来一次！",
    tsundere: "……只、只准摸一下哦。",
    gentle: "好舒服，谢谢你～",
    chuuni: "汝之掌心……传来了温暖的波动。",
    chill: "嗯……舒服。",
  },
  cheer: {
    genki: "一起加油！我会变得超级强！",
    tsundere: "哼，不用你说我也会努力的。",
    gentle: "嗯，我们一起慢慢变好。",
    chuuni: "吾之力量，正因汝之鼓舞而觉醒！",
    chill: "好～那就加点油。",
  },
  "sleep-early": {
    genki: "好耶！那我等你，明天看看你有没有做到！",
    tsundere: "……我会记住的，别想赖账。",
    gentle: "好呀，我记下了，今晚好好休息。",
    chuuni: "契约已订立。明日之晨，吾将见证。",
    chill: "行，我记着。睡吧睡吧。",
  },
  move: {
    genki: "说好了哦！明天我们去活动活动！",
    tsundere: "说到就要做到，本大人会检查的。",
    gentle: "好呀，我记下了，不用勉强，动一动就好。",
    chuuni: "明日之战……吾已期待。",
    chill: "好，明天动一动。",
  },
  tired: {
    genki: "那今天就好好休息！我陪你！",
    tsundere: "……那你今天就别逞强了，听到没。",
    gentle: "辛苦了，今天早点休息吧，我在这里。",
    chuuni: "疲惫之躯需要休眠……吾为汝守夜。",
    chill: "累了就歇着，没事的。",
  },
};

export const replyLine = (p: Personality, id: ReplyId) => REPLY_LINES[id][p];

export type PromiseKind = "sleep" | "move";

export function promiseKept(kind: PromiseKind, day: DailyHealth): boolean {
  if (!day.worn) return false;
  if (kind === "sleep") return (day.sleepMinutes ?? 0) >= 420;
  return (day.cardioMinutes ?? 0) + (day.strengthMinutes ?? 0) + (day.highIntensityMinutes ?? 0) >= 20 || (day.steps ?? 0) >= 10000;
}

export function promiseLine(p: Personality, kind: PromiseKind, kept: boolean): string {
  const what = kind === "sleep" ? "早点睡" : "去运动";
  if (kept)
    return {
      genki: `你说到做到了！真的${what}了！`,
      tsundere: `……居然真的${what}了，算你厉害。`,
      gentle: `你真的${what}了，我好开心。`,
      chuuni: `契约已履行。汝之意志，吾已见证。`,
      chill: `说${what}就${what}，挺好。`,
    }[p];
  return {
    genki: `昨天说好${what}的……没关系，今天再试试！`,
    tsundere: `说好的${what}呢？……哼，下次不许了。`,
    gentle: `昨天没能${what}也没关系，我们慢慢来。`,
    chuuni: `契约暂未履行……吾给汝第二次机会。`,
    chill: `没${what}啊，没事，下次吧。`,
  }[p];
}

const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const weekday = (date: string) => WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()]!;

export interface LetterInput {
  personality: Personality;
  days: DailyHealth[];
  growth: number;
  captures: string[];
  bossType: EchoType;
  bossWon: boolean;
  bossAdvantage: "bossAdvantage" | "neutral" | "petAdvantage";
  nextBossType: EchoType;
  counterHint: string | null;
}

const OPENING: ByPersonality = {
  genki: "主人！这周也超开心的！",
  tsundere: "……既然你想知道，本大人就勉强写一封。",
  gentle: "亲爱的你，这一周辛苦了。",
  chuuni: "致与吾立下契约之人：",
  chill: "嗨，又过了一周。",
};

const CLOSING: ByPersonality = {
  genki: "下周也要一起加油哦！",
  tsundere: "……下周也别让我失望。",
  gentle: "我会一直在这里陪着你。",
  chuuni: "吾等之征途，方才开始。",
  chill: "下周也慢慢来吧。",
};

/** A weekly letter that tells the causal story: what you did → how I grew → how the boss went → what to do next. */
export function weeklyLetter(x: LetterInput): string {
  const worn = x.days.filter((d) => d.worn);
  const avg = (k: keyof DailyHealth) => {
    const v = worn.map((d) => d[k]).filter((n): n is number => typeof n === "number");
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const sleep = Math.round(avg("sleepMinutes"));
  const steps = Math.round(avg("steps") / 100) * 100;
  const workouts = worn.filter((d) => (d.cardioMinutes ?? 0) + (d.strengthMinutes ?? 0) + (d.highIntensityMinutes ?? 0) >= 20);
  const best = [...worn].sort(
    (a, b) => (b.cardioMinutes ?? 0) + (b.strengthMinutes ?? 0) + (b.highIntensityMinutes ?? 0) - ((a.cardioMinutes ?? 0) + (a.strengthMinutes ?? 0) + (a.highIntensityMinutes ?? 0)),
  )[0];
  const bestSleep = [...worn].sort((a, b) => (b.sleepMinutes ?? 0) - (a.sleepMinutes ?? 0))[0];

  const lines: string[] = [OPENING[x.personality], ""];
  lines.push(
    `这一周你平均每晚睡了 ${Math.floor(sleep / 60)} 小时 ${sleep % 60} 分，每天走了 ${steps.toLocaleString()} 步，运动了 ${workouts.length} 次。我一共长了 ${Math.round(x.growth)} 点成长值${x.captures.length ? `，还收服了 ${x.captures.join("、")}` : ""}。`,
  );

  const typeName = TYPE_NAME[x.bossType];
  let why = "";
  if (x.bossWon) {
    if (workouts.length && best) why = `${weekday(best.date)}那次运动让我状态特别好。`;
    else if (bestSleep && (bestSleep.sleepMinutes ?? 0) >= 450) why = `${weekday(bestSleep.date)}你睡得很好，我精神满满。`;
    lines.push(`周末的${typeName}系 Boss……我赢了！${why}`);
  } else {
    if (x.bossAdvantage === "bossAdvantage") why = `它克制我的属性${x.counterHint ? `，下次带上${x.counterHint}试试` : "，要是能学会克制它的技能就好了"}。`;
    else if (sleep < 420) why = "这周睡得少了一点，我有点没力气。";
    else why = "它真的很强，我们下周再来。";
    lines.push(`周末的${typeName}系 Boss 没打过……${why}`);
  }

  lines.push(`下周是${TYPE_NAME[x.nextBossType]}系 Boss。${sleep < 420 ? "想赢的话，这周多睡一点吧。" : workouts.length < 2 ? "想赢的话，这周多动一动吧。" : "保持这个状态就好！"}`);
  lines.push("", CLOSING[x.personality]);
  return lines.join("\n");
}
