import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Card, Empty, Skeleton } from '@sgsg/design/components';
import { api, ApiError } from '../api';

/**
 * 배정 현황.
 *
 * 이 화면이 답하는 질문: **보냈는데 답이 없는 배정이 무엇인가.**
 *
 * 배정은 시간이 지나면 만료되고 다시 배정된다. 그 사이 고객은 아무것도 모른 채
 * 기다린다 — 그래서 '보냄' 상태가 오래된 순으로 위에 온다.
 *
 * '거절'이라는 말을 쓰지 않는다. 전문가가 받지 않은 것은 실패가 아니다 (용어 사전).
 */
const RESULT_LABEL: Record<string, string> = {
  sent: '응답 대기',
  accepted: '수락',
  hold: '보류',
  rejected: '수락 안 함',
  expired: '시간 초과',
  transferred: '이관',
};

export default function Assignments() {
  const nav = useNavigate();
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.assignments({}));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '불러오지 못했어요.');
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 답이 없는 것부터. 그 아래가 나머지다.
  const waiting = (rows ?? []).filter((r) => r['assignment-result-status'] === 'sent');
  const rest = (rows ?? []).filter((r) => r['assignment-result-status'] !== 'sent');

  const table = (list: any[]) => (
    <div className="sg-table-wrap">
      <table className="sg-table">
        <thead>
          <tr>
            <th>주문</th>
            <th>전문가</th>
            <th>배정 방식</th>
            <th>결과</th>
            <th>보낸 때</th>
          </tr>
        </thead>
        <tbody>
          {list.map((a) => (
            <tr
              key={a.id}
              onClick={() => nav(`/orders/${a['order-id']}`)}
              style={{ cursor: 'pointer' }}
            >
              <td>{a['order-id']?.slice(0, 8)}…</td>
              <td>{a['assigned-master-id']?.slice(0, 8) ?? '-'}…</td>
              <td>{a['assignment-type'] === 'auto-assign' ? '자동' : '수동'}</td>
              <td>{RESULT_LABEL[a['assignment-result-status']] ?? a['assignment-result-status']}</td>
              <td>{String(a['assigned-at'] ?? '').slice(0, 16).replace('T', ' ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>배정</h1>

      {error && <Alert type="danger" title={error} />}
      {!rows && <Skeleton height="200px" />}

      {rows && (
        <>
          <Card>
            <div style={{ marginBottom: 12 }}>
              <b>전문가 응답 대기</b>
              <div style={{ color: 'var(--color-contents-contents-sub)', fontSize: 13, marginTop: 2 }}>
                보냈지만 아직 답이 없는 배정입니다. 오래 걸리면 고객이 기다립니다.
              </div>
            </div>
            {waiting.length === 0 ? <Empty title="응답을 기다리는 배정이 없어요." /> : table(waiting)}
          </Card>

          <Card>
            <div style={{ marginBottom: 12 }}>
              <b>지난 배정</b>
            </div>
            {rest.length === 0 ? <Empty title="배정 이력이 없어요." /> : table(rest)}
          </Card>
        </>
      )}
    </div>
  );
}
