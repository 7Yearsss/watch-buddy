/**
 * Lifestyle photos for the landing page. All from Unsplash, each checked on its own page as
 * "Free to use under the Unsplash License" (commercial use OK, no attribution required; we credit anyway).
 * Files: public/photos/<file>-1200.webp and -2400.webp (Unsplash CDN, WebP, q72).
 * Never use them to show our app's screens: device renders come from Apple's official marketing resources.
 */
export interface Photo { file: string; alt: string; scene: string; author: string; source: string }

export const PHOTOS = {
  morning: { file: "morning", alt: "清晨，阳光照进卧室，有人在床上挡着眼睛", scene: "早上醒来（早晨卡片）", author: "Gaofeng You", source: "https://unsplash.com/photos/woman-shielding-eyes-in-sunlit-bed-SL1nMVBtrrY" },
  wrist: { file: "wrist", alt: "手腕上的智能手表，屏幕亮着", scene: "抬腕看表（开场、点一下它）", author: "Amanz", source: "https://unsplash.com/photos/close-up-of-a-person-wearing-a-smartwatch-JlYGMFA3Xaw" },
  run: { file: "run", alt: "黄昏逆光里跑步的人", scene: "跑步（运动完，它出门探险）", author: "McCarthy Beckan", source: "https://unsplash.com/photos/woman-running-in-golden-hour-light-a6FHROHuQ9o" },
  strength: { file: "strength", alt: "健身房里拿着哑铃训练的人", scene: "力量训练（战斗形态）", author: "David Beneš", source: "https://unsplash.com/photos/a-man-holding-a-pair-of-dumbbells-in-a-gym-Tv_9O-c0tcA" },
  walk: { file: "walk", alt: "黄昏时分，行人走在老城的街道上", scene: "下班走路（白天它陪着你）", author: "Patricia Jekki", source: "https://unsplash.com/photos/people-standing-between-concrete-buildings-during-golden-hour-k4_sxnhj1c0" },
  cycle: { file: "cycle", alt: "在林间骑车的人", scene: "骑行（不同的生活）", author: "Mina Rad", source: "https://unsplash.com/photos/a-woman-riding-a-bike-in-the-woods-bl8R1_Lg4t4" },
  yoga: { file: "yoga", alt: "在客厅里做瑜伽树式的人", scene: "在家运动（不同的生活）", author: "Vitaly Gariev", source: "https://unsplash.com/photos/woman-practicing-yoga-tree-pose-in-living-room-lAL7ORvJEIc" },
  sleep: { file: "sleep", alt: "夜里卧室，床头只亮着一盏小灯", scene: "睡觉（睡前它先困了）", author: "Jp Valery", source: "https://unsplash.com/photos/table-lamp-turned-on-near-bed-DE9MM2voqKc" },
  friends: { file: "friends", alt: "两个人在公园里逆光一起跑步", scene: "和朋友一起（好友切磋）", author: "Huckster", source: "https://unsplash.com/photos/two-men-running-at-park-V62UrdknDCA" },
} satisfies Record<string, Photo>;

/** srcset for an <img>: 1200 for phones and normal screens, 2400 for full-bleed on retina. */
export const srcset = (p: Photo) => `/photos/${p.file}-1200.webp 1200w, /photos/${p.file}-2400.webp 2400w`;
export const src = (p: Photo) => `/photos/${p.file}-1200.webp`;
