"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppBar, Icon, IconLink } from "@/components/ui";
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
        <p className="label-large muted">
          {routes === null ? "불러오는 중…" : `저장한 길 ${routes.length}개`}
        </p>

        {routes?.length === 0 && (
          <div className="surface-card">
            <p className="title-medium">아직 저장한 길이 없어요</p>
            <p className="body-medium muted">
              자주 다니는 길을 가족이나 친구와 한 번 같이 걸으며 등록해 보세요. 갈림길마다 사진과 메모만 남기면 돼요.
            </p>
          </div>
        )}

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
                카드 {r.cards.length}장 · {r.status === "ready" ? ago(r.lastWalkedAt) : "카드 확인이 필요해요"}
              </p>
            </span>
            <Icon name="forward" />
          </Link>
        ))}

        <div className="surface-card tonal-card">
          <p className="title-medium">자주 길을 잃나요?</p>
          <p className="body-medium">
            익숙한 길에서도 자주 길을 잃는다면, 이름이 있는 증상일 수 있어요. 탓할 일이 아니에요.
          </p>
          <Link href="/about" className="btn btn-text label-large" style={{ alignSelf: "flex-start" }}>
            쉬운 설명 읽기
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
