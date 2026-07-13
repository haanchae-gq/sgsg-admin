import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Modal, Skeleton } from '@sgsg/design/components';
import { api, ApiError, type Expert } from '../api';

const won = (n: number) => `${Math.round(n ?? 0).toLocaleString('ko-KR')}원`;
const pct = (r?: number | null) => (r != null ? `${(r * 100).toFixed(1)}%` : '—');

const SCOPE: Record<string, string> = {
  default: '기본 (전체)',
  expert: '전문가 지정',
  category: '카테고리 지정',
};

const STATUS: Record<string, string> = {
  pending: '승인 대기',
  approved: '지급 예정',
  paid: '지급 완료',
  cancelled: '취소',
};

/**
 * 정산 · 수수료.
 *
 * **수수료율은 코드에 없다.** 경영이 아직 확정하지 않았고, 확정되면 배포 없이 여기서
 * 바꾼다 — 그래서 이 화면이 필요하다.
 *
 * 적용 순서는 **좁은 것이 이긴다**: 전문가 지정 > 카테고리 지정 > 기본.
 */
export default function Settlements() {
  const [policies, setPolicies] = useState<any[] | null>(null);
  const [rows, setRows] = useState<any[] | null>(null);
  const [experts, setExperts] = useState<Expert[]>([]);
  const [preview, setPreview] = useState<any | null>(null);

  const now = new Date();
  const [expertId, setExpertId] = useState('');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [editing, setEditing] = useState<{ scope: string; scopeId: string; rate: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, s, e] = await Promise.all([api.commissionPolicies(), api.settlements({}), api.experts({})]);
      setPolicies(p);
      setRows(s);
      setExperts(e);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '불러오지 못했어요.');
    }
  }, []);

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
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>정산</h1>

      {error && <Alert type="danger" title={error} />}

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <b>수수료 정책</b>
            <div style={{ color: 'var(--color-contents-contents-sub)', fontSize: 13, marginTop: 2 }}>
              좁은 것이 이깁니다: 전문가 지정 &gt; 카테고리 지정 &gt; 기본. 기본 요율은 임의로 산정한
              값이며 경영 확정 시 여기서 바꿉니다.
            </div>
          </div>
          <Button onClick={() => setEditing({ scope: 'expert', scopeId: '', rate: '20', note: '' })}>
            정책 추가
          </Button>
        </div>

        {!policies && <Skeleton height="80px" />}
        {policies && (
          <div className="sg-table-wrap">
            <table className="sg-table">
              <thead>
                <tr>
                  <th>적용 대상</th>
                  <th>대상</th>
                  <th className="sg-num">수수료율</th>
                  <th>메모</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id}>
                    <td>{SCOPE[p.scope] ?? p.scope}</td>
                    <td>{p['scope-id'] ?? '—'}</td>
                    <td className="sg-num">{pct(p.rate)}</td>
                    <td style={{ color: 'var(--color-contents-contents-sub)' }}>{p.note ?? '—'}</td>
                    <td>
                      <Button
                        size="s"
                        onClick={() =>
                          setEditing({
                            scope: p.scope,
                            scopeId: p['scope-id'] ?? '',
                            rate: String(p.rate * 100),
                            note: p.note ?? '',
                          })
                        }
                      >
                        수정
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div style={{ marginBottom: 12 }}>
          <b>월 마감</b>
          <div style={{ color: 'var(--color-contents-contents-sub)', fontSize: 13, marginTop: 2 }}>
            마감하면 금액이 그때로 고정됩니다. 먼저 미리보기로 확인하세요.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={expertId} onChange={(e) => setExpertId(e.target.value)} style={inputStyle}>
            <option value="">전문가 선택</option>
            {experts.map((e) => (
              <option key={e.id} value={e.id}>
                {e['business-info']?.['business-name'] ?? e.id.slice(0, 8)}
              </option>
            ))}
          </select>
          <input
            value={year}
            inputMode="numeric"
            onChange={(e) => setYear(Number(e.target.value) || year)}
            style={{ ...inputStyle, width: 90 }}
          />
          <input
            value={month}
            inputMode="numeric"
            onChange={(e) => setMonth(Number(e.target.value) || month)}
            style={{ ...inputStyle, width: 70 }}
          />
          <Button
            disabled={!expertId || busy}
            onClick={() =>
              run(async () => setPreview(await api.settlementPreview(expertId, year, month)), '미리보지 못했어요.')
            }
          >
            미리보기
          </Button>
          <Button
            variant="primary"
            disabled={!expertId || busy}
            onClick={() => run(() => api.closeSettlement(expertId, year, month), '마감하지 못했어요.')}
          >
            마감
          </Button>
        </div>

        {preview && (
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 12 }}>
            {[
              ['건수', String(preview['total-orders'])],
              ['매출', won(preview['total-revenue'])],
              [`플랫폼 수수료 (${pct(preview['commission-rate'])})`, won(preview['platform-fee'])],
              // PG 수수료는 카드사가 떼어 간 돈이다. 우리 몫이 아니라서 따로 적는다.
              ['PG 수수료 (카드사)', won(preview['payment-fee'])],
              ['원천징수', won(preview['tax-amount'])],
              ['실지급액', won(preview['net-amount'])],
            ].map(([k, v]) => (
              <div key={k} style={{ padding: 12, borderRadius: 'var(--rd-12)', background: 'var(--color-background-elevation-2)' }}>
                <div style={{ fontSize: 12, color: 'var(--color-contents-contents-sub)' }}>{k}</div>
                <div style={{ fontWeight: 700, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div style={{ marginBottom: 12 }}>
          <b>정산서</b>
        </div>
        {!rows && <Skeleton height="120px" />}
        {rows?.length === 0 && <Empty title="정산서가 없어요." />}
        {rows && rows.length > 0 && (
          <div className="sg-table-wrap">
            <table className="sg-table">
              <thead>
                <tr>
                  <th>정산번호</th>
                  <th>기간</th>
                  <th className="sg-num">건수</th>
                  <th className="sg-num">매출</th>
                  <th className="sg-num">수수료율</th>
                  <th className="sg-num">실지급</th>
                  <th>상태</th>
                  <th>다음</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>{s['settlement-number']}</td>
                    <td>{String(s['period-start'] ?? '').slice(0, 7)}</td>
                    <td className="sg-num">{s['total-orders']}</td>
                    <td className="sg-num">{won(s['total-revenue'])}</td>
                    <td className="sg-num">{pct(s['commission-rate'])}</td>
                    <td className="sg-num">
                      <b>{won(s['net-amount'])}</b>
                    </td>
                    <td>{STATUS[s.status] ?? s.status}</td>
                    <td>
                      {s.status === 'pending' && (
                        <Button size="s" variant="primary" loading={busy} onClick={() => run(() => api.settlementAction(s.id, 'approve'), '승인하지 못했어요.')}>
                          승인
                        </Button>
                      )}
                      {s.status === 'approved' && (
                        <Button size="s" loading={busy} onClick={() => run(() => api.settlementAction(s.id, 'pay'), '기록하지 못했어요.')}>
                          지급 완료
                        </Button>
                      )}
                      {(s.status === 'paid' || s.status === 'cancelled') && (
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
        open={editing != null}
        onClose={() => setEditing(null)}
        title="수수료율"
        actions={
          <Button
            variant="primary"
            loading={busy}
            onClick={() =>
              run(async () => {
                await api.setCommission(
                  editing!.scope,
                  Number(editing!.rate),
                  editing!.scope === 'default' ? undefined : editing!.scopeId,
                  editing!.note || undefined,
                );
                setEditing(null);
              }, '저장하지 못했어요.')
            }
          >
            저장
          </Button>
        }
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>적용 대상</span>
              <select
                value={editing.scope}
                onChange={(e) => setEditing({ ...editing, scope: e.target.value })}
                style={inputStyle}
              >
                <option value="default">기본 (전체)</option>
                <option value="expert">전문가 지정</option>
                <option value="category">카테고리 지정</option>
              </select>
            </label>

            {editing.scope !== 'default' && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontWeight: 600 }}>대상 ID</span>
                <input
                  value={editing.scopeId}
                  onChange={(e) => setEditing({ ...editing, scopeId: e.target.value })}
                  style={inputStyle}
                />
              </label>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>수수료율 (%)</span>
              {/* 퍼센트로 입력받는다. 사람은 20 을 입력하지 0.2 를 입력하지 않는다.
                  상한 50 은 서버에도 있다 — 오타 하나로 전문가가 한 달치 매출을 잃으면 안 된다. */}
              <input
                value={editing.rate}
                inputMode="decimal"
                onChange={(e) => setEditing({ ...editing, rate: e.target.value })}
                style={inputStyle}
              />
              <span style={{ fontSize: 12, color: 'var(--color-contents-contents-sub)' }}>
                0~50% 사이. 다음 정산부터 적용됩니다 (이미 마감된 정산서는 바뀌지 않습니다).
              </span>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>메모</span>
              <input
                value={editing.note}
                placeholder="왜 이 요율인지 — 나중에 아무도 기억하지 못한다"
                onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                style={inputStyle}
              />
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 'var(--sp-12)',
  borderRadius: 'var(--rd-12)',
  border: '1px solid var(--color-divider-divider)',
  background: 'var(--color-background-elevation-1)',
  color: 'var(--color-contents-contents)',
  font: 'inherit',
};
