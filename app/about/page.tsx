import { AppBar } from "@/components/ui";

export default function AboutPage() {
  return (
    <main className="screen">
      <AppBar title="자주 길을 잃나요?" back="/" />
      <div className="body">
        <p className="body-large">
          오래 산 동네나 매일 다니는 길에서도 방향을 잃는 증상이 있어요. 발달성 지형적 방향감각 상실증(DTD)이라고 하고,
          연구에 따라 100명 중 2~3명꼴로 있다고 봐요.
        </p>
        <div className="surface-card">
          <p className="title-medium">지능이나 기억력과는 관계없어요</p>
          <p className="body-medium muted">
            건물과 간판은 잘 알아봐요. 그것들을 머릿속 지도로 잇는 게 어려워서, 외운 순서가 한 번 틀어지면 길을 다시 찾기
            힘들어요.
          </p>
        </div>
        <div className="surface-card">
          <p className="title-medium">이정표가 하는 일</p>
          <p className="body-medium muted">
            지도 대신 &ldquo;꽃집을 오른쪽에 두고 골목으로 들어가세요&rdquo;처럼 눈에 보이는 길잡이로 안내해요. 길을 잃으면 주변
            사진으로 지금 위치를 찾아요.
          </p>
        </div>
        <div className="surface-card tonal-card">
          <p className="title-medium">진단은 하지 않아요</p>
          <p className="body-medium">
            생활이 많이 불편하면 신경과나 신경심리 전문가와 상담해 보세요. 길찾기는 연습으로 나아질 수 있다는 연구도 있어요.
          </p>
        </div>
      </div>
    </main>
  );
}
