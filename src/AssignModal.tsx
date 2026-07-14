import { useEffect, useState } from 'react';
import { Alert, Empty, Modal, Skeleton } from '@sgsg/design/components';
import { api, ApiError, type Candidate } from './api';

/**
 * 전문가 배정 — 기계가 좁히고 사람이 고른다.
 *
 * ## 못 하는 사람도 지우지 않는다
 *
 * 이유를 달아 흐리게 내려 둘 뿐이다. 다른 후보가 하나도 없을 때, 운영자는 "사다리를
 * 빌려서라도 가겠다"는 전문가에게 전화를 걸 수 있어야 한다. 기계가 사람의 선택지를
 * 지우면 안 된다.
 *
 * ## 두 거리를 다 보여 준다
 *
 * '1km' 만 보여 주면 운영자는 이 사람이 집에서 35km 라는 걸 모른다. 그가 그날 그 일정을
 * 취소하는 순간 1km 는 35km 로 되돌아간다. 그래서 '그날 이미 근처에 간다' 는 사실과
 * '집에서는 얼마다' 를 함께 적는다.
 *
 * (주문 목록과 주문 상세가 같이 쓴다 — 배정 화면이 두 벌이면 언젠가 한쪽만 고쳐진다.)
 */

const UNIT: Record<string, string> = {
  wall: '벽걸이',
  stand: '스탠드',
  ceiling: '천장형',
  system: '시스템에어컨',
};

/** 현장 조건을 사람이 읽는 말로. 배정 판단의 근거이므로 모달 맨 위에 둔다. */
function siteChips(s: Record<string, any>): string[] {
  const out: string[] = [];
  if (s['unit-type']) out.push(UNIT[s['unit-type']] ?? String(s['unit-type']));
  if (s['unit-count']) out.push(`${s['unit-count']}대`);
  if (s.floor) out.push(`${s.floor}층${s.elevator === false ? ' (엘베 없음)' : ''}`);
  if (s.commercial) out.push('상업시설');
  if (s.parking === false) out.push('주차 불가');
  if (s['soil-level'] === 'heavy') out.push('오염 심함');
  return out;
}

export default function AssignModal({
  orderId,
  title,
  description,
  onClose,
  onDone,
}: {
  orderId: string;
  title?: string;
  description?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [site, setSite] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 후보는 주문마다 다르다. 열 때 그 주문으로 물어본다 — 전문가 전체를 미리 받아 두면
  // "누가 이 일을 할 수 있나"를 다시 화면에서 계산하게 된다.
  useEffect(() => {
    setCands(null);
    api
      .candidates(orderId)
      .then((d) => {
        setCands(d.candidates);
        setSite(d.site ?? {});
      })
      .catch(() => setCands([]));
  }, [orderId]);

  async function assign(expertId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.assignExpert(orderId, expertId);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '배정하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={title ?? '전문가 배정'} description={description ?? ''}>
      {error && <Alert type="danger" title={error} />}

      {/* 현장 조건을 먼저. 왜 이 사람이 되고 저 사람이 안 되는지의 근거다. */}
      {Object.keys(site).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, fontSize: 13 }}>
          {siteChips(site as Record<string, any>).map((t) => (
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
              disabled={busy}
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

              {/* ★ 그날 이미 그 근처에 가는 사람. 다른 플랫폼은 이 사실을 모른다.
                  집에서의 거리도 같이 적는다 — 그 일정이 깨지면 되돌아갈 숫자다. */}
              {c['hop-km'] != null && c['base-km'] != null && c['base-km'] !== c['hop-km'] && (
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-contents-contents-sub)' }}>
                  집에서는 {c['base-km']}km — 그날 일정이 바뀌면 이 거리로 되돌아가요
                </div>
              )}

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
                {/* 경고는 차단이 아니다 — 우리는 사실만 올린다. */}
                {(c.cautions ?? []).map((w) => (
                  <span key={w} style={{ color: 'var(--color-individuals-warning)' }}>
                    ⚠ {w}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
