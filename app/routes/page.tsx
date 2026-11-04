"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LineIcon, TabBar } from "@/components/brand";
import { AppBar, Icon, useConfirm } from "@/components/ui";
import { DictateButton, VoiceControl, useScreenSpeech } from "@/components/Voice";
import { db, deleteRoutes, restoreRoutes } from "@/lib/db";
import { josa } from "@/lib/josa";
import { routeSubtitle } from "@/lib/routeText";
import { searchRoutes } from "@/lib/routeSearch";
import { toast } from "@/lib/toast";
import { type Command, speak } from "@/lib/voice";
import type { Route } from "@/types";

// 내 길 전체: 찾기, 고르기, 지우기. 지운 뒤 잠깐 동안은 '되돌리기'로 사진까지 그대로 살린다.

type Sort = "made" | "walked" | "name";
const SORTS: { value: Sort; label: string }[] = [
  { value: "made", label: "만든 순" },
  { value: "walked", label: "걸은 순" },
  { value: "name", label: "이름순" },
];

const hrefOf = (r: Route) => (r.status === "ready" ? `/walk/${r.id}` : `/review/${r.id}`);

export default function RoutesPage() {
  const router = useRouter();
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("made");
  const [picked, setPicked] = useState<Set<string> | null>(null); // null이면 고르기 모드가 아님
  const [dialog, ask] = useConfirm();

  const load = () => db.routes.toArray().then(setRoutes);
  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(() => {
    const list = [...(routes ?? [])];
    if (sort === "made") list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (sort === "walked") list.sort((a, b) => (b.lastWalkedAt ?? "").localeCompare(a.lastWalkedAt ?? "") || b.createdAt.localeCompare(a.createdAt));
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return list;
  }, [routes, sort]);
  const hits = useMemo(() => searchRoutes(sorted, q), [sorted, q]);

  useScreenSpeech(routes === null ? null : routes.length ? `저장한 길이 ${routes.length}개 있어요. 찾을 길 이름이나 길잡이를 말해 주세요.` : "아직 저장한 길이 없어요.");

  async function remove(ids: string[]) {
    const names = (routes ?? []).filter((r) => ids.includes(r.id));
    if (!names.length) return;
    const one = names.length === 1 ? names[0] : null;
    const cards = names.reduce((n, r) => n + r.cards.length, 0);
    const ok = await ask({
      title: one ? `${josa(one.name, "을/를")} 지울까요?` : `길 ${names.length}개를 지울까요?`,
      body: `카드 ${cards}장과 사진이 이 휴대폰에서 지워져요. 잘못 지웠다면 바로 뜨는 '되돌리기'를 눌러 주세요.`,
      ok: "지우기",
      danger: true,
    });
    if (!ok) return;
    const snaps = await deleteRoutes(ids);
    setPicked(null);
    await load();
    const msg = one ? `${josa(one.name, "을/를")} 지웠어요` : `길 ${snaps.length}개를 지웠어요`;
    speak(msg);
    toast(msg, {
      label: "되돌리기",
      onClick: async () => {
        await restoreRoutes(snaps);
        await load();
        toast(one ? `${josa(one.name, "을/를")} 되살렸어요` : `길 ${snaps.length}개를 되살렸어요`);
      },
    });
  }

  function togglePick(id: string) {
    setPicked((s) => {
      const next = new Set(s ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 말로: 길 이름을 말하면 그 길을 찾고, 하나만 나오면 바로 걷는다
  const commands: Command[] = [
    { id: "all", label: "모두 보기", say: ["모두", "전부", "다 보여"] },
    { id: "home", label: "홈으로", say: ["홈으로", "처음 화면"] },
  ];
  function onSaid(text: string) {
    setQ(text);
    const found = searchRoutes(sorted, text);
    if (found.length === 1) {
      speak(`${josa(found[0].route.name, "을/를")} 걸어요.`);
      router.push(hrefOf(found[0].route));
    } else speak(found.length ? `${found.length}개를 찾았어요. 걸을 길을 눌러 주세요.` : "찾는 길이 없어요. 다른 이름으로 말해 주세요.");
  }

  const selecting = picked !== null;
  const total = routes?.length ?? 0;

  return (
    <main className="screen with-tabs">
      <AppBar
        title="내 길"
        back="/"
        trailing={
          total > 0 ? (
            <button className="btn btn-text label-large" onClick={() => setPicked(selecting ? null : new Set())}>
              {selecting ? "고르기 끝" : "고르기"}
            </button>
          ) : undefined
        }
      />
      <div className="body" style={{ gap: 12, paddingBottom: selecting ? 150 : undefined }}>
        <form
          className="search-box"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          <Icon name="search" />
          <input
            className="body-large"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="길 이름, 도착지, 길잡이로 찾기"
            aria-label="내 길 찾기"
            enterKeyHint="search"
          />
          {q && (
            <button type="button" className="icon-btn" aria-label="찾는 말 지우기" onClick={() => setQ("")}>
              <Icon name="close" size={20} />
            </button>
          )}
          <DictateButton label="말로 찾기" onText={onSaid} />
        </form>

        <div className="seg" role="group" aria-label="줄 세우기">
          {SORTS.map((t) => (
            <button key={t.value} aria-pressed={sort === t.value} onClick={() => setSort(t.value)}>
              {sort === t.value && <Icon name="check" size={18} />} {t.label}
            </button>
          ))}
        </div>

        <p className="label-large muted" aria-live="polite">
          {routes === null ? "불러오는 중…" : !total ? "아직 저장한 길이 없어요" : q.trim() ? `${total}개 중 ${hits.length}개` : `저장한 길 ${total}개`}
          {selecting && ` · ${picked.size}개 골랐어요`}
        </p>

        {selecting && hits.length > 0 && (
          <button
            className="btn btn-text label-large"
            style={{ alignSelf: "flex-start", padding: 0, minHeight: 32 }}
            onClick={() => setPicked(picked.size === hits.length ? new Set() : new Set(hits.map((h) => h.route.id)))}
          >
            {picked.size === hits.length ? "모두 풀기" : q.trim() ? "찾은 길 모두 고르기" : "모두 고르기"}
          </button>
        )}

        <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {hits.map(({ route: r, why }) => {
            const on = picked?.has(r.id);
            const body = (
              <>
                <span className="avatar" aria-hidden>
                  {selecting ? <span className={`pick${on ? " on" : ""}`}>{on && <Icon name="check" size={18} />}</span> : <LineIcon name={r.kind === "planned" ? "route" : "walk"} />}
                </span>
                <span className="text">
                  <p className="title-medium">{r.name}</p>
                  <p className="body-medium muted">
                    {r.kind === "planned" ? "처음 가는 길" : "같이 걸은 길"} · 카드 {r.cards.length}장 · {routeSubtitle(r)}
                  </p>
                  {why && <p className="label-medium primary-text">{why}</p>}
                </span>
              </>
            );
            return (
              <div key={r.id} className="route-row">
                {selecting ? (
                  <button className="list-row" style={{ textAlign: "left", border: "none", width: "100%" }} aria-pressed={on} onClick={() => togglePick(r.id)}>
                    {body}
                  </button>
                ) : (
                  <>
                    <Link href={hrefOf(r)} className="list-row">
                      {body}
                      <Icon name="forward" />
                    </Link>
                    <button className="icon-btn" aria-label={`${r.name} 지우기`} onClick={() => remove([r.id])}>
                      <Icon name="trash" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {routes !== null && total > 0 && hits.length === 0 && (
          <div className="surface-card" style={{ gap: 8 }}>
            <p className="body-large">&lsquo;{q.trim()}&rsquo;{josa(q.trim(), "으로/로").slice(q.trim().length)} 찾은 길이 없어요.</p>
            <p className="body-medium muted">길 이름 말고 길잡이 가게나 도착지 이름으로도 찾을 수 있어요.</p>
            <button className="btn btn-tonal" style={{ alignSelf: "flex-start" }} onClick={() => setQ("")}>
              모두 보기
            </button>
          </div>
        )}

        {routes !== null && total === 0 && (
          <Link href="/demo" className="empty-tile pressable">
            <LineIcon name="sparkle" />
            <span>
              <b>먼저 체험하기</b>
              <small>예시 길로 2분이면 다 볼 수 있어요</small>
            </span>
          </Link>
        )}

        {!selecting && total > 0 && (
          <VoiceControl
            commands={commands}
            onCommand={(id) => (id === "all" ? setQ("") : router.push("/"))}
            onOther={onSaid}
            label="말로 길 찾기"
            examples="'대전역', '약국', '모두 보기'"
          />
        )}
      </div>

      {selecting && (
        <nav className="demo-nav">
          <button className="btn btn-outlined" onClick={() => setPicked(null)}>
            고르기 끝
          </button>
          <button className="btn btn-danger-fill" disabled={!picked.size} onClick={() => remove([...picked])}>
            <Icon name="trash" size={20} /> {picked.size ? `${picked.size}개 지우기` : "지울 길 고르기"}
          </button>
        </nav>
      )}
      {dialog}
      {!selecting && <TabBar />}
    </main>
  );
}
