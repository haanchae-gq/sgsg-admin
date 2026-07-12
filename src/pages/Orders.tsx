import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Empty, Modal, Skeleton } from '@sgsg/design/components';
import { api, ApiError, type Expert, type Order } from '../api';
import { nextAction, paymentLabel, progressLabel, statusLabel } from '../status';

const won = (n: number) => `${Math.round(n ?? 0).toLocaleString('ko-KR')}원`;

const FILTERS: { key: string; label: string; status?: string }[] = [
  { key: 'todo', label: '내 손이 필요한 것' },
  { key: 'all', label: '전체' },
  { key: 'new', label: '검수 대기', status: 'new' },
  { key: 'checked', label: '배정 대기', status: 'checked' },
  { key: 'assigned', label: '진행 중', status: 'assigned' },
  { key: 'service-completed', label: '작업 완료', status: 'service-completed' },
];

/**
 * 주문 처리.
 *
 * 운영자가 하루 종일 보는 화면이다. 그래서 **목록에서 나가지 않고** 검수하고 배정한다 —
 * 예전에는 상세로 들어가서 처리하고 목록으로 돌아오면 필터가 풀려 있었다.
 */
export default function Orders() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = params.get('status') ?? (params.get('view') ?? 'todo');

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [experts, setExperts] = useState<Expert[]>([]);
  const [assigning, setAssigning] = useState<Order | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setOrders(null);
    try {
      // '내 손이 필요한 것' 은 서버에 없는 필터다. 두 상태를 합쳐 만든다 —
      // 운영자에게 '접수'와 '검수완료'는 둘 다 "내가 눌러야 움직이는 것"이다.
      if (filter === 'todo') {
        const [a, b] = await Promise.all([
          api.orders({ status: 'new' }),
          api.orders({ status: 'checked' }),
        ]);
        setOrders([...a.items, ...b.items]);
      } else if (filter === 'all') {
        setOrders((await api.orders({})).items);
      } else {
        setOrders((await api.orders({ status: filter })).items);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '불러오지 못했어요.');
      setOrders([]);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api.experts({ 'active-status': 'active' }).then(setExperts).catch(() => undefined);
  }, []);

  async function check(o: Order) {
    setBusy(o.id);
    setError(null);
    try {
      await api.checkOrder(o.id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '검수하지 못했어요.');
    } finally {
      setBusy(null);
    }
  }

  async function assign(expertId: string) {
    if (!assigning) return;
    setBusy(assigning.id);
    setError(null);
    try {
      await api.assignExpert(assigning.id, expertId);
      setAssigning(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '배정하지 못했어요.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>주문</h1>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="s"
            variant={filter === (f.status ?? f.key) ? 'primary' : 'secondary'}
            onClick={() =>
              setParams(f.status ? { status: f.status } : f.key === 'todo' ? {} : { view: 'all' })
            }
          >
            {f.label}
          </Button>
        ))}
      </div>

      {error && <Alert type="danger" title={error} />}

      <Card>
        {!orders && <Skeleton height="200px" />}

        {orders?.length === 0 && (
          <Empty title="처리할 주문이 없어요." description="새 주문이 들어오면 여기 뜹니다." />
        )}

        {orders && orders.length > 0 && (
          <div className="sg-table-wrap">
            <table className="sg-table">
              <thead>
                <tr>
                  <th>주문번호</th>
                  <th>서비스</th>
                  <th>고객</th>
                  <th>상태</th>
                  <th>진행</th>
                  <th>결제</th>
                  <th className="sg-num">금액</th>
                  <th>다음</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const na = nextAction(o);
                  return (
                    <tr key={o.id}>
                      <td onClick={() => nav(`/orders/${o.id}`)} style={{ cursor: 'pointer' }}>
                        {o['order-number']?.value}
                        {o['channel-code'] === 'wisa' && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 11,
                              padding: '2px 6px',
                              borderRadius: 999,
                              background: 'var(--color-background-primary-elevation-1)',
                              color: 'var(--color-contents-contents-on)',
                            }}
                          >
                            위사몰
                          </span>
                        )}
                      </td>
                      <td>{o['service-name'] ?? '-'}</td>
                      <td>{o['customer-snapshot']?.['customer-name'] ?? '-'}</td>
                      <td>{statusLabel(o.status)}</td>
                      <td>{progressLabel(o['expert-progress-status'])}</td>
                      <td>{paymentLabel(o['payment-status'])}</td>
                      <td className="sg-num">{won(o.cost?.['total-amount'])}</td>
                      <td>
                        {/* 다음에 해야 할 일이 곧 버튼이다. 상세로 들어갈 필요가 없다. */}
                        {na?.kind === 'check' && (
                          <Button size="s" loading={busy === o.id} onClick={() => check(o)}>
                            검수
                          </Button>
                        )}
                        {na?.kind === 'assign' && (
                          <Button size="s" variant="primary" onClick={() => setAssigning(o)}>
                            전문가 배정
                          </Button>
                        )}
                        {!na && <span style={{ color: 'var(--color-contents-contents-sub)' }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={assigning != null}
        onClose={() => setAssigning(null)}
        title="전문가 배정"
        description={assigning ? `${assigning['service-name']} · ${assigning['customer-snapshot']?.address?.address1 ?? ''}` : ''}
      >
        {experts.length === 0 ? (
          <Empty title="배정할 수 있는 전문가가 없어요." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
            {experts.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => assign(e.id)}
                disabled={busy != null}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  borderRadius: 'var(--rd-12)',
                  border: '1px solid var(--color-divider-divider)',
                  background: 'var(--color-background-elevation-1)',
                  color: 'var(--color-contents-contents)',
                  font: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span>
                  <b>{e['business-info']?.['business-name'] ?? e.id}</b>
                  <span style={{ marginLeft: 8, color: 'var(--color-contents-contents-sub)', fontSize: 13 }}>
                    {e['service-info']?.['region-groups']?.join(', ') || '지역 미설정'}
                  </span>
                </span>
                <span style={{ color: 'var(--color-contents-contents-sub)', fontSize: 13 }}>
                  {/* 별점이 없는 것과 0점은 다른 얘기다. 신규 전문가를 0점으로 보여 주면
                      아무도 그를 고르지 않는다. */}
                  {e.rating != null ? `★ ${e.rating.toFixed(1)}` : '리뷰 없음'}
                  {' · 진행 '}
                  {e.statistics?.['total-servicing-orders'] ?? 0}건
                </span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
