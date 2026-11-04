import { askAI, aiTrace, friendlyError } from "@/lib/ai";
import type { ImagePayload } from "@/types";

// 검증 실험용 (HEALTH_TOKEN이 있어야 쓴다). 앱 화면과는 관계없다.
// 로드뷰 거리 사진에서 간판 글자를 읽어, 주어진 상호 목록 가운데 실제로 보이는 것과 목록에 없는 간판을 돌려준다.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const JUDGE = `너는 거리 사진 판독기다. 사진들은 같은 자리에서 여러 방향으로 찍은 실제 거리 사진(로드뷰)이다.
1. 아래 상호 목록 가운데, 사진 속 간판에 그 상호 글자가 실제로 읽히는 것만 visible에 적는다.
   - 간판 글자가 같거나 거의 같을 때만 보인다고 한다. 지점 이름(예: "대전도마점", "복수점")은 간판에 없어도 된다.
   - 업종만 같은 다른 가게, 글자를 읽을 수 없는 간판, 추측은 적지 않는다.
2. 사진에 또렷이 읽히는 1층 가게 간판 가운데 목록에 없는 상호를 other에 적는다(최대 10개). 현수막·광고판·차량 글자는 빼다.
3. 목록 가운데 그 가게 자리가 사진에 보이는데 다른 간판이 붙어 있어 없어진 것으로 보이는 것이 있으면 gone에 적는다. 확실할 때만.
상호는 목록에 적힌 글자 그대로 쓴다. JSON만 출력한다: {"visible":[],"other":[],"gone":[]}`;

export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!process.env.HEALTH_TOKEN || url.searchParams.get("token") !== process.env.HEALTH_TOKEN) return Response.json({ error: "no" }, { status: 403 });
  const body = (await req.json()) as { photos: ImagePayload[]; names: string[] };
  aiTrace.length = 0;
  try {
    const raw = await askAI(JUDGE, body.photos.slice(0, 6), `상호 목록:\n${body.names.map((n) => `- ${n}`).join("\n")}`);
    const m = raw.match(/\{[\s\S]*\}/);
    const j = m ? (JSON.parse(m[0]) as { visible?: string[]; other?: string[]; gone?: string[] }) : null;
    return Response.json({ ok: !!j, visible: j?.visible ?? [], other: j?.other ?? [], gone: j?.gone ?? [], raw: j ? undefined : raw.slice(0, 300), trace: [...aiTrace] });
  } catch (e) {
    return Response.json({ ok: false, error: friendlyError(e).message, trace: [...aiTrace] });
  }
}
