import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Modal, Skeleton } from '@sgsg/design/components';
import { api, ApiError } from '../api';

const won = (n: number) => `${Math.round(n ?? 0).toLocaleString('ko-KR')}원`;

const TYPE: Record<string, string> = { deposit: '계약금', balance: '잔금', full: '전액' };
const STATUS: Record<string, string> = {
  pending: '결제 대기',
  completed: '결제 완료',
  failed: '결제 안 됨',
  cancelled: '취소',
  refunding: '환불 중',
  refunded: '환불 완료',
};

/**
 * 결제.
 *
 * 여기서 하는 일은 사실상 **환불** 하나다. 결제는 고객이 하고, PG 가 처리한다.
 * 운영자가 손을 대는 순간은 무언가 잘못됐을 때뿐이다.
 *
 * 그래서 환불은 이유 없이 못 한다. 돈을 되돌린 기록에 왜가 없으면, 한 달 뒤에 아무도
 * 설명하지 못한다.
 */
export default function Payments() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [status, setStatus] = useState<string>('');
  const [refunding, setRefunding] = useState<{ p: any; amount: string; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    try {
      setRows(await api.payments(status ? { status } : {}));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '불러오지 못했어요.');
      setRows([]);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refund() {
    if (!refunding) return;
    setBusy(true);
    setError(null);
    try {
      await api.refund(refunding.p.id, Number(refunding.amount), refunding.reason);
      setRefunding(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '환불하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>결제</h1>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          ['', '전체'],
          ['completed', '결제 완료'],
          ['pending', '결제 대기'],
          ['refunded', '환불 완료'],
        ].map(([k, label]) => (
          <Button key={k || 'all'} size="s" variant={status === k ? 'primary' : 'secondary'} onClick={() => setStatus(k)}>
            {label}
          </Button>
        ))}
      </div>

      {error && <Alert type="danger" title={error} />}

      <Card>
        {!rows && <Skeleton height="200px" />}
        {rows?.length === 0 && <Empty title="결제 내역이 없어요." />}

        {rows && rows.length > 0 && (
          <div className="sg-table-wrap">
            <table className="sg-table">
              <thead>
                <tr>
                  <th>결제번호</th>
                  <th>주문</th>
                  <th>종류</th>
                  <th className="sg-num">금액</th>
                  <th>상태</th>
                  <th>결제일</th>
                  <th>다음</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>{p['payment-number']?.value ?? p['payment-number'] ?? '-'}</td>
                    <td>{String(p['order-id'] ?? '').slice(0, 8)}…</td>
                    <td>{TYPE[p['payment-type']] ?? p['payment-type']}</td>
                    <td className="sg-num">{won(p.amount)}</td>
                    <td>{STATUS[p.status] ?? p.status}</td>
                    <td>{String(p['paid-at'] ?? '').slice(0, 10) || '—'}</td>
                    <td>
                      {p.status === 'completed' ? (
                        <Button
                          size="s"
                          variant="danger"
                          onClick={() => setRefunding({ p, amount: String(Math.round(p.amount)), reason: '' })}
                        >
                          환불
                        </Button>
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
        open={refunding != null}
        onClose={() => setRefunding(null)}
        title="환불"
        description="돈을 되돌리는 기록입니다. 왜 환불하는지 남기지 않으면 한 달 뒤에 아무도 설명하지 못합니다."
        actions={
          <Button variant="danger" loading={busy} disabled={!refunding?.reason} onClick={refund}>
            환불하기
          </Button>
        }
      >
        {refunding && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>환불 금액</span>
              {/* 부분 환불이 가능하다. 기본값은 전액이고, 서버가 결제액을 넘는 환불을 막는다. */}
              <input
                value={refunding.amount}
                inputMode="numeric"
                onChange={(e) => setRefunding({ ...refunding, amount: e.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>환불 사유</span>
              <input
                value={refunding.reason}
                placeholder="예: 고객 요청 (방문 전 취소)"
                onChange={(e) => setRefunding({ ...refunding, reason: e.target.value })}
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
