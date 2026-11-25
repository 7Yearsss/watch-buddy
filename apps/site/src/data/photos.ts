import type { Dict } from "../i18n";

/**
 * Lifestyle photos for the landing page. All from Unsplash, each checked on its own page as
 * "Free to use under the Unsplash License" (commercial use OK, no attribution required; we credit anyway).
 * Files: public/photos/<file>-1200.webp and -2400.webp (Unsplash CDN, WebP, q72).
 * Never use them to show our app's screens: device renders come from Apple's official marketing resources.
 */
/** Alt text lives in the dictionaries (src/i18n, `alts`), one per language. */
export interface Photo { file: keyof Dict["alts"]; scene: string; author: string; source: string }

export const PHOTOS = {
  morning: { file: "morning", scene: "早上醒来（早晨卡片）", author: "Gaofeng You", source: "https://unsplash.com/photos/woman-shielding-eyes-in-sunlit-bed-SL1nMVBtrrY" },
  run: { file: "run", scene: "跑步（运动完，它出门探险）", author: "McCarthy Beckan", source: "https://unsplash.com/photos/woman-running-in-golden-hour-light-a6FHROHuQ9o" },
  strength: { file: "strength", scene: "力量训练（战斗形态）", author: "David Beneš", source: "https://unsplash.com/photos/a-man-holding-a-pair-of-dumbbells-in-a-gym-Tv_9O-c0tcA" },
  walk: { file: "walk", scene: "下班走路（白天它陪着你）", author: "Patricia Jekki", source: "https://unsplash.com/photos/people-standing-between-concrete-buildings-during-golden-hour-k4_sxnhj1c0" },
  cycle: { file: "cycle", scene: "骑行（不同的生活）", author: "Mina Rad", source: "https://unsplash.com/photos/a-woman-riding-a-bike-in-the-woods-bl8R1_Lg4t4" },
  yoga: { file: "yoga", scene: "在家运动（不同的生活）", author: "Vitaly Gariev", source: "https://unsplash.com/photos/woman-practicing-yoga-tree-pose-in-living-room-lAL7ORvJEIc" },
  sleep: { file: "sleep", scene: "睡觉（睡前它先困了）", author: "Jp Valery", source: "https://unsplash.com/photos/table-lamp-turned-on-near-bed-DE9MM2voqKc" },
  friends: { file: "friends", scene: "和朋友一起（好友切磋）", author: "Huckster", source: "https://unsplash.com/photos/two-men-running-at-park-V62UrdknDCA" },
} satisfies Record<string, Photo>;

/** srcset for an <img>: 1200 for phones and normal screens, 2400 for full-bleed on retina. */
export const srcset = (p: Photo) => `/photos/${p.file}-1200.webp 1200w, /photos/${p.file}-2400.webp 2400w`;
export const src = (p: Photo) => `/photos/${p.file}-1200.webp`;
