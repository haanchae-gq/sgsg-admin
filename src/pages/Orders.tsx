import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Empty, Modal, Skeleton } from '@sgsg/design/components';
import { api, ApiError, type Candidate, type ExitReason, type Order } from '../api';
import { ExitReasonModal } from '../ExitReasonModal';
import { nextAction, paymentLabel, progressLabel, statusLabel } from '../status';

const won = (n: number) => `${Math.round(n ?? 0).toLocaleString('ko-KR')}원`;

const UNIT: Record<string, string> = {
  wall: '벽걸이',
  stand: '스탠드',
  ceiling: '천장형',
  system: '시스템에어컨',
};

/** 현장 조건을 사람이 읽는 말로. 배정 판단의 근거이므로 모달 맨 위에 둔다. */
function siteChips(s: Record<string, any>): string[] {
  const out: string[] = [];
  if (s['unit-type']) out.push(UNIT[s['unit-type']] ?? s['unit-type']);
  if (s['unit-count'] > 1) out.push(`${s['unit-count']}대`);
  if (s.floor != null) out.push(`${s.floor}층${s.elevator === false ? ' (엘리베이터 없음)' : ''}`);
  if (s.commercial) out.push('상업시설');
  if (s.ceiling === 'high') out.push('고층고 (사다리 필요)');
  if (s['soil-level'] === 'heavy') out.push('오염 심함');
  if (s.parking === false) out.push('주차 불가');
  if (s['distance-km'] != null) out.push(`${s['distance-km']}km`);
  return out;
}

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
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [site, setSite] = useState<Record<string, unknown>>({});
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

  // 후보는 주문마다 다르다. 모달을 열 때 그 주문으로 물어본다 —
  // 전문가 전체를 미리 받아 두면 "누가 이 일을 할 수 있나"를 다시 화면에서 계산하게 된다.
  useEffect(() => {
    if (!assigning) return;
    setCands(null);
    api
      .candidates(assigning.id)
      .then((d) => {
        setCands(d.candidates);
        setSite(d.site ?? {});
      })
      .catch(() => setCands([]));
  }, [assigning]);

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

      <Modal
        open={assigning != null}
        onClose={() => setAssigning(null)}
        title="전문가 배정"
        description={
          assigning
            ? `${assigning['service-name']} · ${assigning['customer-snapshot']?.address?.address1 ?? ''}`
            : ''
        }
      >
        {/* 현장 조건을 먼저 보여 준다. 왜 이 사람이 되고 저 사람이 안 되는지의 근거다. */}
        {Object.keys(site).length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            {siteChips(site).map((t) => (
              <span
                key={t}
                style={{
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'var(--color-background-elevation-2)',
                  color: 'var(--color-contents-contents-sub)',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {!cands && <Skeleton height="160px" />}
        {cands?.length === 0 && <Empty title="등록된 전문가가 없어요." />}

        {cands && cands.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
            {cands.map((c) => (
              <button
                key={c['expert-id']}
                type="button"
                onClick={() => assign(c['expert-id'])}
                disabled={busy != null}
                title={c.available ? '' : '못 하는 이유가 있지만 배정할 수는 있어요'}
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--rd-12)',
                  border: '1px solid var(--color-divider-divider)',
                  background: c.available
                    ? 'var(--color-background-elevation-1)'
                    : 'var(--color-background-elevation-2)',
                  color: 'var(--color-contents-contents)',
                  font: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                  // 못 하는 사람도 지우지 않는다. 흐리게 내려 둘 뿐이다 — 다른 후보가
                  // 없을 때 운영자는 "사다리를 빌려서라도 가겠다"는 사람에게 전화할 수
                  // 있어야 한다.
                  opacity: c.available ? 1 : 0.6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b>{c.name}</b>
                  <span style={{ fontSize: 13, color: 'var(--color-contents-contents-sub)' }}>
                    {c['distance-km'] != null ? `${c['distance-km']}km · ` : ''}
                    {c.region || '지역 미설정'}
                    {c.rating != null ? ` · ★ ${c.rating.toFixed(1)}` : ' · 리뷰 없음'}
                  </span>
                </div>

                {/* 왜 위에 있는지 / 왜 못 하는지. 점수만 보여 주면 아무도 못 믿는다. */}
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12 }}>
                  {c.reasons.map((r) => (
                    <span key={r} style={{ color: 'var(--color-primary-primary-text)' }}>
                      + {r}
                    </span>
                  ))}
                  {c.blockers.map((b) => (
                    <span key={b.code} style={{ color: 'var(--color-individuals-danger)' }}>
                      − {b.label}
                    </span>
                  ))}
                  {/* 경고는 차단이 아니다. 자주 무르는 사람에게도 일을 줘야 할 때가
                      있고, 그 판단은 사람이 한다 — 우리는 사실만 올린다. */}
                  {(c.cautions ?? []).map((w) => (
                    <span key={w} style={{ color: 'var(--color-status-warning)' }}>
                      ⚠ {w}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
