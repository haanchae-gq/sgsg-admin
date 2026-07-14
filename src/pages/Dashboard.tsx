import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Skeleton } from '@sgsg/design/components';
import { api, type ExitStats } from '../api';
import { statusLabel } from '../status';

const won = (n: number) => `${Math.round(n ?? 0).toLocaleString('ko-KR')}원`;

/**
 * 이탈 — 왜 나갔나.
 *
 * ★ 이 카드가 없으면 아무도 사유 코드를 정성껏 고르지 않는다. 자기가 고른 것이 어디에도
 * 안 보이면 그건 그냥 폼 하나가 늘어난 것이다. **세는 화면이 있어야 고르는 일이 일이 된다.**
 *
 * '기타' 비율을 함께 보여 준다. 그 숫자가 크면 분류표가 현실을 못 담고 있다는 뜻이지
 * 운영자가 게으른 것이 아니다 — 우리가 고칠 신호다.
 */
function ExitCard({ e }: { e: ExitStats }) {
  if (e.total === 0) return null;
  const otherPct = Math.round((e['other-ratio'] ?? 0) * 100);
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>최근 30일 이탈 {e.total}건</h2>
        {otherPct >= 20 && (
          <span style={{ fontSize: 12, color: 'var(--color-status-warning)' }}>
            기타 {otherPct}% — 분류표가 현실을 못 담고 있어요
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--color-contents-contents-sub)' }}>
            왜 나갔나
          </div>
          {e['by-reason'].slice(0, 6).map((r) => (
            <div key={`${r.party}-${r.code}-${r.kind}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '3px 0' }}>
              <span>{r.label}</span>
              <span style={{ fontWeight: 700 }}>{r.count}</span>
            </div>
          ))}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--color-contents-contents-sub)' }}>
            {/* 회고의 질문: "어느 지역에서 왜 취소가 많은가" */}
            어느 지역에서
          </div>
          {e['by-region'].slice(0, 6).map((r) => (
            <div key={r.region} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '3px 0', gap: 12 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.region} <span style={{ color: 'var(--color-contents-contents-sub)', fontSize: 12 }}>{r.top}</span>
              </span>
              <span style={{ fontWeight: 700 }}>{r.count}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

type Summary = {
  queues: Record<string, number>;
  stats: Record<string, number>;
  stuck: {
    'oldest-unassigned': { id: string; 'order-number': string; days: number; 'customer-name': string }[];
    'oldest-awaiting': { id: string; 'order-id': string; hours: number }[];
  };
  recent: any[];
};

/**
 * 대시보드가 답해야 하는 질문은 하나다: **지금 나를 기다리는 것이 무엇인가.**
 *
 * 예전 화면은 "총 주문 1,204건"을 보여 줬다. 운영자가 그 숫자로 할 수 있는 일이 없다.
 * 여기서는 손을 대야 움직이는 것만 줄로 세우고, 각 줄이 곧 그 화면으로 가는 버튼이다.
 * **0 이면 줄 자체가 사라진다** — 할 일이 없는데 '0건'을 보여 주는 것은 소음이다.
 */
const QUEUES: { key: string; label: string; to: string; urgent?: boolean }[] = [
  { key: 'to-check', label: '검수 대기', to: '/orders?status=new' },
  { key: 'to-assign', label: '배정 대기', to: '/orders?status=checked', urgent: true },
  { key: 'awaiting-expert', label: '전문가 응답 없음', to: '/assignments', urgent: true },
  // 결제를 마쳤는데 우리가 읽지 못한 주문. 그 반대편에 사람이 기다린다.
  { key: 'intake-failed', label: '읽지 못한 주문', to: '/wisa', urgent: true },
  { key: 'pending-experts', label: '전문가 승인 대기', to: '/experts?status=pending' },
  { key: 'settlements-to-approve', label: '정산 승인 대기', to: '/settlements' },
];

export default function Dashboard() {
  const nav = useNavigate();
  const [d, setD] = useState<Summary | null>(null);
  const [exit, setExit] = useState<ExitStats | null>(null);
  // 좌표 없는 주문. **에러가 안 나서 아무도 모른다** — 그 주문은 거리 점수에서도
  // 동선 제안에서도 조용히 빠진다.
  const [geo, setGeo] = useState<{ orders: number; experts: number } | null>(null);
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.dashboard().then(setD).catch(() => setError('불러오지 못했어요.'));
    // 이탈 집계가 없어도 대시보드는 떠야 한다 — 곁다리가 본체를 막지 않는다.
    api.exitStats(30).then(setExit).catch(() => {});
    api.geocodeStatus().then(setGeo).catch(() => {});
  }, []);

  if (error) return <Alert type="danger" title={error} />;
  if (!d) return <Skeleton height="160px" />;

  const todo = QUEUES.filter((q) => (d.queues[q.key] ?? 0) > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>오늘</h1>

      {todo.length === 0 ? (
        <Alert type="success" title="밀린 일이 없어요." description="새 주문이 들어오면 여기 뜹니다." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {todo.map((q) => (
            <Card key={q.key} onClick={() => nav(q.to)} style={{ cursor: 'pointer' }}>
              <div style={{ color: 'var(--color-contents-contents-sub)', fontSize: 14 }}>{q.label}</div>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 800,
                  marginTop: 4,
                  color: q.urgent
                    ? 'var(--color-individuals-danger)'
                    : 'var(--color-contents-contents)',
                }}
              >
                {d.queues[q.key]}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* **얼마나 오래 멈춰 있나.**
          건수만 보면 오늘 들어온 3건과 2주째 방치된 3건이 같아 보인다. 운영 회고가
          지목한 것은 건수가 아니라 시간이었다 — 접수 후 연락까지 5~7일, 심하면 2~4주,
          그리고 그게 취소와 클레임이 됐다. */}
      {(d.stuck?.['oldest-unassigned']?.length > 0 ||
        d.stuck?.['oldest-awaiting']?.length > 0) && (
        <Card>
          <div style={{ marginBottom: 12 }}>
            <b>오래 멈춰 있는 것</b>
            <div style={{ color: 'var(--color-contents-contents-sub)', fontSize: 13, marginTop: 2 }}>
              기다리는 시간이 곧 취소와 클레임이 됩니다.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.stuck['oldest-unassigned'].map((o) => {
              // 회고가 기록한 실제 임계값. 5일을 넘기면 취소로 이어지기 시작했다.
              const urgent = o.days >= 5;
              return (
                <div
                  key={o.id}
                  onClick={() => nav(`/orders/${o.id}`)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: 'var(--rd-12)',
                    background: 'var(--color-background-elevation-2)',
                    cursor: 'pointer',
                  }}
                >
                  <span>
                    {o['order-number']}
                    <span style={{ marginLeft: 8, color: 'var(--color-contents-contents-sub)', fontSize: 13 }}>
                      {o['customer-name'] ?? '-'} · 아직 배정 안 됨
                    </span>
                  </span>
                  <b
                    style={{
                      color: urgent
                        ? 'var(--color-individuals-danger)'
                        : 'var(--color-contents-contents-sub)',
                    }}
                  >
                    {o.days}일째
                  </b>
                </div>
              );
            })}

            {d.stuck['oldest-awaiting'].map((a) => (
              <div
                key={a.id}
                onClick={() => nav(`/orders/${a['order-id']}`)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderRadius: 'var(--rd-12)',
                  background: 'var(--color-background-elevation-2)',
                  cursor: 'pointer',
                }}
              >
                <span style={{ color: 'var(--color-contents-contents-sub)' }}>
                  전문가 응답 없음
                </span>
                <b
                  style={{
                    color:
                      a.hours >= 24
                        ? 'var(--color-individuals-danger)'
                        : 'var(--color-contents-contents-sub)',
                  }}
                >
                  {a.hours}시간째
                </b>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 배경 숫자. 할 일이 아니므로 작게, 아래에 둔다. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {[
          ['오늘 들어온 주문', String(d.stats['orders-today'] ?? 0)],
          ['진행 중', String(d.stats['orders-active'] ?? 0)],
          ['활동 중인 전문가', String(d.stats['experts-active'] ?? 0)],
          ['이번 달 결제', won(d.stats['revenue-month'] ?? 0)],
        ].map(([label, value]) => (
          <Card key={label} flat>
            <div style={{ color: 'var(--color-contents-contents-sub)', fontSize: 13 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{value}</div>
          </Card>
        ))}
      </div>

      {geo && (geo.orders > 0 || geo.experts > 0) && (
        <Alert
          type="warning"
          title={`주소 좌표가 없는 주문 ${geo.orders}건${geo.experts > 0 ? `, 전문가 ${geo.experts}명` : ''}`}
          description="좌표가 없으면 거리 점수와 동선 제안에서 조용히 빠집니다. 눌러서 채우세요."
        />
      )}
      {geo && (geo.orders > 0 || geo.experts > 0) && (
        <div>
          <Button
            size="s"
            loading={fixing}
            onClick={async () => {
              setFixing(true);
              try {
                await api.geocodeBackfill(200);
                setGeo(await api.geocodeStatus());
              } finally {
                setFixing(false);
              }
            }}
          >
            좌표 채우기
          </Button>
        </div>
      )}

      {exit && <ExitCard e={exit} />}

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <b>최근 주문</b>
          <Button variant="ghost" size="s" onClick={() => nav('/orders')}>
            전체 보기
          </Button>
        </div>
        <div className="sg-table-wrap">
          <table className="sg-table">
            <thead>
              <tr>
                <th>주문번호</th>
                <th>고객</th>
                <th>상태</th>
                <th>채널</th>
                <th className="sg-num">금액</th>
              </tr>
            </thead>
            <tbody>
              {d.recent.map((o) => (
                <tr key={o.id} onClick={() => nav(`/orders/${o.id}`)} style={{ cursor: 'pointer' }}>
                  <td>{o['order-number']}</td>
                  <td>{o['customer-name'] ?? '-'}</td>
                  <td>{statusLabel(o.status)}</td>
                  <td>{o['channel-code'] === 'wisa' ? '위사몰' : (o['channel-code'] ?? '-')}</td>
                  <td className="sg-num">{won(o['total-amount'])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
