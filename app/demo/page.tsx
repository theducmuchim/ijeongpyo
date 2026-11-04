"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AiWaiting, AppBar, Icon } from "@/components/ui";
import { requestCards } from "@/lib/api";
import { DEMO_CARDS, DEMO_FIX, DEMO_JUNCTIONS, DEMO_LOST, DEMO_PHOTO_CREDIT, DEMO_ROUTE_NAME, fetchDemoPhoto, saveDemoRoute } from "@/lib/demo";
import { blobToPayload } from "@/lib/image";
import { toast } from "@/lib/toast";
import type { CardDraft } from "@/types";

// 체험하기: 미리 그려 둔 사진으로 등록부터 도착까지 앱이 어떻게 움직이는지 단계별로 보여 준다.
// 위에는 설명, 아래에는 실제 화면과 같은 모양의 미리보기를 둔다.

const STEPS = [
  { key: "intro", label: "시작" },
  { key: "record", label: "길 등록" },
  { key: "ai", label: "카드 만들기" },
  { key: "review", label: "카드 확인" },
  { key: "walk", label: "혼자 걷기" },
  { key: "fix", label: "길잡이 바꾸기" },
  { key: "lost", label: "길을 잃었을 때" },
  { key: "arrive", label: "도착" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

const ACTION_LABEL = { straight: "곧장", left: "왼쪽으로", right: "오른쪽으로", arrive: "도착" } as const;

function Coach({ title, children, tips }: { title: string; children: React.ReactNode; tips?: string[] }) {
  return (
    <div className="coach">
      <p className="title-large">{title}</p>
      <div className="body-large">{children}</div>
      {tips && (
        <ul className="tips">
          {tips.map((t) => (
            <li key={t} className="body-medium">
              <Icon name="check" size={18} /> {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 실제 화면처럼 보이는 미리보기 틀
function Preview({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="demo-frame" aria-label={`${title} 화면 미리보기`}>
      <div className="demo-frame-bar">
        <span className="label-medium muted">화면 미리보기</span>
        <span className="label-large">{title}</span>
      </div>
      <div className="demo-frame-body">{children}</div>
    </div>
  );
}

function Img({ src, h = 200, scan = false, alt }: { src: string; h?: number; scan?: boolean; alt: string }) {
  return (
    <div className={`photo${scan ? " scanning" : ""}`} style={{ height: h }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} />
    </div>
  );
}

// ── 1. 등록: 사진과 메모가 하나씩 들어간다 ──
function RecordStep() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((v) => (v >= DEMO_JUNCTIONS.length ? v : v + 1)), 1300);
    return () => clearInterval(id);
  }, []);
  const current = DEMO_JUNCTIONS[Math.min(n, DEMO_JUNCTIONS.length - 1)];
  const done = n >= DEMO_JUNCTIONS.length;
  return (
    <>
      <Coach
        title="같이 걸으며 등록해요"
        tips={["간판이나 건물 이름이 보이게", "사람과 차는 피해서", "메모는 말로 남겨도 돼요"]}
      >
        보호자나 친구와 한 번 같이 걸어요. 갈림길에 서면 사진을 한 장 찍고, &ldquo;꽃집에서 왼쪽&rdquo;처럼 짧게 메모한 뒤
        &lsquo;여기서 꺾어요&rsquo;를 눌러요. 지금은 사진 4장이 저절로 들어가요.
      </Coach>
      <Preview title="새 길 등록">
        <div key={n} className="pop">
          <Img src={current.photo} h={190} alt={`${Math.min(n + 1, 4)}번째 갈림길 사진`} />
        </div>
        <div className="demo-field body-medium">
          <Icon name="mic" size={18} />
          <span>{current.note}</span>
          {!done && <span className="caret" aria-hidden="true" />}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {DEMO_JUNCTIONS.slice(0, n).map((j, i) => (
            <div key={j.photo} className="pop" style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={j.photo} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10, display: "block" }} />
              <span className="num-badge label-medium">{i + 1}</span>
            </div>
          ))}
        </div>
        <div className={`btn ${done ? "btn-outlined" : "btn-filled"}`} aria-hidden="true">
          {done ? "도착했어요" : "여기서 꺾어요"}
        </div>
      </Preview>
    </>
  );
}

// ── 2. AI가 카드를 만든다 ──
function AiStep({ cards, setCards, real, setReal }: { cards: CardDraft[]; setCards: (c: CardDraft[]) => void; real: boolean; setReal: (v: boolean) => void }) {
  const [phase, setPhase] = useState<"wait" | "done" | "real-wait">("wait");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (phase !== "wait") return;
    const id = setTimeout(() => setPhase("done"), 5200);
    return () => clearTimeout(id);
  }, [phase]);

  async function tryReal() {
    setErr(null);
    setPhase("real-wait");
    try {
      const junctions = await Promise.all(
        DEMO_JUNCTIONS.map(async (j) => ({ photo: await blobToPayload(await fetchDemoPhoto(j.photo)), note: j.note })),
      );
      const res = await requestCards(junctions);
      if (res.mock) throw new Error("지금은 진짜 AI를 쓸 수 없어요.");
      setCards(res.cards);
      setReal(true);
      toast("진짜 AI가 만든 카드로 바꿨어요");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPhase("done");
    }
  }

  return (
    <>
      <Coach title="AI가 안내 카드를 만들어요">
        &lsquo;도착했어요&rsquo;를 누르면 사진과 메모를 한 번에 구글 AI로 보내요. AI는 오래 남는 간판이나 건물을 길잡이로 고르고,
        사진마다 설명을 적어 둬요. 이 설명은 나중에 길을 잃었을 때 지금 사진과 비교하는 데 써요.
      </Coach>
      <Preview title="새 길 등록">
        {phase !== "done" ? (
          <AiWaiting
            key={phase}
            title={phase === "real-wait" ? "진짜 AI가 만드는 중" : "안내 카드 만드는 중"}
            hint="10~30초 걸려요. 화면을 끄지 마세요."
            photoUrl={DEMO_JUNCTIONS[3].photo}
            stepMs={1300}
            steps={["사진 4장 보내는 중", "간판과 건물 찾는 중", "길잡이 고르는 중", "안내 문장 쓰는 중"]}
          />
        ) : (
          <div className="result-card">
            <p className="label-large">
              <Icon name="check" size={16} /> 카드 {cards.length}장을 만들었어요
            </p>
            <p className="body-medium">{real ? "진짜 AI가 만든 카드예요." : "체험용으로 미리 만든 카드예요."}</p>
          </div>
        )}
      </Preview>
      {phase === "done" && !real && (
        <div className="surface-card">
          <p className="title-medium">진짜 AI로 해 보기</p>
          <p className="body-medium muted">같은 사진 4장을 실제로 AI에 보내 카드를 만들어요.</p>
          <button className="btn btn-outlined" style={{ marginTop: 8 }} onClick={tryReal}>
            <Icon name="sparkle" size={18} /> 진짜 AI로 만들어 보기
          </button>
          {err && <p className="body-medium error-text" style={{ marginTop: 8 }}>{err} 체험은 미리 만든 카드로 계속할 수 있어요.</p>}
        </div>
      )}
    </>
  );
}

// ── 3. 카드 확인 ──
function ReviewStep({ cards }: { cards: CardDraft[] }) {
  return (
    <>
      <Coach title="카드를 확인하고 고쳐요">
        AI가 쓴 문장을 같이 걸은 사람과 읽어 봐요. 어색하면 눌러서 고치고, 사진을 누르면 다시 찍을 수 있어요. 사진이 흐리거나
        길잡이가 가려지면 AI가 다시 찍으라고 알려 줘요.
      </Coach>
      <Preview title={`카드 확인 · ${cards.length}장`}>
        <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cards.map((c, i) => (
            <div key={c.order} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {c.warning && (
                <div className="surface-card warn-card" style={{ padding: 12 }}>
                  <p className="title-medium">{c.order}번 사진을 다시 찍어 주세요</p>
                  <p className="body-medium">{c.warning}</p>
                </div>
              )}
              <div className="list-row" style={{ padding: 10, alignItems: "flex-start", cursor: "default" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={DEMO_JUNCTIONS[i]?.photo} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, flex: "none" }} />
                <div className="text">
                  <p className="label-medium primary-text">
                    {c.order}번 · {ACTION_LABEL[c.action]} · 길잡이: {c.landmark.name}
                  </p>
                  <p className="body-large" style={{ whiteSpace: "normal" }}>{c.instruction}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Preview>
    </>
  );
}

// ── 4. 걷기: 다음 갈림길에 가까워지면 카드가 저절로 넘어간다 ──
function WalkStep({ cards }: { cards: CardDraft[] }) {
  const [s, setS] = useState({ i: 0, dist: 60 });
  const { i, dist } = s;
  const last = i >= cards.length - 1;
  useEffect(() => {
    if (last) return;
    const id = setInterval(() => {
      // 5m씩 가까워지다가 30m 안에 들어가면 다음 카드로 넘어간다 (실제 앱의 30m 규칙)
      setS((p) => (p.dist - 5 <= 30 ? { i: Math.min(p.i + 1, cards.length - 1), dist: 60 } : { ...p, dist: p.dist - 5 }));
    }, 450);
    return () => clearInterval(id);
  }, [last, cards.length]);
  const c = cards[i];
  return (
    <>
      <Coach title="카드를 보며 혼자 걸어요" tips={["30m 안에 들어가면 저절로 넘어가요", "넘어갈 때 진동하고 문장을 읽어 줘요", "걷는 동안 화면이 꺼지지 않아요"]}>
        카드 한 장이 갈림길 하나예요. 지도 대신 사진과 문장만 봐요. 건물 사이처럼 위치가 잘 안 잡히면 &lsquo;다음 카드&rsquo;를 직접
        눌러요.
      </Coach>
      <Preview title={DEMO_ROUTE_NAME}>
        <div className="progress">
          <span className="label-large muted">
            {i + 1} / {cards.length}
          </span>
          <div className="track" aria-hidden="true">
            <div className="fill" style={{ width: `${((i + 1) / cards.length) * 100}%` }} />
          </div>
        </div>
        <div key={i} className="card-in-next" style={{ display: "flex", flexDirection: "column", gap: 10, position: "relative" }}>
          {i > 0 && (
            <span className="buzz-chip label-medium" aria-hidden="true">
              진동 · 음성 안내
            </span>
          )}
          <Img src={DEMO_JUNCTIONS[i]?.photo} h={190} alt={`${i + 1}번 카드 사진`} />
          <p className="guide" style={{ fontSize: "calc(24px * var(--scale))" }}>{c.instruction}</p>
        </div>
        <div className="gps-pill label-large" aria-live="off">
          <Icon name="walk" size={18} />
          {last ? "마지막 카드예요" : `다음 갈림길까지 ${dist}m`}
          {!last && <span className="gps-track"><span style={{ width: `${((60 - dist) / 30) * 100}%` }} /></span>}
        </div>
      </Preview>
    </>
  );
}

// ── 5. 길잡이가 바뀌었을 때 ──
function FixStep({ cards }: { cards: CardDraft[] }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShow(true), 2600);
    return () => clearTimeout(id);
  }, []);
  const r = DEMO_FIX.result;
  return (
    <>
      <Coach title="길잡이가 바뀌었을 때">
        가게가 바뀌어 길잡이가 안 보이면 걷기 화면의 &lsquo;길잡이가 안 보여요&rsquo;를 누르고 그 자리를 다시 찍어요. AI가 새 길잡이를
        고르고, 전과 후를 보고 확인해야 바뀌어요. 꺾는 방향은 그대로예요.
      </Coach>
      <Preview title="1번 길잡이 바꾸기">
        {!show ? (
          <AiWaiting title="새 길잡이 고르는 중" hint="5~15초 걸려요" photoUrl={DEMO_FIX.photo} stepMs={900} steps={["사진 보내는 중", "간판과 건물 찾는 중", "안내 문장 쓰는 중"]} />
        ) : (
          <>
            <div className="result-card" style={{ padding: 14 }}>
              <p className="label-large">
                <Icon name="sparkle" size={16} /> 바뀐 점
              </p>
              <p className="body-large">{r.changeNote}</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <p className="label-medium muted">전</p>
                <div style={{ opacity: 0.6 }}>
                  <Img src={DEMO_JUNCTIONS[0].photo} h={110} alt="원래 사진" />
                </div>
                <p className="body-medium muted" style={{ textDecoration: "line-through" }}>{cards[0]?.landmark.name}</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <p className="label-medium primary-text">후</p>
                <Img src={DEMO_FIX.photo} h={110} alt="새로 찍은 사진" />
                <p className="title-medium">{r.landmark.name}</p>
              </div>
            </div>
            <p className="body-large">{r.instruction}</p>
          </>
        )}
      </Preview>
    </>
  );
}

// ── 6. 길을 잃었을 때 ──
function LostStep() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShow(true), 3400);
    return () => clearTimeout(id);
  }, []);
  const r = DEMO_LOST.result;
  return (
    <>
      <Coach title="길을 잃었을 때" tips={["확실하지 않으면 다른 방향을 더 찍어 달라고 해요", "세 번 찍어도 모르면 마지막으로 지나간 곳 사진을 보여 줘요", "설정에서 켜 두면 보호자에게 위치를 보낼 수 있어요"]}>
        &lsquo;길을 잃었어요&rsquo;를 누르고 간판이나 출구 번호가 보이게 찍어요. AI가 등록할 때 적어 둔 카드 설명과 비교해서 어느
        카드 근처인지, 다음에 뭘 하면 되는지 알려 줘요.
      </Coach>
      <Preview title="길 찾기">
        {!show ? (
          <AiWaiting title="위치 찾는 중" hint="5~15초 걸려요" photoUrl={DEMO_LOST.photo} stepMs={850} steps={["사진 보내는 중", "간판과 출구 번호 찾는 중", "카드와 비교하는 중", "다음 할 일 정하는 중"]} />
        ) : (
          <>
            <div className="list-row" style={{ background: "transparent", padding: 0, cursor: "default" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={DEMO_LOST.photo} alt="방금 찍은 사진" style={{ width: 110, height: 82, objectFit: "cover", borderRadius: 14, flex: "none" }} />
              <div className="text">
                <p className="label-medium muted">사진에서 찾은 것</p>
                <p className="body-large">{r.seenLandmarks.join(", ")}</p>
              </div>
            </div>
            <div className="result-card">
              <p className="label-large">다음에 할 일</p>
              <p className="guide" style={{ fontSize: "calc(24px * var(--scale))" }}>{r.nextStep}</p>
              <p className="body-medium">{r.reasonForUser}</p>
            </div>
            <div className="btn btn-filled" aria-hidden="true">
              {r.matchedCardOrder}번 카드부터 다시 걷기
            </div>
          </>
        )}
      </Preview>
    </>
  );
}

export default function DemoPage() {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>("intro");
  const [cards, setCards] = useState<CardDraft[]>(DEMO_CARDS);
  const [real, setReal] = useState(false);
  const [saving, setSaving] = useState(false);
  const idx = STEPS.findIndex((s) => s.key === step);
  const go = (d: number) => {
    const next = STEPS[Math.min(STEPS.length - 1, Math.max(0, idx + d))].key;
    setStep(next);
    window.scrollTo({ top: 0 });
  };

  async function saveAndWalk() {
    setSaving(true);
    try {
      const id = await saveDemoRoute(cards);
      router.push(`/walk/${id}`);
    } catch (e) {
      toast((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <main className="screen">
      <AppBar title="체험하기" back="/" />
      <div className="body" style={{ paddingBottom: 120 }}>
        <div className="step-head">
          <span className="label-large primary-text">
            {idx + 1} / {STEPS.length} · {STEPS[idx].label}
          </span>
          <div className="step-dots" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s.key} className={i < idx ? "done" : i === idx ? "now" : ""} />
            ))}
          </div>
        </div>

        <div key={step} className="screen-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {step === "intro" && (
            <>
              <Coach title="2분 만에 둘러보기">
                실제 거리 사진 4장으로 길을 등록하고, 혼자 걷고, 길을 잃었을 때까지 차례로 보여 줘요. AI 대신 미리 써 둔 답을
                보여 주니 AI를 부르지 않아요.
              </Coach>
              <div className="demo-grid">
                {DEMO_JUNCTIONS.map((j, i) => (
                  <div key={j.photo} style={{ position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={j.photo} alt={`체험용 ${i + 1}번째 갈림길`} />
                    <span className="num-badge label-medium">{i + 1}</span>
                  </div>
                ))}
              </div>
              <p className="body-medium muted">{DEMO_PHOTO_CREDIT}. 카드와 AI 답은 미리 써 둔 예시예요.</p>
            </>
          )}
          {step === "record" && <RecordStep />}
          {step === "ai" && <AiStep cards={cards} setCards={setCards} real={real} setReal={setReal} />}
          {step === "review" && <ReviewStep cards={cards} />}
          {step === "walk" && <WalkStep cards={cards} />}
          {step === "fix" && <FixStep cards={cards} />}
          {step === "lost" && <LostStep />}
          {step === "arrive" && (
            <>
              <div className="arrive" style={{ padding: "8px 0", flex: "none" }}>
                <svg className="check-circle" width="96" height="96" viewBox="0 0 120 120" aria-hidden="true">
                  <circle cx="60" cy="60" r="56" />
                  <path d="M38 62 L54 77 L84 45" />
                </svg>
                <p className="headline-small">체험이 끝났어요</p>
                <p className="body-large muted">마지막 카드에서 &lsquo;도착했어요&rsquo;를 누르면 걸린 시간을 보여 주고, 돌아오는 길도 등록하자고 알려 줘요.</p>
              </div>
              <div className="surface-card">
                <p className="title-medium">실제 화면으로 걸어 보기</p>
                <p className="body-medium muted">체험용 길을 저장하면 진짜 걷기 화면에서 카드를 넘기고, 길잡이 바꾸기와 길을 잃었어요를 직접 눌러 볼 수 있어요. 홈에서 지울 수 있어요.</p>
              </div>
              <button className="btn btn-filled btn-large" onClick={saveAndWalk} disabled={saving}>
                <Icon name="walk" size={26} /> {saving ? "저장하는 중…" : "체험용 길 걸어 보기"}
              </button>
              <Link href="/guide" className="btn btn-tonal">
                사용 설명서 보기
              </Link>
              <Link href="/" className="btn btn-text label-large center">
                홈으로
              </Link>
            </>
          )}
        </div>
      </div>

      {step !== "arrive" && (
        <nav className="demo-nav" aria-label="체험 단계 이동">
          <button className="btn btn-outlined" onClick={() => go(-1)} disabled={idx === 0}>
            이전
          </button>
          <button className="btn btn-filled" onClick={() => go(1)}>
            {step === "intro" ? "시작하기" : "다음"} <Icon name="forward" size={20} />
          </button>
        </nav>
      )}
    </main>
  );
}
