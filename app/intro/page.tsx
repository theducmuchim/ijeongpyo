import type { Metadata, Viewport } from "next";
import Link from "next/link";
import s from "./intro.module.css";

// 이정표 소개 사이트.
// 앱과 같은 초록(#00664f)과 옅은 바탕 하나로 차분하게 짠다. 첫 화면은 동네를 내려다본 실제 사진:
// "위에서 보면 이렇게 복잡한 동네를, 이정표는 눈앞의 간판으로 안내한다"는 이야기로 시작한다.

const SITE = "https://ijeongpyo-one.vercel.app";
const TITLE = "이정표 — 길을 잘 잃는 사람을 위한 길안내 앱";
const DESC =
  "지도 대신 눈에 보이는 간판으로 안내하는 무료 길안내 앱. 익숙한 길에서도 방향을 잃는 사람, 발달성 지형적 방향감각 상실증(DTD)이 있는 사람을 위해 만들었어요.";

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

export const viewport: Viewport = { themeColor: "#00291e" };

/* ───────────── 작은 조각 ───────────── */

function Phone({ src, alt }: { src: string; alt: string }) {
  return (
    <div className={s.phone}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" width={390} height={844} />
    </div>
  );
}

type IconName = "camera" | "route" | "steps" | "lock";
function Icon({ name }: { name: IconName }) {
  const d: Record<IconName, React.ReactNode> = {
    camera: (
      <>
        <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
        <circle cx="12" cy="13" r="3.5" />
      </>
    ),
    route: (
      <>
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="6" r="2" />
        <path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6" />
      </>
    ),
    steps: (
      <>
        <path d="M4 18h4v-4h4v-4h4V6h4" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
  };
  return (
    <svg className={s.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d[name]}
    </svg>
  );
}

const STEPS = [
  {
    n: "01",
    title: "길을 만들어요",
    body: "자주 다니는 길은 보호자와 한 번 같이 걸으며 갈림길마다 사진을 찍어요. 처음 가는 길은 도착지만 고르면, 꺾는 곳마다 근처 1층 가게를 길잡이로 카드를 만들어 줘요.",
    img: "/intro/app-plan.png",
    alt: "처음 가는 길 카드 초안: 순서와 길잡이, 로드뷰 미리 보기",
  },
  {
    n: "02",
    title: "카드를 보며 걸어요",
    body: "갈림길이 가까워지면 진동과 음성으로 알려 주고, 사진과 문장 한 줄로 어느 쪽으로 갈지 보여 줘요. 직진하는 동안에는 조용히 있어요.",
    img: "/intro/app-walk.png",
    alt: "걷기 화면: 갈림길 사진과 안내 문장",
  },
  {
    n: "03",
    title: "길을 잃으면 한 장 찍어요",
    body: "주변을 찍으면 AI가 간판 글자를 읽어 지금 어디쯤인지 찾고, 할 일 하나만 알려 줘요. 확실하지 않으면 추측하지 않고 사진을 한 장 더 부탁해요.",
    img: "/intro/app-lost.png",
    alt: "길을 잃었을 때 화면: 주변 사진 찍기",
  },
];

const FEATURES: { icon: IconName; title: string; body: string; href: string; link: string }[] = [
  {
    icon: "route",
    title: "출발 전에 미리 보기",
    body: "처음 가는 길은 갈림길마다 로드뷰로 미리 둘러볼 수 있어요. 길잡이 가게 자리에 이름이 표시돼요.",
    href: "/plan",
    link: "도착지 골라 보기",
  },
  {
    icon: "camera",
    title: "간판이 바뀌어도 괜찮아요",
    body: "가게가 문을 닫으면 그 자리를 다시 찍어 새 길잡이로 바꿔요. 카드에는 건물 이름과 번지도 함께 적혀 있어요.",
    href: "/guide#fix",
    link: "자세히 보기",
  },
  {
    icon: "steps",
    title: "걸을수록 줄어드는 안내",
    body: "같은 길을 세 번 헤매지 않고 도착하면 안내를 한 단계 줄일지 물어봐요. 사진과 문장에서 문장만, 다시 갈림길 진동만으로 줄어요.",
    href: "/guide#practice",
    link: "연습 모드 보기",
  },
  {
    icon: "lock",
    title: "사진은 내 휴대폰에만",
    body: "길과 사진은 쓰는 사람 휴대폰에만 저장돼요. 보호자에게 위치를 보내는 기능도 직접 켜야만 나타나요.",
    href: "/guide#privacy",
    link: "개인정보 보기",
  },
];

const RESULTS = [
  { num: "94%", label: "위치 판단 정확도", body: "길을 잃은 상황의 사진 36장 중 34장에서 지금 위치를 맞혔어요." },
  { num: "6%", label: "확신 오답률", body: "AI가 확신하고도 틀린 경우는 36장 중 2장이었어요. 목표는 10% 미만이었어요." },
  { num: "83%", label: "길잡이 발견율", body: "갈림길 12곳 중 10곳에서, 앱이 고른 후보 가게 간판이 실제로 보였어요." },
];

const FAQ = [
  { q: "돈이 드나요?", a: "아니요. 비영리로 만들었고 광고도 없어요." },
  { q: "앱을 설치해야 하나요?", a: "아니요. 휴대폰 인터넷 브라우저로 열고 ‘홈 화면에 추가’를 누르면 앱처럼 쓸 수 있어요." },
  { q: "보호자는 무엇을 하나요?", a: "처음 한 번 같이 걸으며 길을 등록해요. 설정에서 켜 두면 ‘길을 잃었어요’ 화면에서 보호자에게 위치를 보낼 수 있어요." },
  { q: "어떤 휴대폰에서 되나요?", a: "인터넷 브라우저가 있는 휴대폰이면 돼요. 사진을 찍고 위치를 쓰려면 카메라와 위치 권한이 필요해요." },
  { q: "길을 건널 때도 알려 주나요?", a: "횡단보도가 어디 있는지는 알려 주지만, 건너도 되는지는 판단하지 않아요. 신호는 꼭 직접 확인하세요." },
];

/* ───────────── 화면 ───────────── */

export default function Intro() {
  return (
    <div className={s.site}>
      <header className={s.nav}>
        <div className={s.navInner}>
          <a href="#top" className={s.logo}>
            이정표
          </a>
          <nav className={s.navLinks} aria-label="소개 사이트 메뉴">
            <a href="#why">왜 필요한가요</a>
            <a href="#how">쓰는 법</a>
            <a href="#results">시험 결과</a>
            <a href="#faq">자주 묻는 질문</a>
          </nav>
          <Link href="/" className={s.navBtn}>
            앱 열기
          </Link>
        </div>
      </header>

      <main id="top">
        {/* 1. 첫 화면: 내려다본 동네 사진 */}
        <section className={s.hero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.heroImg} src="/intro/hero.jpg" alt="위에서 내려다본 다세대 주택가. 비슷한 지붕과 좁은 골목이 빽빽하다." />
          <div className={s.heroShade} aria-hidden="true" />
          <div className={s.heroInner}>
            <p className={s.eyebrow}>길을 잘 잃는 사람을 위한 길안내</p>
            <h1 className={s.title}>
              지도 대신,
              <br />
              눈에 보이는 간판으로
            </h1>
            <p className={s.lead}>
              위에서 내려다본 동네는 이렇게 비슷하고 복잡해요. 이정표는 지도를 맞춰 보게 하는 대신, &ldquo;대우당약국 앞 횡단보도를 건너세요&rdquo;처럼
              눈앞에 보이는 간판으로 길을 알려 줘요.
            </p>
            <div className={s.cta}>
              <Link href="/" className={s.btnWhite}>
                앱 열기
              </Link>
              <Link href="/demo" className={s.btnGhost}>
                2분 체험하기
              </Link>
            </div>
          </div>
        </section>

        {/* 2. 무엇이 다른가: 보통 내비 문장과 이정표 문장 */}
        <section className={s.section}>
          <div className={s.wrap}>
            <p className={s.kicker}>무엇이 다른가요</p>
            <h2 className={s.h2}>같은 갈림길, 다른 안내</h2>
            <div className={s.compare}>
              <div className={s.compareOld}>
                <p className={s.compareTag}>보통 내비게이션</p>
                <p className={s.compareLine}>200m 앞에서 우회전</p>
                <p className={s.compareLine}>북동쪽으로 120m 이동</p>
                <p className={s.compareNote}>지도와 내 방향을 맞출 수 있어야 쓸 수 있어요.</p>
              </div>
              <div className={s.compareNew}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/demo/demo-2.jpg" alt="대우당약국 건물이 보이는 갈림길" loading="lazy" />
                <div className={s.compareBody}>
                  <p className={s.compareTag}>이정표</p>
                  <p className={s.compareBig}>대우당약국 앞 횡단보도를 건너세요</p>
                  <p className={s.compareNote}>약국은 왼쪽에 보여요. 사진 속 간판만 찾으면 돼요.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. 왜 필요한가 */}
        <section id="why" className={`${s.section} ${s.tint}`}>
          <div className={s.wrap}>
            <p className={s.kicker}>왜 필요한가요</p>
            <h2 className={s.h2}>
              지도를 봐도
              <br />
              여기가 어딘지 모르겠다면
            </h2>
            <div className={s.facts}>
              <div>
                <p className={s.factNum}>1~3%</p>
                <p className={s.factLabel}>해외 연구로 본 DTD 비율</p>
                <p>
                  발달성 지형적 방향감각 상실증(DTD)은 뇌를 다친 적도 없는데 어릴 때부터 길만 유난히 찾지 못하는 상태예요. 간판과 건물은 잘
                  알아보지만, 그것들을 이어 머릿속 지도로 만들기 어려워요.
                </p>
              </div>
              <div>
                <p className={s.factNum}>6% · 87%</p>
                <p className={s.factLabel}>지나간 길을 다시 알아본 비율</p>
                <p>한 번 지나간 길을 다시 지날 때 알아본 사람이 DTD가 있는 쪽은 6%, 없는 쪽은 87%였어요(이탈리아, 각 54명 비교).</p>
              </div>
              <div>
                <p className={s.factNum}>2009년</p>
                <p className={s.factLabel}>처음 보고된 해</p>
                <p>캐나다 연구팀이 처음 보고한 비교적 새로운 이름이에요. 국내에서는 다룬 기사나 논문을 거의 찾을 수 없어, 스스로 &lsquo;길치&rsquo;라고만 여기는 사람이 많아요.</p>
              </div>
            </div>
            <Link href="/about" className={s.more}>
              DTD가 무엇인지 더 읽기 →
            </Link>
          </div>
        </section>

        {/* 4. 쓰는 법 */}
        <section id="how" className={s.section}>
          <div className={s.wrap}>
            <p className={s.kicker}>쓰는 법</p>
            <h2 className={s.h2}>갈림길마다 사진 카드 한 장</h2>
            <div className={s.steps}>
              {STEPS.map((st) => (
                <article key={st.n} className={s.step}>
                  <div className={s.stepShot}>
                    <Phone src={st.img} alt={st.alt} />
                  </div>
                  <p className={s.stepNum}>{st.n}</p>
                  <h3 className={s.h3}>{st.title}</h3>
                  <p className={s.body}>{st.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 5. 기능 */}
        <section className={`${s.section} ${s.tint}`}>
          <div className={s.wrap}>
            <p className={s.kicker}>그 밖에</p>
            <h2 className={s.h2}>혼자 걸을 때 필요한 것들</h2>
            <div className={s.features}>
              {FEATURES.map((f) => (
                <article key={f.title} className={s.feature}>
                  <Icon name={f.icon} />
                  <h3 className={s.h3}>{f.title}</h3>
                  <p className={s.body}>{f.body}</p>
                  <Link href={f.href} className={s.featureLink}>
                    {f.link} →
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 6. 시험 결과 */}
        <section id="results" className={s.results}>
          <div className={s.wrap}>
            <p className={s.kickerLight}>시험 결과</p>
            <h2 className={s.h2}>학교 주변에서 시험해 봤어요</h2>
            <div className={s.resultGrid}>
              {RESULTS.map((r) => (
                <div key={r.num} className={s.result}>
                  <p className={s.resultNum}>{r.num}</p>
                  <p className={s.resultLabel}>{r.label}</p>
                  <p className={s.resultBody}>{r.body}</p>
                </div>
              ))}
            </div>
            <p className={s.resultNote}>
              대전대신고 주변 갈림길을 카카오 로드뷰 사진으로 측정했어요. 걸으며 직접 찍은 사진은 더 선명해서 간판이 더 잘 보일 것으로 예상하고,
              실제 보행으로 다시 확인할 계획이에요.
            </p>
          </div>
        </section>

        {/* 7. 자주 묻는 질문 */}
        <section id="faq" className={s.section}>
          <div className={`${s.wrap} ${s.faqWrap}`}>
            <div>
              <p className={s.kicker}>자주 묻는 질문</p>
              <h2 className={s.h2}>궁금한 것들</h2>
            </div>
            <div className={s.faq}>
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 8. 마지막 */}
        <section className={`${s.section} ${s.endSection}`}>
          <div className={s.wrap}>
            <div className={s.end}>
              <h2 className={s.endTitle}>오늘 다니는 길 하나부터</h2>
              <p className={s.endBody}>설치 없이 휴대폰 브라우저에서 바로 열려요. 먼저 예시 길로 2분 동안 둘러봐도 좋아요.</p>
              <div className={s.cta}>
                <Link href="/" className={s.btnGreen}>
                  앱 열기
                </Link>
                <Link href="/demo" className={s.btnLine}>
                  체험하기
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={s.foot}>
        <div className={`${s.wrap} ${s.footInner}`}>
          <div>
            <p className={s.footLogo}>이정표</p>
            <p className={s.footSmall}>비영리 프로젝트 · STEMINUS</p>
            <p className={s.footSmall}>
              길잡이를 넣은 안내가 길을 더 오래 기억하게 했다는 연구(Wunderlich 외, 2022)를 바탕으로 만들었어요. 진단이나 치료를 하지 않아요.
            </p>
          </div>
          <nav className={s.footLinks} aria-label="바로 가기">
            <Link href="/">앱 열기</Link>
            <Link href="/demo">체험하기</Link>
            <Link href="/guide">사용 설명서</Link>
            <Link href="/about">DTD란</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
