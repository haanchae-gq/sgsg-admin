import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Modal, Skeleton } from '@sgsg/design/components';
import { api, ApiError } from '../api';

/**
 * 리뷰.
 *
 * 관리자는 **가려진 것까지** 본다. 안 보이면 되돌릴 수도 없다.
 *
 * 리뷰는 쓰는 즉시 노출된다. 관리자가 승인해야 보이는 모델이면 주말에 쓴 리뷰는
 * 월요일까지 아무도 못 본다. 문제가 있으면 **이유를 적고 내린다** — 나중에 전문가가
 * 물어보면 답할 수 있어야 하고, 이유를 요구하면 마음대로 가리는 일이 줄어든다.
 */
export default function Reviews() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [blinding, setBlinding] = useState<{ id: string; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    try {
      setRows(await api.reviews(onlyHidden ? { visible: 'false' } : {}));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '불러오지 못했어요.');
      setRows([]);
    }
  }, [onlyHidden]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, fail: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : fail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>리뷰</h1>

      <div style={{ display: 'flex', gap: 8 }}>
        <Button size="s" variant={!onlyHidden ? 'primary' : 'secondary'} onClick={() => setOnlyHidden(false)}>
          전체
        </Button>
        <Button size="s" variant={onlyHidden ? 'primary' : 'secondary'} onClick={() => setOnlyHidden(true)}>
          가려진 것만
        </Button>
      </div>

      {error && <Alert type="danger" title={error} />}

      <Card>
        <div style={{ color: 'var(--color-contents-contents-sub)', fontSize: 13, marginBottom: 12 }}>
          리뷰는 쓰는 즉시 노출됩니다. 문제가 있으면 이유를 적고 가립니다 — 가려진 리뷰는 전문가
          별점 평균에서도 빠집니다.
        </div>

        {!rows && <Skeleton height="160px" />}
        {rows?.length === 0 && <Empty title="리뷰가 없어요." />}

        {rows && rows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rows.map((r) => (
              <div
                key={r.id}
                style={{
                  padding: 14,
                  borderRadius: 'var(--rd-12)',
                  border: '1px solid var(--color-divider-divider)',
                  background: r['is-approved']
                    ? 'var(--color-background-elevation-1)'
                    : 'var(--color-background-elevation-2)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#FAAD14', fontWeight: 700 }}>
                    {'★'.repeat(r.rating)}
                    <span style={{ color: 'var(--color-divider-divider)' }}>{'★'.repeat(5 - r.rating)}</span>
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--color-contents-contents-sub)' }}>
                    {String(r['created-at'] ?? '').slice(0, 10)}
                    {' · '}
                    {r['is-approved'] ? '노출 중' : '가려짐'}
                  </span>
                </div>

                <div style={{ marginTop: 8 }}>{r.content}</div>

                {r['expert-reply'] && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '8px 12px',
                      borderRadius: 'var(--rd-8)',
                      background: 'var(--color-background-elevation-2)',
                      fontSize: 14,
                    }}
                  >
                    <b>전문가 답글 </b>
                    {r['expert-reply']}
                  </div>
                )}

                {r['admin-note'] && (
                  <div style={{ marginTop: 8, fontSize: 13, color: 'var(--color-individuals-danger)' }}>
                    가림 사유: {r['admin-note']}
                  </div>
                )}

                <div style={{ marginTop: 10 }}>
                  {r['is-approved'] ? (
                    <Button size="s" variant="danger" onClick={() => setBlinding({ id: r.id, reason: '' })}>
                      가리기
                    </Button>
                  ) : (
                    <Button size="s" loading={busy} onClick={() => run(() => api.unblindReview(r.id), '되돌리지 못했어요.')}>
                      되돌리기
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={blinding != null}
        onClose={() => setBlinding(null)}
        title="리뷰 가리기"
        description="가리는 이유를 적어 주세요. 전문가가 물어보면 이 이유로 답하게 됩니다."
        actions={
          <Button
            variant="danger"
            loading={busy}
            disabled={!blinding?.reason}
            onClick={() =>
              run(async () => {
                await api.blindReview(blinding!.id, blinding!.reason);
                setBlinding(null);
              }, '가리지 못했어요.')
            }
          >
            가리기
          </Button>
        }
      >
        {blinding && (
          <textarea
            value={blinding.reason}
            rows={3}
            placeholder="예: 욕설 / 서비스와 무관한 내용 / 개인정보 노출"
            onChange={(e) => setBlinding({ ...blinding, reason: e.target.value })}
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
