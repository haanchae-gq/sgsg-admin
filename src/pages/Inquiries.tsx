import { useEffect, useState } from 'react';
import { Alert, Card, Empty, Skeleton } from '@sgsg/design/components';
import { api, ApiError } from '../api';

const SOURCE: Record<string, string> = { slack: '슬랙 (#inquiry_헤이홈케어)', web: '소비자웹', manual: '직접 입력' };

/**
 * 문의.
 *
 * 슬랙 #inquiry_헤이홈케어 채널의 Tally 폼이 여기로 들어온다. 하나하나가 **연락을
 * 기다리는 사람**이다 — 폼을 낸 사람은 이미 우리에게 말을 걸었다.
 */
export default function Inquiries() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .inquiries()
      .then(setRows)
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : '불러오지 못했어요.');
        setRows([]);
      });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>문의</h1>

      {error && <Alert type="danger" title={error} />}

      <Card>
        {!rows && <Skeleton height="200px" />}
        {rows?.length === 0 && <Empty title="문의가 없어요." />}

        {rows && rows.length > 0 && (
          <div className="sg-table-wrap">
            <table className="sg-table">
              <thead>
                <tr>
                  <th>들어온 곳</th>
                  <th>서비스</th>
                  <th>내용</th>
                  <th>상태</th>
                  <th>들어온 때</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((q) => (
                  <tr key={q.id}>
                    <td>{SOURCE[q.source] ?? q.source ?? '-'}</td>
                    <td>{q['service-label'] ?? '-'}</td>
                    <td style={{ maxWidth: 380 }}>{q['inquiry-message'] ?? '-'}</td>
                    <td>{q['converted-order-id'] ? '주문으로 전환' : (q.status ?? '-')}</td>
                    <td>{String(q['created-at'] ?? '').slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
