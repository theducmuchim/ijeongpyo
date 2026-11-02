import type { Metadata, Viewport } from "next";
import Link from "next/link";
import s from "./intro.module.css";

// 이정표 소개 사이트.
// 디자인: Figma Community "Vibrant Designer Portfolio" 시안의 짜임(큰 초록 제목, 별 스티커, 모양 메뉴,
// 하늘색 픽셀 그림 띠, 사진 콜라주, 파란 막대 버튼, 초록 줄무늬 띠, 크림색 바탕)을 따랐다.
// 문구: 눈에 띄는 요약 제목, 짧은 문장, 문구마다 이어지는 버튼, 사람들이 찾는 낱말(길치, 방향감각, DTD).

const SITE = "https://ijeongpyo-one.vercel.app";
const TITLE = "이정표 — 길을 잘 잃는 사람을 위한 길안내 앱";
const DESC =
  "지도 대신 눈에 보이는 간판으로 안내하는 무료 길안내 앱. 익숙한 길에서도 방향을 잃는 사람, 길치, 발달성 지형적 방향감각 상실증(DTD)이 있는 사람을 위해 만들었어요.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: ["이정표", "길안내 앱", "길치", "방향감각", "길을 잘 잃는", "발달성 지형적 방향감각 상실증", "DTD", "랜드마크 길안내", "길찾기"],
  alternates: { canonical: `${SITE}/intro` },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `${SITE}/intro`,
    siteName: "이정표",
    locale: "ko_KR",
    type: "website",
    images: [{ url: `${SITE}/intro/og.png`, width: 1200, height: 630, alt: "이정표 — 지도 대신 간판으로 안내해요" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: [`${SITE}/intro/og.png`] },
};

export const viewport: Viewport = { themeColor: "#ffffff" };

/* ───────────── 그림 조각 ───────────── */

// 시안의 노란 별 스티커
function Star({ className }: { className?: string }) {
  const pts: string[] = [];
  for (let i = 0; i < 24; i++) {
    const r = i % 2 === 0 ? 50 : 34;
    const a = (Math.PI * 2 * i) / 24 - Math.PI / 2;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <polygon points={pts.join(" ")} fill="#FEBD1B" />
    </svg>
  );
}

// 시안의 하늘색 띠에 있는 파란 픽셀 그림을, 이정표와 발자국으로 바꿔 그린 것
const SIGN = [
  "..........XX..........",
  "..........XX..........",
  "....XXXXXXXXXXXXXX....",
  "....XXXXXXXXXXXXXXX...",
  "....XXXXXXXXXXXXXXXX..",
  "....XXXXXXXXXXXXXXX...",
  "....XXXXXXXXXXXXXX....",
  "..........XX..........",
  "..........XX..........",
  "....XXXXXXXXXXXXXX....",
  "...XXXXXXXXXXXXXXX....",
  "..XXXXXXXXXXXXXXXX....",
  "...XXXXXXXXXXXXXXX....",
  "....XXXXXXXXXXXXXX....",
  "..........XX..........",
  "..........XX..........",
  "..........XX..........",
  "..........XX..........",
  "......XXXXXXXXXX......",
];
const STEPS = ["XX......", "XX......", "........", "......XX", "......XX", "........"];

function Pixels({ rows, size, className }: { rows: string[]; size: number; className?: string }) {
  const w = rows[0].length;
  const h = rows.length;
  const rects: React.ReactNode[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === "X") rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
    }),
  );
  return (
    <svg className={className} width={w * size} height={h * size} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden="true">
      <g fill="#1943CD">{rects}</g>
    </svg>
  );
}

function Phone({ src, alt }: { src: string; alt: string }) {
  return (
    <div className={s.phone}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" width={390} height={844} />
    </div>
  );
}

const LANDMARKS = ["약국 초록 간판", "편의점", "지하철 3번 출구", "빵집 주황 차양", "학교 정문", "버스 정류장 이름", "은행", "꽃집", "횡단보도", "큰 나무"];

/* ───────────── 화면 ───────────── */

export default function Intro() {
  return (
    <div className={s.site}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&family=Noto+Sans+KR:wght@400;500;700;900&display=swap"
        precedence="default"
      />

      <header className={s.nav}>
        <a href="#top" className={s.logo}>
          이정표
        </a>
        <nav className={s.shapes} aria-label="소개 사이트 메뉴">
          <a href="#how" className={`${s.shape} ${s.pill}`}>
            쓰는 법
          </a>
          <a href="#first" className={`${s.shape} ${s.square}`}>
            처음 가는 길
          </a>
          <Link href="/" className={`${s.shape} ${s.circle}`}>
            앱 열기
          </Link>
        </nav>
      </header>

      <main id="top">
        {/* 1. 첫 화면: 한눈에 무엇인지 */}
        <section className={s.hero}>
          <p className={s.eyebrow}>길을 잘 잃는 사람을 위한 길안내</p>
          <h1 className={s.title}>
            지도 대신
            <br />
            간판을 봐요
            <Star className={s.star} />
          </h1>
          <div className={s.heroSide}>
            <p>
              이정표는 &ldquo;온누리약국에서 왼쪽&rdquo;처럼 눈에 보이는 길잡이로 안내하는 무료 앱이에요. 매일 다니는 길에서도 방향을 잃는
              사람을 위해 만들었어요.
            </p>
            <div className={s.heroCta}>
              <Link href="/" className={s.btnGreen}>
                앱 열기
              </Link>
              <Link href="/demo" className={s.btnLine}>
                2분 체험하기
              </Link>
            </div>
          </div>
        </section>

        <div className={s.band} aria-hidden="true">
          <Pixels rows={SIGN} size={10} className={s.pxSign} />
          <div className={s.pxSteps}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Pixels key={i} rows={STEPS} size={7} />
            ))}
          </div>
          <Pixels rows={SIGN} size={6} className={s.pxSignSmall} />
        </div>

        {/* 2. 왜 필요한가 */}
        <section className={s.why}>
          <h2 className={s.h2}>
            지도를 봐도
            <br />
            여기가 어딘지 모르겠다면
          </h2>
          <div className={s.whyGrid}>
            <div>
              <b>지도는 위에서 본 그림이에요</b>
              <p>내 눈앞 풍경과 지도를 맞춰 보는 일이 유난히 어려운 사람이 있어요.</p>
            </div>
            <div>
              <b>익숙한 길에서도 길을 잃어요</b>
              <p>
                발달성 지형적 방향감각 상실증(DTD)이라고 해요. 다친 적도 없는데 머릿속에 길 지도가 잘 안 그려져요. 2009년 캐나다 연구팀이
                처음 보고했어요.
              </p>
            </div>
            <div>
              <b>내비만 따라가면 길이 안 남아요</b>
              <p>GPS를 많이 쓰는 사람일수록 혼자 걸을 때 공간 기억이 나빴다는 연구가 있어요(Dahmani &amp; Bohbot, 2020).</p>
            </div>
          </div>
          <Link href="/about" className={s.textLink}>
            DTD가 무엇인지 더 보기 →
          </Link>
        </section>

        {/* 3. 쓰는 법: 시안의 작업물 콜라주 자리 */}
        <section id="how" className={s.how}>
          <h2 className={s.h2}>갈림길마다 사진 카드 한 장</h2>
          <div className={s.collage}>
            <article className={`${s.tile} ${s.tYellow}`}>
              <Phone src="/intro/app-home.png" alt="이정표 홈 화면: 저장한 길과 새 길 등록" />
              <div className={s.cap}>
                <span>01</span>
                <b>같이 한 번 걸으며 등록</b>
                <p>보호자나 친구와 걸으면서 갈림길마다 사진을 찍고 메모를 남겨요. AI가 안내 카드로 정리해요.</p>
              </div>
            </article>
            <article className={`${s.tile} ${s.tBrown}`}>
              <Phone src="/intro/app-walk.png" alt="걷기 화면: 꽃집 사진과 안내 문장" />
              <div className={s.cap}>
                <span>02</span>
                <b>카드를 넘기며 걷기</b>
                <p>사진과 문장으로 다음 갈림길을 알려 줘요. 가까워지면 카드가 저절로 넘어가요.</p>
              </div>
            </article>
            <article className={`${s.tile} ${s.tBlue}`}>
              <Phone src="/intro/app-lost.png" alt="길을 잃었을 때 화면: 주변 사진 찍기" />
              <div className={s.cap}>
                <span>03</span>
                <b>길을 잃으면 사진 한 장</b>
                <p>주변을 찍으면 어느 카드 근처인지 찾아서 지금 할 일 하나만 알려 줘요.</p>
              </div>
            </article>
          </div>
          <Link href="/" className={s.bar}>
            앱 열어 보기 <span aria-hidden="true">→</span>
          </Link>
        </section>

        {/* 4. 길잡이가 되는 것들 (시안의 Inspo loop 자리) */}
        <section className={s.loop} aria-label="길잡이가 되는 것들">
          <h2 className={s.loopTitle}>이런 게 길잡이가 돼요</h2>
          <div className={s.marquee}>
            <div className={s.track}>
              {[...LANDMARKS, ...LANDMARKS].map((t, i) => (
                <span key={i} className={s.chip} data-tone={i % 4}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className={s.streets}>
            {[1, 2, 3, 4].map((n) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={n} src={`/demo/demo-${n}.jpg`} alt="" loading="lazy" />
            ))}
          </div>
        </section>

        {/* 5. 처음 가는 길과 나머지 기능 */}
        <section id="first" className={s.features}>
          <h2 className={s.h2}>처음 가는 길도, 길을 잃었을 때도</h2>
          <div className={s.featGrid}>
            <article className={`${s.feat} ${s.fBlue}`}>
              <h3>처음 가는 길</h3>
              <p>
                도착지만 고르면 꺾는 곳마다 근처 가게를 길잡이로 카드 초안을 만들어요. 출발 전에 로드뷰로 그 자리를 미리 둘러볼 수 있어요.
              </p>
              <Link href="/plan">도착지 골라 보기 →</Link>
            </article>
            <article className={`${s.feat} ${s.fRed}`}>
              <h3>길을 잃었을 때</h3>
              <p>사진과 GPS로 지금 위치를 찾아요. 그래도 모르겠으면 지나가는 사람에게 보여 줄 큰 글씨 화면이 있어요.</p>
              <Link href="/guide#lost">자세히 보기 →</Link>
            </article>
            <article className={`${s.feat} ${s.fYellow}`}>
              <h3>걸을수록 줄어드는 안내</h3>
              <p>같은 길을 세 번 잘 도착하면 안내를 한 단계 줄일지 물어요. 사진과 문장, 문장만, 꺾는 곳에서만 진동 순서예요.</p>
              <Link href="/guide#practice">연습 모드 보기 →</Link>
            </article>
            <article className={`${s.feat} ${s.fBrown}`}>
              <h3>사진은 휴대폰에만</h3>
              <p>길과 사진은 쓰는 사람 휴대폰에만 저장돼요. AI에 보낼 때는 사진 속 위치 정보를 지워요.</p>
              <Link href="/guide#privacy">개인정보 보기 →</Link>
            </article>
          </div>
          <div className={s.phones}>
            <Phone src="/intro/app-plan.png" alt="처음 가는 길 카드 초안: 순서와 길잡이, 로드뷰 미리 보기" />
            <Phone src="/intro/app-ask.png" alt="도움 요청 화면: 큰 글씨로 방향을 묻는 문장" />
          </div>
          <p className={s.note}>
            길잡이를 넣은 안내를 들은 사람이 길을 더 잘, 3주 뒤에도 기억했다는 연구(Wunderlich 외, 2022)를 바탕으로 설계했어요. 이정표는
            진단이나 치료를 하지 않아요.
          </p>
        </section>

        {/* 6. 초록 줄무늬 띠: 체험으로 이어지기 */}
        <section className={s.stripes}>
          <Link href="/demo" className={s.stripePill}>
            예시 사진으로 2분 체험
          </Link>
        </section>

        {/* 7. 자주 묻는 질문 (시안의 찢긴 종이 자리) */}
        <section className={s.paper}>
          <h2 className={s.h2}>자주 묻는 질문</h2>
          <div className={s.faq}>
            <details>
              <summary>돈이 드나요?</summary>
              <p>아니요. 비영리로 만들었고 광고도 없어요.</p>
            </details>
            <details>
              <summary>앱을 설치해야 하나요?</summary>
              <p>아니요. 휴대폰 인터넷 브라우저로 열고 &lsquo;홈 화면에 추가&rsquo;를 누르면 앱처럼 쓸 수 있어요.</p>
            </details>
            <details>
              <summary>보호자는 무엇을 하나요?</summary>
              <p>처음 한 번 같이 걸으며 길을 등록해요. 설정에서 켜 두면 &lsquo;길을 잃었어요&rsquo; 화면에서 보호자에게 위치를 보낼 수 있어요.</p>
            </details>
            <details>
              <summary>어떤 휴대폰에서 되나요?</summary>
              <p>인터넷 브라우저가 있는 휴대폰이면 돼요. 사진을 찍고 위치를 쓰려면 카메라와 위치 권한이 필요해요.</p>
            </details>
            <details>
              <summary>길을 건널 때도 알려 주나요?</summary>
              <p>횡단보도가 어디 있는지는 알려 주지만, 건너도 되는지는 판단하지 않아요. 신호는 꼭 직접 확인하세요.</p>
            </details>
          </div>
        </section>

        {/* 8. 마지막 행동 */}
        <section className={s.end}>
          <h2 className={s.endTitle}>
            오늘 다니는 길
            <br />
            하나부터
          </h2>
          <div className={s.heroCta}>
            <Link href="/record" className={s.btnGreen}>
              새 길 등록하기
            </Link>
            <Link href="/guide" className={s.btnLine}>
              사용 설명서
            </Link>
          </div>
        </section>
      </main>

      <footer className={s.foot}>
        <div className={s.footShapes} aria-hidden="true">
          <i className={s.pill} />
          <i className={s.square} />
          <i className={s.circle} />
        </div>
        <p>이정표 · 비영리 프로젝트</p>
        <p className={s.footSmall}>진단이나 치료를 하지 않아요. 길을 건널 때는 신호를 직접 확인하세요.</p>
        <nav className={s.footLinks} aria-label="바로 가기">
          <Link href="/">앱 열기</Link>
          <Link href="/demo">체험하기</Link>
          <Link href="/guide">사용 설명서</Link>
          <Link href="/about">DTD란</Link>
        </nav>
      </footer>
    </div>
  );
}
