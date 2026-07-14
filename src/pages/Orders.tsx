import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Empty, Skeleton } from '@sgsg/design/components';
import { api, ApiError, type ExitReason, type Order } from '../api';
import { ExitReasonModal } from '../ExitReasonModal';
import AssignModal from '../AssignModal';
import { nextAction, paymentLabel, progressLabel, statusLabel } from '../status';

const won = (n: number) => `${Math.round(n ?? 0).toLocaleString('ko-KR')}원`;

// 현장 조건(UNIT·siteChips)은 AssignModal 로 옮겼다 — 배정 화면이 두 벌이면
// 언젠가 한쪽만 고쳐진다.

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
  const [assigning, setAssigning] = useState<Order | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 주문을 내보내는 세 길. 어느 길로 나가든 **셀 수 있는 사유**를 남긴다.
  const [exiting, setExiting] = useState<{ order: Order; kind: 'cancel' | 'recall' | 'unassigned' } | null>(null);

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

  async function exitOrder(r: ExitReason) {
    if (!exiting) return;
    const { order, kind } = exiting;
    if (kind === 'cancel') await api.cancelOrder(order.id, r);
    else if (kind === 'recall') await api.recallOrder(order.id, r);
    else await api.unassignOrder(order.id, r);
    await load();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>주문</h1>
        {/* 전화로 들어오는 건이 남는다. 넣을 데가 없으면 운영자는 주문을 못 받는다. */}
        <Button size="s" onClick={() => nav('/orders/new')}>
          주문 등록
        </Button>
      </div>

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
                              color: 'var(--color-primary-primary-text)',
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

                        {/* 살아 있는 주문은 언제든 나갈 수 있다. 다만 이유 없이는 못 나간다. */}
                        {!['cancelled', 'purchase-confirmed'].includes(o.status) && (
                          <span style={{ marginLeft: 6, display: 'inline-flex', gap: 6 }}>
                            {o['expert-id'] && (
                              <Button
                                size="s"
                                variant="secondary"
                                onClick={() => setExiting({ order: o, kind: 'recall' })}
                              >
                                회수
                              </Button>
                            )}
                            <Button
                              size="s"
                              variant="secondary"
                              onClick={() => setExiting({ order: o, kind: 'cancel' })}
                            >
                              취소
                            </Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ExitReasonModal
        open={exiting != null}
        kind={exiting?.kind ?? 'cancel'}
        orderLabel={
          exiting
            ? `${exiting.order['service-name'] ?? ''} · ${exiting.order['customer-snapshot']?.['customer-name'] ?? ''}`
            : ''
        }
        onClose={() => setExiting(null)}
        onDone={exitOrder}
      />

      {assigning && (
        <AssignModal
          orderId={assigning.id}
          description={`${assigning['service-name']} · ${assigning['customer-snapshot']?.address?.address1 ?? ''}`}
          onClose={() => setAssigning(null)}
          onDone={() => {
            setAssigning(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
