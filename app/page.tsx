"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CornerBlob, HeroArt, LineIcon, TabBar, TONES } from "@/components/brand";
import { VoiceControl, useScreenSpeech } from "@/components/Voice";
import { db } from "@/lib/db";
import { josa } from "@/lib/josa";
import { type Command, PLAN_QUERY_KEY, destFrom, speak, squash } from "@/lib/voice";
import { routeSubtitle as subtitle } from "@/lib/routeText";
import type { Route } from "@/types";

const HOME_COMMANDS: Command[] = [
  { id: "/routes", label: "내 길 찾기", say: ["내 길", "길 찾기", "길 목록", "지우기", "삭제"] },
  { id: "/record", label: "새 길 등록", say: ["새 길", "길 등록", "등록"] },
  { id: "/plan", label: "처음 가는 길", say: ["처음 가는 길", "처음 가는"] },
  { id: "/settings", label: "설정", say: ["설정"] },
  { id: "/guide", label: "설명서", say: ["설명서", "도움말", "쓰는 법"] },
  { id: "/demo", label: "체험하기", say: ["체험"] },
  { id: "/intro", label: "소개 사이트", say: ["소개"] },
];

// 홈: Figma "Schedule Management Platform (2019)"의 Homescreen 구성을 따른다.
// 초록 머리 그림 → 흰 시트 → "내 길" 가로 카드 → "길 만들기" 큰 카드 → 아래 탭.

export default function Home() {
  const router = useRouter();
  const [routes, setRoutes] = useState<Route[] | null>(null);

  useEffect(() => {
    db.routes.orderBy("createdAt").reverse().toArray().then(setRoutes);
  }, []);

  useScreenSpeech(
    routes === null
      ? null
      : routes.length
        ? `저장한 길이 ${routes.length}개 있어요. 걸을 길을 고르거나, 마이크를 누르고 길 이름이나 가려는 곳을 말해 주세요.`
        : "아직 저장한 길이 없어요. '새 길 등록'이나 '처음 가는 길'에서 길을 만들어요.",
  );

  // 말한 내용이 저장한 길 이름이면 그 길을 걷고, 아니면 처음 가는 길에서 도착지로 찾는다
  function onOther(text: string) {
    const t = squash(text);
    const hit = routes?.find((r) => {
      const n = squash(r.name);
      const d = squash(r.destName ?? "");
      return (n.length >= 2 && (t.includes(n) || n.includes(t))) || (d.length >= 2 && t.includes(d));
    });
    if (hit) {
      speak(`${josa(hit.name, "을/를")} 걸어요.`);
      return router.push(hit.status === "ready" ? `/walk/${hit.id}` : `/review/${hit.id}`);
    }
    const dest = destFrom(text);
    if (dest.length < 2) return speak("알아듣지 못했어요. 저장한 길 이름이나 가려는 곳을 말해 주세요.", { force: true });
    try {
      sessionStorage.setItem(PLAN_QUERY_KEY, dest);
    } catch {}
    router.push("/plan");
  }

  return (
    <main className="screen home">
      <header className="hero">
        <div className="hero-top">
          <Link href="/about" className="glass-btn" aria-label="이정표가 하는 일">
            <LineIcon name="help" />
          </Link>
          <div className="hero-title">
            <p className="hero-name">이정표</p>
            <p className="hero-sub">눈에 보이는 길잡이로 걷는 길안내</p>
          </div>
        </div>
        <HeroArt />
      </header>

      <div className="sheet">
        <section className="sheet-sec" style={{ paddingBottom: 0 }}>
          <VoiceControl
            commands={HOME_COMMANDS}
            onCommand={(path) => router.push(path)}
            onOther={onOther}
            label="말로 길 고르기"
            examples="'등굣길', '서대전역 가는 길', '새 길 등록'"
          />
        </section>
        <section className="sheet-sec">
          <div className="sec-head">
            <h2 className="sec-title">내 길</h2>
            {routes && routes.length > 0 && (
              <Link href="/routes" className="btn btn-text label-large sec-more">
                찾기·지우기 <LineIcon name="chevron" size={18} />
              </Link>
            )}
          </div>
          <p className="sec-sub">{routes === null ? "불러오는 중…" : routes.length > 0 ? `저장한 길 ${routes.length}개` : "아직 저장한 길이 없어요"}</p>

          {routes === null && (
            <div className="tile-row">
              <div className="tile skeleton" />
              <div className="tile skeleton" />
            </div>
          )}

          {routes && routes.length > 0 && (
            <div className="tile-row stagger">
              {routes.map((r, i) => {
                const tone = TONES[i % TONES.length];
                return (
                  <Link
                    key={r.id}
                    href={r.status === "ready" ? `/walk/${r.id}` : `/review/${r.id}`}
                    className="tile pressable"
                    style={{ background: tone.bg }}
                  >
                    <CornerBlob color={tone.blob} />
                    <span className="tile-top">
                      <LineIcon name={r.kind === "planned" ? "route" : "walk"} />
                      <span className="tile-count">카드 {r.cards.length}장</span>
                    </span>
                    <span className="tile-name">{r.name}</span>
                    <span className="tile-meta">{subtitle(r)}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {routes?.length === 0 && (
            <Link href="/demo" className="empty-tile pressable">
              <LineIcon name="sparkle" />
              <span>
                <b>먼저 체험하기</b>
                <small>예시 사진으로 2분이면 돼요</small>
              </span>
            </Link>
          )}
        </section>

        <section className="sheet-sec">
          <h2 className="sec-title">길 만들기</h2>
          <p className="sec-sub">자주 가는 길은 같이 걸으며, 처음 가는 길은 도착지만 골라요</p>

          <Link href="/record" className="big-card pressable" style={{ background: "var(--mint)" }}>
            <CornerBlob color="var(--forest)" className="big" />
            <span className="big-title">새 길 등록</span>
            <span className="big-desc">보호자와 한 번 같이 걸으며 갈림길마다 사진을 찍어요</span>
            <span className="big-meta">
              <LineIcon name="pin" size={16} /> 갈림길 사진 + 메모
            </span>
            <span className="big-meta">
              <LineIcon name="cards" size={16} /> AI가 안내 카드로 정리
            </span>
          </Link>

          <Link href="/plan" className="big-card pressable" style={{ background: "var(--violet)" }}>
            <CornerBlob color="var(--navy)" className="big" />
            <span className="big-title">처음 가는 길</span>
            <span className="big-desc">도착지만 고르면 꺾는 곳마다 가게를 길잡이로 카드 초안을 만들어요</span>
            <span className="big-meta">
              <LineIcon name="route" size={16} /> 출발지는 지금 위치
            </span>
          </Link>
        </section>

        <section className="sheet-sec">
          <h2 className="sec-title">도움말</h2>
          <div className="help-row">
            <Link href="/demo" className="pressable">
              <span className="avatar" style={{ background: "var(--secondary-container)", color: "var(--orange)" }}>
                <LineIcon name="sparkle" />
              </span>
              <span className="title-medium">체험하기</span>
              <span className="body-medium muted">예시 사진으로 2분</span>
            </Link>
            <Link href="/guide" className="pressable">
              <span className="avatar" style={{ background: "var(--primary-container)", color: "var(--primary)" }}>
                <LineIcon name="book" />
              </span>
              <span className="title-medium">사용 설명서</span>
              <span className="body-medium muted">기능별 쓰는 법</span>
            </Link>
          </div>
          <Link href="/about" className="info-row pressable">
            <span>
              <b>자주 길을 잃나요?</b>
              <small>익숙한 길에서도 방향을 잃는 발달성 지형적 방향감각 상실증(DTD)</small>
            </span>
            <LineIcon name="chevron" />
          </Link>
          <Link href="/intro" className="info-row pressable" style={{ marginTop: 8 }}>
            <span>
              <b>이정표 소개 사이트</b>
              <small>다른 사람에게 이정표를 알려 줄 때 보여 주세요</small>
            </span>
            <LineIcon name="chevron" />
          </Link>
        </section>
      </div>
      <TabBar />
    </main>
  );
}
