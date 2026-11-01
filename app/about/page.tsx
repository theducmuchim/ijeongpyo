import { AppBar } from "@/components/ui";

export default function AboutPage() {
  return (
    <main className="screen">
      <AppBar title="자주 길을 잃나요?" back="/" />
      <div className="body">
        <p className="body-large">
          10년 넘게 산 동네에서도, 매일 다니는 길에서도 방향을 잃는 사람들이 있어요. 해외에서는 이것을 &lsquo;발달성 지형적
          방향감각 상실증(DTD)&rsquo;이라고 불러요. 연구에 따라 100명 중 2~3명꼴로 있다고 봐요.
        </p>
        <div className="surface-card">
          <p className="title-medium">머리가 나쁘거나 덜렁대서가 아니에요</p>
          <p className="body-medium muted">
            지능이나 기억력은 보통 사람과 같아요. 건물이나 간판도 잘 알아봐요. 다만 그것들을 하나의 &lsquo;머릿속 지도&rsquo;로
            엮는 게 잘 안 돼서, 외운 순서가 한 번 어긋나면 돌아갈 길을 떠올리기 어려워요.
          </p>
        </div>
        <div className="surface-card">
          <p className="title-medium">이정표는 이렇게 도와요</p>
          <p className="body-medium muted">
            지도를 보여 주지 않고, &ldquo;꽃집을 오른쪽에 두고 골목으로 들어가세요&rdquo;처럼 눈에 보이는 길잡이로 안내해요. 길을
            잃으면 사진 한 장으로 어디쯤인지 같이 찾아요.
          </p>
        </div>
        <div className="surface-card tonal-card">
          <p className="title-medium">알아 두면 좋은 점</p>
          <p className="body-medium">
            이 앱은 진단을 하지 않아요. 생활이 많이 불편하다면 신경과나 신경심리 전문가와 이야기해 보세요. 길찾기 능력은 연습으로
            나아질 수 있다는 연구도 있어요.
          </p>
        </div>
      </div>
    </main>
  );
}
