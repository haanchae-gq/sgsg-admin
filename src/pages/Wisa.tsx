import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Modal, Skeleton } from '@sgsg/design/components';
import { api, ApiError } from '../api';

/**
 * 위사 커넥터.
 *
 * 두 가지가 여기 있다. **상품↔서비스 매핑** — 이게 없으면 주문을 받아도 무슨 일을
 * 해야 하는지 모른다. 그리고 **읽지 못한 주문** — 하나하나가 결제를 마치고 기다리는
 * 사람이다. 조용히 버려지면 아무도 찾아가지 않는다.
 */
export default function Wisa() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [mappings, setMappings] = useState<any[] | null>(null);
  const [failures, setFailures] = useState<any[] | null>(null);
  const [services, setServices] = useState<any[]>([]);
  const [editing, setEditing] = useState<{ pno: string; serviceItemId: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, m, f, sv] = await Promise.all([
        api.wisaStatus(),
        api.wisaMappings(),
        api.wisaFailures(),
        api.services(),
      ]);
      setEnabled(s.enabled);
      setMappings(m);
      setFailures(f);
      setServices(sv);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '불러오지 못했어요.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sync() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const r = await api.wisaSync();
      setMsg(`가져옴 ${r.fetched}건 · 새로 만듦 ${r.created}건 · 이미 있음 ${r.skipped}건 · 읽지 못함 ${r.failed}건`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '가져오지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  async function saveMapping() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await api.setWisaMapping(Number(editing.pno), editing.serviceItemId, editing.note || undefined);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>위사몰 커넥터</h1>
        <Button variant="primary" loading={busy} disabled={!enabled} onClick={sync}>
          지금 가져오기
        </Button>
      </div>

      {enabled === false && (
        <Alert
          type="warning"
          title="커넥터가 꺼져 있어요."
          description="WISA_BASE_URL / WISA_MNG_ID / WISA_MNG_PW 가 설정되지 않았습니다. 주문을 가져오지도, 상태를 회신하지도 않습니다."
        />
      )}

      {msg && <Alert type="success" title={msg} />}
      {error && <Alert type="danger" title={error} />}

      {/* 읽지 못한 주문을 먼저 보여 준다. 매핑보다 급하다 — 사람이 기다리고 있다. */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <b>읽지 못한 주문</b>
          <span style={{ color: 'var(--color-contents-contents-sub)', fontSize: 13 }}>
            결제를 마치고 기다리는 사람들입니다
          </span>
        </div>

        {!failures && <Skeleton height="80px" />}
        {failures?.length === 0 && <Empty title="읽지 못한 주문이 없어요." />}

        {failures && failures.length > 0 && (
          <div className="sg-table-wrap">
            <table className="sg-table">
              <thead>
                <tr>
                  <th>위사 주문</th>
                  <th>이유</th>
                  <th>들어온 때</th>
                </tr>
              </thead>
              <tbody>
                {failures.map((f) => (
                  <tr key={f.id}>
                    <td>{f['external-ref']}</td>
                    <td style={{ color: 'var(--color-individuals-danger)' }}>{f.reason}</td>
                    <td>{String(f['created-at'] ?? '').slice(0, 16).replace('T', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <b>상품 ↔ 서비스 매핑</b>
            <div style={{ color: 'var(--color-contents-contents-sub)', fontSize: 13, marginTop: 2 }}>
              위사의 상품번호(pno)가 우리의 어떤 서비스인지. 이게 없으면 주문을 받아도 무슨 일을
              해야 하는지 모릅니다.
            </div>
          </div>
          <Button onClick={() => setEditing({ pno: '', serviceItemId: '', note: '' })}>매핑 추가</Button>
        </div>

        {!mappings && <Skeleton height="80px" />}
        {mappings?.length === 0 && <Empty title="아직 매핑이 없어요." description="위사 상품번호와 서비스를 연결해 주세요." />}

        {mappings && mappings.length > 0 && (
          <div className="sg-table-wrap">
            <table className="sg-table">
              <thead>
                <tr>
                  <th>위사 상품번호</th>
                  <th>우리 서비스</th>
                  <th>메모</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.id}>
                    <td>{m.pno}</td>
                    <td>{m['service-name']}</td>
                    <td style={{ color: 'var(--color-contents-contents-sub)' }}>{m.note ?? '—'}</td>
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
        title="상품 매핑"
        actions={
          <Button variant="primary" loading={busy} onClick={saveMapping}>
            저장
          </Button>
        }
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>위사 상품번호 (pno)</span>
              <input
                value={editing.pno}
                inputMode="numeric"
                onChange={(e) => setEditing({ ...editing, pno: e.target.value })}
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>연결할 서비스</span>
              <select
                value={editing.serviceItemId}
                onChange={(e) => setEditing({ ...editing, serviceItemId: e.target.value })}
                style={inputStyle}
              >
                <option value="">고르세요</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>메모</span>
              <input
                value={editing.note}
                placeholder="나중에 아무도 기억하지 못한다"
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
