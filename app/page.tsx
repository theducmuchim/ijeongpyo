"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppBar, EmptySignpost, Icon, IconLink, SkeletonList } from "@/components/ui";
import { db } from "@/lib/db";
import type { Route } from "@/types";

function ago(iso?: string) {
  if (!iso) return "아직 안 걸음";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "오늘 걸음";
  if (days === 1) return "어제 걸음";
  if (days < 7) return `${days}일 전 걸음`;
  return "지난주 이전에 걸음";
}

export default function Home() {
  const [routes, setRoutes] = useState<Route[] | null>(null);

  useEffect(() => {
    db.routes.orderBy("createdAt").reverse().toArray().then(setRoutes);
  }, []);

  return (
    <main className="screen">
      <AppBar title="이정표" leadingIcon="walk" trailing={<IconLink href="/settings" icon="settings" label="설정" />} />
      <div className="body">
        {routes === null && <SkeletonList rows={2} />}
        {routes && routes.length > 0 && <p className="label-large muted">저장한 길 {routes.length}개</p>}

        {routes?.length === 0 && (
          <div className="empty">
            <EmptySignpost />
            <p className="title-large">저장한 길이 없어요</p>
            <p className="body-medium muted">
              자주 다니는 길을 보호자나 친구와 한 번 같이 걸으며 등록하세요. 갈림길마다 사진 한 장과 메모를 남기면 돼요.
            </p>
            <Link href="/demo" className="btn btn-tonal" style={{ marginTop: 12 }}>
              <Icon name="sparkle" size={20} /> 먼저 체험해 보기
            </Link>
          </div>
        )}

        <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {routes?.map((r) => (
          <Link
            key={r.id}
            className="list-row"
            href={r.status === "ready" ? `/walk/${r.id}` : `/review/${r.id}`}
          >
            <span className="avatar">
              <Icon name="walk" />
            </span>
            <span className="text">
              <p className="title-medium">{r.name}</p>
              <p className="body-medium muted">
                카드 {r.cards.length}장 · {r.status !== "ready" ? "카드 확인 전" : r.kind === "planned" && r.cards.some((c) => c.source === "draft" && !c.checkedAt) ? `처음 가는 길 · 사진 ${r.cards.filter((c) => c.source !== "draft" || c.checkedAt).length}/${r.cards.length}` : ago(r.lastWalkedAt)}
              </p>
            </span>
            <Icon name="forward" />
          </Link>
        ))}
        </div>

        <Link href="/plan" className="list-row" style={{ background: "var(--secondary-container)", color: "var(--on-secondary-container)" }}>
          <span className="avatar">
            <Icon name="flag" />
          </span>
          <span className="text">
            <p className="title-medium">처음 가는 길</p>
            <p className="body-medium">도착지만 고르면 카드 초안을 만들어요</p>
          </span>
          <Icon name="forward" />
        </Link>

        <div className="help-row">
          <Link href="/demo" className="pressable">
            <span className="avatar">
              <Icon name="sparkle" />
            </span>
            <span className="title-medium">체험해 보기</span>
            <span className="body-medium muted">예시 사진으로 2분</span>
          </Link>
          <Link href="/guide" className="pressable">
            <span className="avatar">
              <Icon name="flag" />
            </span>
            <span className="title-medium">사용 설명서</span>
            <span className="body-medium muted">기능별 쓰는 법</span>
          </Link>
        </div>

        <div className="surface-card tonal-card">
          <p className="title-medium">자주 길을 잃나요?</p>
          <p className="body-medium">
            익숙한 길에서도 자주 방향을 잃는 증상이 있어요. 발달성 지형적 방향감각 상실증(DTD)이라고 해요.
          </p>
          <Link href="/about" className="btn btn-text label-large" style={{ alignSelf: "flex-start" }}>
            자세히 보기
          </Link>
        </div>
        <div style={{ height: 96 }} />
      </div>
      <Link href="/record" className="fab">
        <Icon name="add" size={28} /> 새 길 등록
      </Link>
    </main>
  );
}
