import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Modal, Skeleton } from '@sgsg/design/components';
import { api, ApiError } from '../api';

const won = (n: number) => `${Math.round(n ?? 0).toLocaleString('ko-KR')}원`;

/**
 * 서비스 카탈로그.
 *
 * **소비자웹이 이 표를 그대로 그린다.** 여기 없는 서비스는 아무도 주문할 수 없고,
 * 여기 가격이 곧 고객이 보는 가격이다 — 지금 DB 에 있는 것은 시드 데이터라서,
 * 실제 상품을 넣기 전에는 소비자웹이 데모로만 보인다.
 *
 * 서비스를 지우지 않는다. **내린다**(비활성). 지나간 주문이 그 서비스를 가리키고
 * 있고, 그것까지 사라지면 정산이 설명되지 않는다.
 */
type Item = {
  id: string;
  name: string;
  description?: string;
  'base-price': number;
  'category-id': string;
  'is-active': boolean;
};

export default function Catalog() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [cats, setCats] = useState<any[]>([]);
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [i, c] = await Promise.all([api.services(), api.categories()]);
      setItems(i as Item[]);
      setCats(c);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '불러오지 못했어요.');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: editing.name,
        description: editing.description,
        'base-price': Number(editing['base-price']),
        'category-id': editing['category-id'],
        'is-active': editing['is-active'] ?? true,
      };
      if (editing.id) await api.updateItem(editing.id, body);
      else await api.createItem(body);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>서비스</h1>
        <Button
          variant="primary"
          onClick={() => setEditing({ name: '', 'base-price': 0, 'category-id': cats[0]?.id, 'is-active': true })}
        >
          서비스 추가
        </Button>
      </div>

      <Alert
        type="info"
        title="소비자웹이 이 표를 그대로 그립니다."
        description="여기 없는 서비스는 아무도 주문할 수 없고, 여기 가격이 곧 고객이 보는 가격입니다."
      />

      {error && <Alert type="danger" title={error} />}

      <Card>
        {!items && <Skeleton height="200px" />}
        {items?.length === 0 && <Empty title="등록된 서비스가 없어요." />}

        {items && items.length > 0 && (
          <div className="sg-table-wrap">
            <table className="sg-table">
              <thead>
                <tr>
                  <th>서비스</th>
                  <th>카테고리</th>
                  <th className="sg-num">기본가</th>
                  <th>노출</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <b>{it.name}</b>
                      <div style={{ fontSize: 13, color: 'var(--color-contents-contents-sub)' }}>
                        {it.description}
                      </div>
                    </td>
                    <td>{catName(it['category-id'])}</td>
                    <td className="sg-num">{won(it['base-price'])}</td>
                    <td>{it['is-active'] ? '노출 중' : '내림'}</td>
                    <td>
                      <Button size="s" onClick={() => setEditing(it)}>
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

      <Modal
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing?.id ? '서비스 수정' : '서비스 추가'}
        actions={
          <Button variant="primary" loading={busy} disabled={!editing?.name} onClick={save}>
            저장
          </Button>
        }
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>이름</span>
              <input
                value={editing.name ?? ''}
                placeholder="예: 에어컨 클리닝"
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>설명</span>
              <input
                value={editing.description ?? ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>카테고리</span>
              <select
                value={editing['category-id'] ?? ''}
                onChange={(e) => setEditing({ ...editing, 'category-id': e.target.value })}
                style={inputStyle}
              >
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>기본가 (원)</span>
              <input
                value={String(editing['base-price'] ?? 0)}
                inputMode="numeric"
                onChange={(e) => setEditing({ ...editing, 'base-price': Number(e.target.value) || 0 })}
                style={inputStyle}
              />
              <span style={{ fontSize: 12, color: 'var(--color-contents-contents-sub)' }}>
                고객에게는 하한가로 보입니다. 현장 추가비용은 전문가가 동의를 받고 붙입니다.
              </span>
            </label>

            {/* 지우지 않는다. 내린다 — 지나간 주문이 이 서비스를 가리키고 있다. */}
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={editing['is-active'] ?? true}
                onChange={(e) => setEditing({ ...editing, 'is-active': e.target.checked })}
              />
              <span>소비자웹에 노출</span>
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
