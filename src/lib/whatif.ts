// もしも計算機: 地球規模の「もしも」を、実際の物理の式と実測値で計算する
// 定数の出典の目安: 地球の慣性モーメント・自転角速度・質量・半径は理科年表やNASAの公表値と同じ値

export const EARTH = {
  R: 6.371e6, // 平均半径 [m]
  M: 5.972e24, // 質量 [kg]
  I: 8.034e37, // 慣性モーメント [kg·m²]
  omega: 7.2921e-5, // 自転の角速度 [rad/s]
  g: 9.81,
};
export const DAY = 86400;
export const MOON_DIST = 3.844e8; // [m]
export const MOON_PERIOD_DAYS = 27.32; // 恒星月
export const MOON_SIZE_DEG = 0.52;

export type Param = {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  presets?: { label: string; value: number }[];
  log?: boolean;
};

export type Ref = { label: string; value: number };

export type Result = {
  headline: string;
  big: string;
  sub: string;
  rows: { label: string; value: string }[];
  ruler?: { title: string; value: number; valueLabel: string; refs: Ref[]; fmt: "time" | "len" | "speed" | "energy" | "ratio" };
};

export type Scenario = {
  id: string;
  title: string;
  question: string;
  params: Param[];
  compute: (p: Record<string, number>) => Result;
  why: string[];
  formula: string;
  assumptions: string[];
  visual?: "tunnel";
};

/* ───────── 数の読みやすい表し方 ───────── */

const SUP: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };

/** 9.0 × 10⁻¹¹ のような書き方 */
export function sci(x: number, digits = 2): string {
  if (x === 0) return "0";
  if (!Number.isFinite(x)) return "—";
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e >= -2 && e <= 5) return plain(x, digits);
  const m = x / 10 ** e;
  const ms = Number(m.toPrecision(digits)).toString();
  const es = String(e)
    .split("")
    .map((c) => SUP[c] ?? c)
    .join("");
  return `${ms} × 10${es}`;
}

export function plain(x: number, digits = 3): string {
  if (Math.abs(x) >= 1000) return Math.round(x).toLocaleString("ja-JP");
  return Number(x.toPrecision(digits)).toLocaleString("ja-JP", { maximumFractionDigits: 6 });
}

/** 大きな数を「億」「兆」で */
export function jpBig(x: number): string {
  const a = Math.abs(x);
  if (a >= 1e16) return `${plain(x / 1e16)}京`;
  if (a >= 1e12) return `${plain(x / 1e12)}兆`;
  if (a >= 1e8) return `${plain(x / 1e8)}億`;
  if (a >= 1e4) return `${plain(x / 1e4)}万`;
  return plain(x);
}

export function humanTime(s: number): string {
  const a = Math.abs(s);
  if (a >= 86400 * 365) return `${plain(s / (86400 * 365.25))} 年`;
  if (a >= 86400) return `${plain(s / 86400)} 日`;
  if (a >= 3600) return `${plain(s / 3600)} 時間`;
  if (a >= 60) return `${plain(s / 60)} 分`;
  if (a >= 1) return `${plain(s)} 秒`;
  if (a >= 1e-3) return `${plain(s * 1e3)} ミリ秒`;
  if (a >= 1e-6) return `${plain(s * 1e6)} マイクロ秒`;
  if (a >= 1e-9) return `${plain(s * 1e9)} ナノ秒`;
  if (a >= 1e-12) return `${plain(s * 1e12)} ピコ秒`;
  return `${sci(s)} 秒`;
}

export function humanLen(m: number): string {
  const a = Math.abs(m);
  if (a >= 1000) return `${plain(m / 1000)} km`;
  if (a >= 1) return `${plain(m)} m`;
  if (a >= 0.01) return `${plain(m * 100)} cm`;
  if (a >= 1e-3) return `${plain(m * 1e3)} mm`;
  if (a >= 1e-6) return `${plain(m * 1e6)} マイクロメートル`;
  if (a >= 1e-9) return `${plain(m * 1e9)} ナノメートル`;
  if (a >= 1e-12) return `${plain(m * 1e12)} ピコメートル`;
  return `${sci(m)} m`;
}

export function humanSpeed(v: number): string {
  return `${plain(v)} m/s（時速 ${plain(v * 3.6)} km）`;
}

export function humanEnergy(j: number): string {
  if (Math.abs(j) >= 1e9) return `${sci(j)} J`;
  return `${plain(j)} J`;
}

const deg = (d: number) => (d * Math.PI) / 180;

/* ───────── シナリオ ───────── */

export const SCENARIOS: Scenario[] = [
  {
    id: "east-run",
    title: "もし地球の全人類が、同時に東へ走ったら",
    question: "80億人がいっせいに東へ走りだすと、地球の回転（1日の長さ）は変わる？",
    params: [
      { key: "people", label: "走る人数", unit: "億人", min: 1, max: 100, step: 1, value: 80 },
      { key: "mass", label: "1人の平均の体重", unit: "kg", min: 10, max: 120, step: 1, value: 50 },
      {
        key: "speed",
        label: "走る速さ",
        unit: "km/h",
        min: 1,
        max: 40,
        step: 0.5,
        value: 10,
        presets: [
          { label: "ジョギング 10", value: 10 },
          { label: "全力疾走 25", value: 25 },
          { label: "世界最速 37", value: 37.6 },
        ],
      },
      { key: "lat", label: "みんながいる平均の緯度", unit: "度", min: 0, max: 80, step: 1, value: 30 },
    ],
    compute(p) {
      const N = p.people * 1e8;
      const v = p.speed / 3.6;
      const r = EARTH.R * Math.cos(deg(p.lat)); // 地軸からの距離
      const dL = N * p.mass * v * r; // 人が東向きに得る角運動量
      const L = EARTH.I * EARTH.omega;
      const dT = (DAY * dL) / L; // 1日が長くなる量（走っている間だけ）
      const push = (N * p.mass * v) / 2; // 2秒で加速するときに地面を押す力
      return {
        headline: "走っている間だけ、1日が長くなる",
        big: humanTime(dT),
        sub: `= ${sci(dT)} 秒。みんなが止まると、元に戻る。`,
        rows: [
          { label: "人の合計の重さ", value: `${jpBig(N * p.mass)} kg` },
          { label: "人が東向きにもらう回転の勢い（角運動量）", value: `${sci(dL)} kg·m²/s` },
          { label: "地球の回転の勢い", value: `${sci(L)} kg·m²/s` },
          { label: "その比", value: `${sci(dL / L)}（1000兆分の${plain((dL / L) * 1e15)}）` },
          { label: "走り出し（2秒で加速）に地面を西へけり返す力", value: `${jpBig(push)} N` },
          { label: "そもそも地面が東へ動いている速さ（この緯度）", value: humanSpeed(EARTH.omega * r) },
        ],
        ruler: {
          title: "1日の長さの変化をくらべる",
          value: dT,
          valueLabel: "全人類が東へ走る",
          fmt: "time",
          refs: [
            { label: "光が1m進む時間", value: 3.34e-9 },
            { label: "三峡ダムに水をためた影響（NASAの見積もり）", value: 6e-8 },
            { label: "2011年 東北地方太平洋沖地震（NASAの見積もり）", value: 1.8e-6 },
            { label: "月の潮の力で、1世紀に1日がのびる量", value: 1.8e-3 },
          ],
        },
      };
    },
    why: [
      "地面を西にけると、反作用で地球は西向きに押される。回転の勢い（角運動量）の合計は変わらないので、人が東向きにもらった分だけ地球の自転が遅くなる。",
      "ただし地球の回転の勢いは人類全員の約1000兆倍。1日がのびるのは、1秒の100億分の1ほど。",
      "走るのをやめると、人の勢いが地面に返されて元どおり。地球にとっては、ほとんど何も起きない。",
    ],
    formula: "ΔT = T × (N·m·v·R·cosφ) / (I·ω)",
    assumptions: [
      "地球は固い球として回り、人が受けた勢いはすべて地球に返る",
      "地球の慣性モーメント I = 8.03×10³⁷ kg·m²、自転の角速度 ω = 7.29×10⁻⁵ rad/s",
      "全員が同じ緯度にいるとして平均の緯度で計算（実際の人口の平均はおよそ北緯25〜30度）",
      "風や海など、地球の中の他の動きは考えない",
    ],
  },
  {
    id: "all-jump",
    title: "もし全人類が、同時にジャンプしたら",
    question: "80億人が同時にジャンプしたら、地球はどれくらい動く？",
    params: [
      { key: "people", label: "跳ぶ人数", unit: "億人", min: 1, max: 100, step: 1, value: 80 },
      { key: "mass", label: "1人の平均の体重", unit: "kg", min: 10, max: 120, step: 1, value: 50 },
      { key: "height", label: "跳ぶ高さ", unit: "cm", min: 5, max: 120, step: 1, value: 40 },
    ],
    compute(p) {
      const N = p.people * 1e8;
      const h = p.height / 100;
      const m = N * p.mass;
      const v = Math.sqrt(2 * EARTH.g * h);
      const shift = (m * h) / EARTH.M; // 重心は動かないので、地球が逆向きに動く距離
      const recoil = (m * v) / EARTH.M;
      const energy = m * EARTH.g * h;
      return {
        headline: "地球が反対向きに動く距離",
        big: humanLen(shift),
        sub: `陽子（原子の芯の粒）約${plain(shift / 1.7e-15, 2)}個分。原子1個よりずっと小さい。`,
        rows: [
          { label: "人の合計の重さ", value: `${jpBig(m)} kg（地球の${sci(m / EARTH.M)}倍）` },
          { label: "踏み切りの速さ", value: humanSpeed(v) },
          { label: "地球が押し返される速さ", value: `${sci(recoil)} m/s` },
          { label: "着地のエネルギーの合計", value: humanEnergy(energy) },
          { label: "同じエネルギーの地震（もし1か所に集まったら）", value: `マグニチュード 約${plain((Math.log10(energy) - 4.8) / 1.5, 2)}` },
        ],
        ruler: {
          title: "地球が動く距離をくらべる",
          value: shift,
          valueLabel: "全人類のジャンプ",
          fmt: "len",
          refs: [
            { label: "陽子の直径", value: 1.7e-15 },
            { label: "金の原子核の直径", value: 1.4e-14 },
            { label: "水素原子の直径", value: 1.06e-10 },
            { label: "髪の毛の太さ", value: 8e-5 },
          ],
        },
      };
    },
    why: [
      "人と地球を1つのまとまりと見ると、外から力がはたらかないので全体の重心は動かない。人が上がった分、地球はほんの少し下がる。",
      "地球は人類全員を合わせたより約15兆倍重いので、動く距離は原子核よりも小さい。",
      "着地のエネルギーは大きく見えるが、世界中にばらばらに伝わるので、1か所の地震のような大きな揺れにはならないと考えられる。",
    ],
    formula: "地球の動き d = (N·m·h) / M地球",
    assumptions: [
      "全員が同じ方向（地球の中心から外向き）に同時に跳ぶとして単純化（本当は世界中で向きがばらばらで、打ち消し合う）",
      "地震のエネルギーとマグニチュードの関係 log₁₀E = 1.5M + 4.8 を使った目安",
      "地球は固い1つの物体として扱う",
    ],
  },
  {
    id: "earth-stop",
    title: "もし地球の自転が、急に止まったら",
    question: "地面だけが急に止まったら、地面の上のものはどれくらいの速さで飛んでいく？",
    params: [
      {
        key: "lat",
        label: "いる場所の緯度",
        unit: "度",
        min: 0,
        max: 89,
        step: 0.5,
        value: 35.7,
        presets: [
          { label: "赤道 0", value: 0 },
          { label: "那覇 26.2", value: 26.2 },
          { label: "東京 35.7", value: 35.7 },
          { label: "札幌 43.1", value: 43.1 },
          { label: "ロンドン 51.5", value: 51.5 },
        ],
      },
      { key: "mass", label: "あなたの体重", unit: "kg", min: 10, max: 120, step: 1, value: 50 },
    ],
    compute(p) {
      const v = EARTH.omega * EARTH.R * Math.cos(deg(p.lat));
      const ke = 0.5 * p.mass * v * v;
      const h = (v * v) / (2 * EARTH.g);
      return {
        headline: "地面の上のものが、東へ飛び出す速さ",
        big: `時速 ${plain(v * 3.6)} km`,
        sub: `= 秒速 ${plain(v)} m。音の速さ（秒速340m）の${plain(v / 340, 2)}倍。`,
        rows: [
          { label: "あなたの運動エネルギー", value: humanEnergy(ke) },
          { label: "同じエネルギーになる落下の高さ", value: humanLen(h) },
          { label: "新幹線（時速320km）の何倍", value: `${plain((v * 3.6) / 320, 2)} 倍` },
          { label: "そのあとの1日（昼から次の昼まで）", value: "約1年（太陽のまわりを回るぶんだけ）" },
        ],
        ruler: {
          title: "速さをくらべる",
          value: v,
          valueLabel: "自転が止まったときに飛び出す速さ",
          fmt: "speed",
          refs: [
            { label: "新幹線（時速320km）", value: 88.9 },
            { label: "旅客機（時速900km）", value: 250 },
            { label: "音の速さ", value: 340 },
            { label: "ライフルの弾", value: 900 },
          ],
        },
      };
    },
    why: [
      "地面も空気も海も、地球といっしょに東へ動いている。ふだんは全部が同じ速さなので気づかない。",
      "地面だけが急に止まると、上にあるものは「慣性」で東へ動き続ける。赤道では時速約1670km、日本でも音速前後。",
      "緯度が高いほど地軸からの距離 R·cosφ が短いので、飛び出す速さは小さくなる。北極・南極ではほぼ0。",
    ],
    formula: "v = ω × R × cosφ",
    assumptions: [
      "地面だけが一瞬で止まり、人や空気は止まらないという思考実験",
      "地球の半径 R = 6371 km、自転の角速度 ω = 7.29×10⁻⁵ rad/s（1恒星日で1回転）",
      "空気も同じ速さで動き続けるので、実際には超音速の暴風になる（ここでは計算していない）",
    ],
  },
  {
    id: "tunnel",
    title: "もし地球の反対側まで穴をほって、飛びこんだら",
    question: "地球を貫くまっすぐな穴に飛びこむと、反対側まで何分かかる？",
    visual: "tunnel",
    params: [
      {
        key: "planet",
        label: "どの星にほる？",
        unit: "",
        min: 0,
        max: 2,
        step: 1,
        value: 0,
        presets: [
          { label: "地球", value: 0 },
          { label: "月", value: 1 },
          { label: "火星", value: 2 },
        ],
      },
      { key: "offset", label: "穴の通り道（中心からのずれ）", unit: "%", min: 0, max: 90, step: 1, value: 0 },
    ],
    compute(p) {
      const planets = [
        { name: "地球", R: 6.371e6, g: 9.81 },
        { name: "月", R: 1.737e6, g: 1.62 },
        { name: "火星", R: 3.39e6, g: 3.71 },
      ];
      const pl = planets[Math.round(p.planet)] ?? planets[0];
      const w = Math.sqrt(pl.g / pl.R);
      const half = Math.PI / w; // 反対側に着くまで
      const L = pl.R * Math.sqrt(1 - (p.offset / 100) ** 2); // 穴の長さの半分
      const vmax = w * L;
      return {
        headline: `${pl.name}の反対側に着くまで`,
        big: `${plain(half / 60, 3)} 分`,
        sub: "穴が中心を通らなくても、かかる時間は同じ。",
        rows: [
          { label: "穴の長さ", value: humanLen(2 * L) },
          { label: "いちばん速いとき（穴のまん中）", value: humanSpeed(vmax) },
          { label: "落ちて戻ってくるまで（1往復）", value: `${plain((2 * half) / 60, 3)} 分` },
          { label: "表面の重力", value: `${plain(pl.g)} m/s²` },
        ],
        ruler: {
          title: "かかる時間をくらべる",
          value: half,
          valueLabel: `${pl.name}を貫く穴`,
          fmt: "time",
          refs: [
            { label: "カップめんができるまで", value: 180 },
            { label: "学校の授業1コマ（50分）", value: 3000 },
            { label: "国際宇宙ステーションが地球を1周（約92分）", value: 5520 },
          ],
        },
      };
    },
    why: [
      "星の中では、自分より外側の部分の重力は打ち消し合い、内側の部分だけに引かれる。だから中心に近いほど重力は弱くなる。",
      "重力が「中心からの距離」に比例するので、ばねにつるしたおもりと同じ単振動になる。周期はばねの式と同じ形 T = 2π√(R/g)。",
      "この時間は星の密度だけで決まり、穴の通り道を中心からずらしても変わらない（不思議だけど本当）。",
    ],
    formula: "かかる時間 t = π √(R / g)",
    assumptions: [
      "星の中の密度が一様（どこでも同じ）とする。本当の地球は中心ほど重いので、約38分になるという計算もある",
      "空気抵抗・摩擦・自転・熱は考えない（真空の穴）",
      "穴が中心を通らない場合は、穴の壁はつるつるとする",
    ],
  },
  {
    id: "moon-closer",
    title: "もし月が、今よりずっと近かったら",
    question: "月までの距離が半分になったら、潮の満ち引きや月の見え方はどう変わる？",
    params: [
      {
        key: "k",
        label: "月までの距離（今を1とする）",
        unit: "倍",
        min: 0.1,
        max: 3,
        step: 0.05,
        value: 0.5,
        presets: [
          { label: "1/4", value: 0.25 },
          { label: "半分", value: 0.5 },
          { label: "今", value: 1 },
          { label: "2倍", value: 2 },
        ],
      },
    ],
    compute(p) {
      const k = p.k;
      const tide = 1 / k ** 3;
      const size = MOON_SIZE_DEG / k;
      const month = MOON_PERIOD_DAYS * k ** 1.5;
      return {
        headline: "潮の満ち引きを起こす力",
        big: `今の ${plain(tide, 3)} 倍`,
        sub: `距離 ${plain((MOON_DIST * k) / 1000)} km。潮の力は距離の3乗に反比例する。`,
        rows: [
          { label: "空での月の大きさ（見かけの直径）", value: `${plain(size, 2)}度（今の${plain(1 / k, 2)}倍）` },
          { label: "月が地球を1周する日数", value: `${plain(month, 3)} 日` },
          { label: "月が地球を引く力（重力）", value: `今の ${plain(1 / k ** 2, 3)} 倍` },
        ],
        ruler: {
          title: "潮の力をくらべる（今の月 = 1）",
          value: tide,
          valueLabel: "この距離の月",
          fmt: "ratio",
          refs: [
            { label: "太陽による潮の力", value: 0.46 },
            { label: "今の月", value: 1 },
            { label: "大潮（月と太陽が一直線）", value: 1.46 },
          ],
        },
      };
    },
    why: [
      "潮の満ち引きは、地球の手前側と奥側で月の引く力の強さがちがうことで起きる。その「差」は距離の3乗に反比例する。",
      "距離が半分なら、引く力は4倍だが、潮の力は8倍。海の満ち引きはずっと大きくなる。",
      "ケプラーの第3法則（周期の2乗は距離の3乗に比例）から、近い月は速く地球を回る。",
    ],
    formula: "潮の力 ∝ 1/d³ ・ 周期 T ∝ d^1.5",
    assumptions: [
      "月の重さ・地球の重さは今のまま、距離だけ変える",
      "実際の潮の高さは海岸の形や海の深さで大きく変わるので、ここでは力の比だけを出している",
      "距離 0.1 倍（約3.8万km）より近いと、月が地球の潮の力でこわれる距離（ロッシュ限界）に近づく",
    ],
  },
  {
    id: "gravity-x",
    title: "もし重力が○倍になったら",
    question: "重力が変わると、ジャンプ・落下・ふりこ・歩く速さはどう変わる？",
    params: [
      {
        key: "k",
        label: "重力（地球を1とする）",
        unit: "倍",
        min: 0.05,
        max: 10,
        step: 0.05,
        value: 0.38,
        log: true,
        presets: [
          { label: "月 0.17", value: 0.165 },
          { label: "火星 0.38", value: 0.38 },
          { label: "地球 1", value: 1 },
          { label: "木星 2.5", value: 2.53 },
          { label: "10倍", value: 10 },
        ],
      },
      { key: "mass", label: "あなたの体重（地球で）", unit: "kg", min: 10, max: 120, step: 1, value: 50 },
    ],
    compute(p) {
      const g = EARTH.g * p.k;
      const jump = 0.5 / p.k; // 地球で50cm跳べる人が、同じ踏み切りの速さで跳んだとき
      const fall = Math.sqrt((2 * 10) / g);
      const pend = 2 * Math.PI * Math.sqrt(1 / g);
      const walk = Math.sqrt(g * 0.9); // 脚の長さ0.9mの人の、歩きでいられる速さの上限の目安
      return {
        headline: "地球で50cm跳べる人のジャンプ",
        big: humanLen(jump),
        sub: `重力 ${plain(g)} m/s²。体重計の表示は ${plain(p.mass * p.k)} kg 相当。`,
        rows: [
          { label: "10mの高さから落ちるまで", value: `${plain(fall)} 秒（地球は1.43秒）` },
          { label: "長さ1mのふりこが1往復する時間", value: `${plain(pend)} 秒（地球は2.01秒）` },
          { label: "走り出さずに歩ける速さの上限", value: `時速 ${plain(walk * 3.6)} km（地球は約10.7km）` },
          { label: "時速100kmで投げたボールの最大の飛距離", value: humanLen((100 / 3.6) ** 2 / g) },
        ],
        ruler: {
          title: "ジャンプの高さをくらべる",
          value: jump,
          valueLabel: "この重力でのジャンプ",
          fmt: "len",
          refs: [
            { label: "地球でのジャンプ", value: 0.5 },
            { label: "バスケットゴールの高さ", value: 3.05 },
            { label: "2階建ての家", value: 7 },
          ],
        },
      };
    },
    why: [
      "重力が k 倍になると、物を引く力（重さ）も k 倍。同じ速さで踏み切ると、跳べる高さは 1/k 倍になる。",
      "落ちる時間やふりこの周期は √(1/g) に比例するので、重力が4倍なら半分の時間になる。",
      "歩くときは脚がふりこのように動くので、歩きでいられる速さの上限は √(g·脚の長さ) で決まる。月の宇宙飛行士が跳ねて進んだのはこのため。",
    ],
    formula: "跳べる高さ h = v²/(2g) ・ ふりこ T = 2π√(L/g)",
    assumptions: [
      "踏み切りの速さは重力が変わっても同じとする（本当は重いと筋肉が体を持ち上げにくくなる）",
      "空気抵抗は考えない",
      "歩く速さの上限はフルード数 v²/(gL) = 1 を使った目安",
    ],
  },
];

export function scenarioById(id: string) {
  return SCENARIOS.find((s) => s.id === id) ?? null;
}

export function defaults(s: Scenario): Record<string, number> {
  return Object.fromEntries(s.params.map((p) => [p.key, p.value]));
}
