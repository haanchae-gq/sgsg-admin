import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Skeleton } from '@sgsg/design/components';
import { api } from '../api';
import { statusLabel } from '../status';

const won = (n: number) => `${Math.round(n ?? 0).toLocaleString('ko-KR')}원`;

type Summary = {
  queues: Record<string, number>;
  stats: Record<string, number>;
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.dashboard().then(setD).catch(() => setError('불러오지 못했어요.'));
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
