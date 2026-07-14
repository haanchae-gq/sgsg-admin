import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Modal, Skeleton } from '@sgsg/design/components';
import { api, ApiError, type DayCandidates, type DayMarketDate } from '../api';

/**
 * 하루 시장 — **우리는 주문을 팔지 않는다. 하루를 판다.**
 *
 * ## 이 화면이 없어서 생긴 일
 *
 * 백엔드는 `partition-pool` 로 편식을 **구조적으로** 막아 뒀다: 묶일 수 있는 건은 오직
 * 하루로만 팔리고, 낱개로는 살 수 없다. 그래야 25만원짜리 이사 청소만 골라가고 7.9만원
 * 먼 건이 찌꺼기로 남는 일이 안 생긴다.
 *
 * 그런데 **관리자에 이 화면이 없어서** 운영자는 여전히 주문 화면에서 하나씩 배정했다.
 * 우리가 구조로 막은 편식을 **운영 화면이 되살리고 있었다.**
 *
 * ## 단건 수가 지표다
 *
 * 단건은 '실패'다. 그 숫자가 크면 **물량이 얇다**는 뜻이고, 그건 마케팅이 풀 문제지
 * 배정이 풀 문제가 아니다. 그래서 세어서 보여 준다.
 */

const won = (n?: number | null) => (n == null ? '-' : `${Math.round(n).toLocaleString('ko-KR')}원`);

const dateLabel = (d: string) => {
  const t = new Date(d);
  const w = ['일', '월', '화', '수', '목', '금', '토'][t.getDay()];
  return `${t.getMonth() + 1}/${t.getDate()} (${w})`;
};

export default function Days() {
  const [market, setMarket] = useState<DayMarketDate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.dayMarket();
      setMarket(d.market ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '하루 시장을 불러오지 못했어요.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!market && !error) return <Skeleton height="240px" />;

  const totalDays = (market ?? []).reduce((a, m) => a + m.days.length, 0);
  const totalSingles = (market ?? []).reduce((a, m) => a + m.singles.length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>하루 시장</h1>
        <p style={{ color: 'var(--color-contents-contents-sub)', margin: '4px 0 0', fontSize: 14 }}>
          우리는 주문을 팔지 않습니다. 하루를 팝니다 — 묶일 수 있는 건은 낱개로 배정하지
          않습니다.
        </p>
      </div>

      {error && <Alert type="danger" title={error} />}

      {market && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Chip label={`하루 ${totalDays}개`} />
          {/* ★ 단건은 실패다. 크면 물량이 얇다는 뜻이다. */}
          <Chip
            label={`단건 ${totalSingles}건`}
            tone={totalSingles > totalDays * 2 ? 'warning' : 'plain'}
          />
        </div>
      )}

      {market?.length === 0 && (
        <Empty
          title="대기 중인 주문이 없어요."
          description="새 주문이 들어오면 여기서 하루로 묶여 보입니다."
        />
      )}

      {market?.map((m) => (
        <Card key={m.date}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>{dateLabel(m.date)}</h2>

          {m.days.length === 0 && m.singles.length === 0 && (
            <div style={{ color: 'var(--color-contents-contents-sub)', fontSize: 14 }}>
              이 날짜에 남은 주문이 없어요.
            </div>
          )}

          {m.days.map((d) => {
            const total = d.stops.reduce((a, s) => a + (s.amount ?? 0), 0);
            // 현장 간 이동 합. 첫 정차는 통근이라 0 이다 — 통근은 전문가마다 다르므로
            // 여기(전문가를 모르는 시장)에서는 셀 수 없다.
            const travel = d.stops.reduce((a, s) => a + (s['travel-minutes'] ?? 0), 0);
            return (
              <div
                key={d.orders.join(',')}
                style={{
                  border: '1px solid var(--color-divider-divider)',
                  borderRadius: 'var(--rd-12)',
                  padding: 12,
                  marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <b>
                    {d.stops.length}건 · {won(total)}
                    {/* ★ 이동이 없으면 이건 '하루' 가 아니라 그냥 주문 묶음이다.
                        이 숫자가 하루의 존재 이유다. */}
                    {travel > 0 && (
                      <span
                        style={{
                          fontWeight: 500,
                          color: 'var(--color-contents-contents-sub)',
                          fontSize: 13,
                        }}
                      >
                        {' '}· 현장 간 이동 {travel}분
                      </span>
                    )}
                  </b>
                  <Button size="s" variant="primary" onClick={() => setPicking(d.orders)}>
                    이 하루 배정
                  </Button>
                </div>
                <div style={{ marginTop: 8 }}>
                  {d.stops.map((s, i) => (
                    <div
                      key={s['order-id']}
                      style={{ display: 'flex', gap: 8, fontSize: 13, padding: '2px 0' }}
                    >
                      <span style={{ color: 'var(--color-contents-contents-sub)', width: 16 }}>
                        {i + 1}
                      </span>
                      <span style={{ flex: 1 }}>
                        {s.name}
                        {s.address && (
                          <span style={{ color: 'var(--color-contents-contents-sub)' }}> · {s.address}</span>
                        )}
                        {/* 현장 간 이동. 첫 정차는 통근이라 따로 센다. */}
                        {(s['travel-minutes'] ?? 0) > 0 && (
                          <span style={{ color: 'var(--color-contents-contents-sub)' }}>
                            {' '}
                            ↳ 이동 {s['travel-minutes']}분 ({s['travel-km']}km)
                          </span>
                        )}
                      </span>
                      <span style={{ fontWeight: 700 }}>{won(s.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {m.singles.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--color-contents-contents-sub)',
                  marginBottom: 6,
                }}
              >
                단건 — 어떤 하루에도 못 들어갔어요
              </div>
              {m.singles.map((s) => (
                <div
                  key={s.id}
                  style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', gap: 12 }}
                >
                  <span>
                    {s['service-name']}
                    {s.address && (
                      <span style={{ color: 'var(--color-contents-contents-sub)' }}> · {s.address}</span>
                    )}
                  </span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}>{won(s.amount)}</span>
                    <Button size="xs" variant="secondary" onClick={() => setPicking([s.id])}>
                      배정
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}

      {picking && (
        <AssignDayModal
          orderIds={picking}
          onClose={() => setPicking(null)}
          onDone={() => {
            setPicking(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Chip({ label, tone = 'plain' }: { label: string; tone?: 'plain' | 'warning' }) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 700,
        padding: '4px 10px',
        borderRadius: 999,
        border: '1px solid var(--color-divider-divider)',
        background:
          tone === 'warning'
            ? 'var(--color-background-warning-elevation-1)'
            : 'var(--color-background-elevation-2)',
        color:
          tone === 'warning'
            ? 'var(--color-individuals-warning)'
            : 'var(--color-contents-contents-sub)',
      }}
    >
      {label}
    </span>
  );
}

/** 이 하루를 **누가** 할 수 있나. 전문가앱과 방향이 반대다. */
function AssignDayModal({
  orderIds,
  onClose,
  onDone,
}: {
  orderIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [d, setD] = useState<DayCandidates | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .dayCandidates(orderIds)
      .then(setD)
      .catch((e) => setError(e instanceof ApiError ? e.message : '후보를 불러오지 못했어요.'));
  }, [orderIds]);

  async function assign(expertId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.assignDay(orderIds, expertId);
      onDone();
    } catch (e) {
      // 방금 팔렸을 수 있다. 빈손으로 닫지 않고 이유를 말한다.
      setError(e instanceof ApiError ? e.message : '배정하지 못했어요.');
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={orderIds.length > 1 ? `하루 배정 (${orderIds.length}건)` : '단건 배정'}
      description="전부 배정되거나, 하나도 배정되지 않습니다."
    >
      {error && <Alert type="danger" title={error} />}
      {!d && !error && <Skeleton height="160px" />}

      {d && (
        <>
          <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--color-contents-contents-sub)' }}>
            {d.stops.map((s) => s.name).join(' → ')}
          </div>

          {d.candidates.length === 0 && <Empty title="배정 가능한 전문가가 없어요." />}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
            {d.candidates.map((c) => (
              <button
                key={c['expert-id']}
                type="button"
                disabled={busy}
                onClick={() => assign(c['expert-id'])}
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
                  // 못 하는 사람도 지우지 않는다 — 이유를 달아 흐리게 내려 둘 뿐이다.
                  opacity: c.available ? 1 : 0.6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b>
                    {c['wants-it'] && (
                      <span style={{ color: 'var(--color-primary-primary-text)' }}>★ </span>
                    )}
                    {c.name}
                  </b>
                  <span style={{ fontSize: 13, color: 'var(--color-contents-contents-sub)' }}>
                    {c['commute-km'] != null ? `통근 ${c['commute-km']}km · ` : ''}
                    {c['hourly-take'] != null ? `시간당 ${won(c['hourly-take'])}` : ''}
                  </span>
                </div>

                {/* ★ 그가 이 하루를 원한다고 말했다. 운영자가 몰랐던 정보다.
                    다만 **선착순이 아니다** — 원했다고 자동으로 앞에 오지 않는다. */}
                {c['wants-it'] && (
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-primary-primary-text)' }}>
                    이 하루를 하고 싶어 해요{c['wants-note'] ? ` — ${c['wants-note']}` : ''}
                  </div>
                )}

                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12 }}>
                  {c.blockers.map((b) => (
                    <span key={b.code} style={{ color: 'var(--color-individuals-danger)' }}>
                      − {b.label}
                    </span>
                  ))}
                  {(c.cautions ?? []).map((w) => (
                    <span key={w} style={{ color: 'var(--color-individuals-warning)' }}>
                      ⚠ {w}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
