export type QuestMeta = {
  id: string;
  number: string;
  title: string;
  question: string;
  params: string[];
  href: string;
};

export const QUESTS: QuestMeta[] = [
  {
    id: "slide",
    number: "Q1",
    title: "斜面スライド",
    question: "摩擦をどこまで上げたら、箱は滑らなくなる？",
    params: ["摩擦係数"],
    href: "/physics/slide",
  },
  {
    id: "fall",
    number: "Q2",
    title: "自由落下レース",
    question: "重い球と軽い球、先に着くのはどっち？",
    params: ["質量", "空気抵抗"],
    href: "/physics/fall",
  },
  {
    id: "gravity",
    number: "Q3",
    title: "重力切替チャレンジ",
    question: "重力を調整して、落下時間を目標ぴったりに。",
    params: ["重力加速度"],
    href: "/physics/gravity",
  },
];

export const questById = (id: string) => QUESTS.find((q) => q.id === id)!;
export const nextQuest = (id: string) => {
  const i = QUESTS.findIndex((q) => q.id === id);
  return i >= 0 && i < QUESTS.length - 1 ? QUESTS[i + 1] : null;
};
