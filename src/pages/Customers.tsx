import { useEffect, useState } from 'react';
import { Alert, Card, Empty, Skeleton } from '@sgsg/design/components';
import { api, ApiError } from '../api';

/**
 * 고객.
 *
 * 여기서 고객을 만들지 않는다. 고객은 **주문할 때 생긴다** — 소비자웹 OTP 로그인,
 * 위사몰 주문, 슬랙 문의 어디서 왔든 전화번호가 열쇠다. 같은 번호는 같은 사람이다.
 *
 * 그래서 이 화면은 읽기다. 여기서 손으로 만든 고객은 어느 주문에도 붙지 않는다.
 */
export default function Customers() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .customers()
      .then(setRows)
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : '불러오지 못했어요.');
        setRows([]);
      });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>고객</h1>

      {error && <Alert type="danger" title={error} />}

      <Card>
        <div style={{ color: 'var(--color-contents-contents-sub)', fontSize: 13, marginBottom: 12 }}>
          고객은 주문할 때 생깁니다. 전화번호가 열쇠이고, 같은 번호는 같은 사람입니다.
        </div>

        {!rows && <Skeleton height="200px" />}
        {rows?.length === 0 && <Empty title="고객이 없어요." />}

        {rows && rows.length > 0 && (
          <div className="sg-table-wrap">
            <table className="sg-table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>전화번호</th>
                  <th>가입 계정</th>
                  <th>등록일</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>{c['customer-name'] ?? '-'}</td>
                    <td>{c['primary-phone'] ?? '-'}</td>
                    {/* 계정 없이 존재하는 고객이 있다. 위사에서 산 사람, 운영자가
                        받아 적은 사람 — 나중에 같은 번호로 로그인하면 이어 붙는다. */}
                    <td>{c['account-id'] ? '있음' : '없음 (주문만)'}</td>
                    <td>{String(c['created-at'] ?? '').slice(0, 10)}</td>
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
