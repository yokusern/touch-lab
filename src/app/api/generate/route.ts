// 「タイトルから AI が実験を組み立てる」窓口。
// - Google Gemini API の無料枠を使う。鍵は Vercel の環境変数 GEMINI_API_KEY にだけ置く（ブラウザには出さない）
// - 無料枠の上限に達すると Google がエラーを返すので、請求は発生しない（支払い方法を登録していないプロジェクトの鍵を使う前提）
// - 連打と使いすぎを防ぐため、同じ人は 15 秒に1回・1日 15 回まで（サーバーの記憶は目安。本当の上限は Google の無料枠）
import { recipeToScene, RECIPE_SCHEMA } from "@/lib/engine/recipe";

export const maxDuration = 60;

// GEMINI_ENDPOINT は手元の試験用（本番では設定しない）
const ENDPOINT = process.env.GEMINI_ENDPOINT || "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODELS = [process.env.GEMINI_MODEL || "gemini-3.8-flash", "gemini-3.5-flash-lite"];
const MAX_PROMPT = 120;
const PER_IP_INTERVAL_MS = 15_000;
const PER_IP_DAILY = 15;
const SITE_DAILY = 300;

const SYSTEM = `あなたは2D物理サンドボックス「自由実験室」の実験デザイナーです。
ユーザーが書いた「実験のタイトル（もしも〜）」を、この2Dの世界で再生して確かめられる実験の設計図（JSON）にしてください。

この世界のルール:
- 単位はメートル・キログラム・秒。x は右が＋、y は上が＋。ground=true なら地面の上面が y=0。
- 物体は「奥行き1mの板」として計算される2Dの剛体。形は circle（円）, box（箱）, ramp（直角三角形の坂）, plank（細長い板・床・壁）。
- 材質: wood=木(600kg/m³), metal=鉄(7800), rubber=ゴム(よくはねる), ice=氷(つるつる), stone=石, foam=発泡スチロール(とても軽い)。
- fixed=true は動かない物体（坂・台・壁・地面の代わり）。
- つなぎ目: pin=回る軸, motor=回り続ける軸, rod=長さが変わらない棒, rope=たるむひも, spring=ばね。
  pin/motor は (x1,y1) の1点で、そこに重なる物体 a と b をつなぐ（b が空なら空中に固定）。
  rod/rope/spring は a の点 (x1,y1) と b の点（または空中の点）(x2,y2) をつなぐ。長さは置いた時の距離。
- 世界の設定: gravity（重力）, airOn/airDensity（空気抵抗と空気の濃さ）, attraction（物体どうしの万有引力G。星の実験なら重力0にして1e-6程度、星は density が大きくなるよう mass を大きく）。
- 水・熱・電気・光・化学反応はこの世界にない。近い動きで表現するか、表現できない部分は note に正直に書く。
- 惑星や人類全体のような大きすぎるものは、縮尺した模型として表現し、その旨を note に書く。

作り方のコツ:
- 物体どうしが最初から重ならないように置く（地面の上に置く物体は y = 高さの半分 など）。
- 比べる実験なら、条件だけを変えた2つ以上を並べる（例: 重い玉と軽い玉）。
- 物体は 3〜40 個くらい。大きさは 0.1m〜10m くらいが見やすい。
- viewX, viewY, viewWidth は、全部の物体が画面に入るように決める。
- title は日本語で短く。note には「予想」と「▶再生したら見るところ」を日本語で書く。
- label は大事な物体だけに短い日本語でつける。`;

type Hit = { last: number; day: string; count: number };
const hits = new Map<string, Hit>();
let siteDay = "";
let siteCount = 0;

const today = () => new Date().toISOString().slice(0, 10);

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** 返ってきた JSON から、AI が書いた文章を取り出す（API の形が変わっても読めるように何通りか試す） */
function extractText(data: unknown): string {
  const d = data as Record<string, unknown>;
  if (typeof d?.output_text === "string") return d.output_text;
  const steps = Array.isArray(d?.steps) ? (d.steps as Record<string, unknown>[]) : [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (s?.type !== "model_output" || !Array.isArray(s.content)) continue;
    const text = (s.content as Record<string, unknown>[])
      .filter((c) => c?.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("");
    if (text) return text;
  }
  const outputs = Array.isArray(d?.outputs) ? (d.outputs as Record<string, unknown>[]) : [];
  const fromOutputs = outputs.map((o) => (typeof o?.text === "string" ? o.text : "")).join("");
  if (fromOutputs) return fromOutputs;
  const cand = (d?.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined)?.[0];
  return cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error("not json");
  }
}

export async function POST(request: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: "AI の機能はまだ準備中です（鍵が設定されていません）。" }, 503);

  // 他のサイトから勝手に使われないように、同じサイトからの呼び出しだけ受け付ける
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    let sameSite = false;
    try {
      sameSite = new URL(origin).host === host;
    } catch {
      sameSite = false;
    }
    if (!sameSite) return json({ error: "このサイトの中からだけ使えます。" }, 403);
  }

  let prompt = "";
  try {
    const body = await request.json();
    prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT) : "";
  } catch {
    /* 下で判定 */
  }
  if (prompt.length < 2) return json({ error: "どんな実験かを2文字以上で書いてください。" }, 400);

  const day = today();
  if (siteDay !== day) {
    siteDay = day;
    siteCount = 0;
    hits.clear();
  }
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const now = Date.now();
  const h = hits.get(ip);
  if (h && now - h.last < PER_IP_INTERVAL_MS)
    return json({ error: `少し待ってからもう一度（${Math.ceil((PER_IP_INTERVAL_MS - (now - h.last)) / 1000)}秒）。` }, 429);
  if (h && h.count >= PER_IP_DAILY) return json({ error: "今日はここまで。また明日つくってね。" }, 429);
  if (siteCount >= SITE_DAILY) return json({ error: "今日のAIの回数を使い切りました。また明日つくってね。" }, 429);
  hits.set(ip, { last: now, day, count: (h?.count ?? 0) + 1 });
  siteCount++;

  let lastStatus = 0;
  for (const model of MODELS) {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          model,
          system_instruction: SYSTEM,
          input: `実験のタイトル: ${prompt}`,
          response_format: { type: "text", mime_type: "application/json", schema: RECIPE_SCHEMA },
          generation_config: { thinking_level: "low", max_output_tokens: 8192 },
          store: false,
        }),
        signal: AbortSignal.timeout(50_000),
      });
    } catch {
      lastStatus = 504;
      continue;
    }
    lastStatus = res.status;
    if (!res.ok) {
      // 無料枠の上限（429）や、モデルが使えない（400/404）ときは次のモデルを試す
      if ([400, 404, 429, 500, 503].includes(res.status)) continue;
      break;
    }
    try {
      const text = extractText(await res.json());
      const { scene, skipped } = recipeToScene(parseJson(text), prompt);
      if (scene.bodies.every((b) => b.lb === "地面")) return json({ error: "AI がうまく組み立てられませんでした。言い方を変えて試してね。" }, 502);
      return json({ scene, skipped, model });
    } catch {
      return json({ error: "AI の答えを読み取れませんでした。もう一度試してね。" }, 502);
    }
  }
  if (lastStatus === 429) return json({ error: "今日のAIの無料枠を使い切りました。また明日つくってね。" }, 429);
  return json({ error: "AI に今つながりません。少し時間をおいて試してね。" }, 502);
}
