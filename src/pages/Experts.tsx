import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Empty, Modal, Skeleton } from '@sgsg/design/components';
import { api, ApiError, type Expert } from '../api';

const GRADE: Record<string, string> = { basic: '일반', membership: '멤버십', master: '마스터' };

/**
 * 전문가.
 *
 * 승인 대기부터 보여 준다 — 그게 운영자를 기다리는 것이다. 승인이 늦으면 전문가는
 * 일을 못 하고, 일을 못 하는 전문가는 떠난다.
 *
 * **'거절'이라고 쓰지 않는다.** 서류가 모자란 것은 실패가 아니다 — 다시 내면 된다.
 */
export default function Experts() {
  const [params, setParams] = useSearchParams();
  const filter = params.get('status') ?? 'pending';

  const [list, setList] = useState<Expert[] | null>(null);
  const [holding, setHolding] = useState<{ e: Expert; reason: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setList(null);
    try {
      const all = await api.experts({});
      setList(
        filter === 'all' ? all : all.filter((e) => e['approval-status'] === filter),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '불러오지 못했어요.');
      setList([]);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(e: Expert) {
    setBusy(e.id);
    setError(null);
    try {
      await api.approveExpert(e.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '승인하지 못했어요.');
    } finally {
      setBusy(null);
    }
  }

  async function hold() {
    if (!holding) return;
    setBusy(holding.e.id);
    setError(null);
    try {
      await api.rejectExpert(holding.e.id, holding.reason);
      setHolding(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '처리하지 못했어요.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>전문가</h1>

      <div style={{ display: 'flex', gap: 8 }}>
        {[
          ['pending', '승인 대기'],
          ['approved', '승인됨'],
          ['all', '전체'],
        ].map(([k, label]) => (
          <Button
            key={k}
            size="s"
            variant={filter === k ? 'primary' : 'secondary'}
            onClick={() => setParams({ status: k })}
          >
            {label}
          </Button>
        ))}
      </div>

      {error && <Alert type="danger" title={error} />}

      <Card>
        {!list && <Skeleton height="200px" />}
        {list?.length === 0 && <Empty title="해당하는 전문가가 없어요." />}

        {list && list.length > 0 && (
          <div className="sg-table-wrap">
            <table className="sg-table">
              <thead>
                <tr>
                  <th>상호</th>
                  <th>연락처</th>
                  <th>지역</th>
                  <th>등급</th>
                  <th>별점</th>
                  <th className="sg-num">진행/완료</th>
                  <th>다음</th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td>{e['business-info']?.['business-name'] ?? e.id.slice(0, 8)}</td>
                    <td>{e['business-info']?.contact ?? '-'}</td>
                    <td>{e['service-info']?.['region-groups']?.join(', ') || '미설정'}</td>
                    <td>{GRADE[e['account-grade'] ?? ''] ?? e['account-grade'] ?? '-'}</td>
                    {/* 별점이 없는 것과 0점은 다른 얘기다. 신규 전문가를 0점으로
                        보여 주면 아무도 그를 고르지 않는다. */}
                    <td>{e.rating != null ? `★ ${e.rating.toFixed(1)}` : '리뷰 없음'}</td>
                    <td className="sg-num">
                      {e.statistics?.['total-servicing-orders'] ?? 0} /{' '}
                      {e.statistics?.['total-completed-service-orders'] ?? 0}
                    </td>
                    <td>
                      {e['approval-status'] === 'pending' ? (
                        <span style={{ display: 'flex', gap: 6 }}>
                          <Button size="s" variant="primary" loading={busy === e.id} onClick={() => approve(e)}>
                            승인
                          </Button>
                          <Button size="s" onClick={() => setHolding({ e, reason: '' })}>
                            보류
                          </Button>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-contents-contents-sub)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={holding != null}
        onClose={() => setHolding(null)}
        title="승인 보류"
        description="무엇이 모자란지 적어 주세요. 전문가가 다시 낼 수 있어야 합니다."
        actions={
          <Button
            variant="primary"
            loading={busy != null}
            disabled={!holding?.reason}
            onClick={hold}
          >
            보류하기
          </Button>
        }
      >
        {holding && (
          <textarea
            value={holding.reason}
            rows={3}
            placeholder="예: 사업자등록증 사본이 흐려서 확인이 어려워요."
            onChange={(ev) => setHolding({ ...holding, reason: ev.target.value })}
            style={{
              width: '100%',
              padding: 'var(--sp-12)',
              borderRadius: 'var(--rd-12)',
              border: '1px solid var(--color-divider-divider)',
              background: 'var(--color-background-elevation-1)',
              color: 'var(--color-contents-contents)',
              font: 'inherit',
            }}
          />
        )}
      </Modal>
    </div>
  );
}
