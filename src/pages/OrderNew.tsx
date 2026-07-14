import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Text } from '@sgsg/design/components';
import { api, ApiError } from '../api';

/**
 * 손으로 접수한 주문.
 *
 * 주문은 대부분 위사몰·소비자웹·슬랙 문의로 들어온다. 그래도 **전화로 들어오는 건이
 * 남는다** — 그걸 넣을 데가 없으면 운영자는 주문을 못 받는다.
 *
 * ## CSV 를 같이 두는 이유
 *
 * 제휴사에서 엑셀로 스무 건씩 보내온다. 한 건씩 스무 번 타이핑하면 오타가 나고, 오타가
 * 난 주소는 지오코딩이 실패하고, 그 주문은 거리·동선 계산에서 조용히 빠진다.
 *
 * ## 실패한 줄을 감추지 않는다
 *
 * 서버는 줄마다 성공/실패를 돌려준다. "20건 중 17건 등록"만 말하고 끝내면 운영자는
 * **어느 3건이 빠졌는지 모른 채** 다음 일로 넘어간다. 그 3건의 고객은 아무도 안 온다.
 */

type Item = { id: string; name: string; 'base-price'?: number };

const CSV_HEADER = 'customer-name,phone,service-item-id,address1,address2,requested-date,base-price,notes';
const CSV_SAMPLE = `${CSV_HEADER}
홍길동,010-1234-5678,<서비스ID>,서울 강남구 강남대로 396,3층,2026-07-21 10:00,79000,벽걸이 1대`;

export default function OrderNew() {
  const nav = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState<{ total: number; created: number; failed: number; errors: string[] } | null>(null);

  const [f, setF] = useState({
    customerName: '',
    phone: '',
    serviceItemId: '',
    address1: '',
    address2: '',
    requestedDate: '',
    basePrice: '',
    notes: '',
  });

  useEffect(() => {
    api
      .services()
      .then((d: any) => setItems(d as Item[]))
      .catch(() => setItems([]));
  }, []);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function submit() {
    setErr(null);
    setOk(null);
    if (!f.customerName.trim() || !f.phone.trim()) return setErr('고객 이름과 연락처는 있어야 해요.');
    if (!f.serviceItemId) return setErr('서비스를 골라 주세요.');
    if (!f.address1.trim()) return setErr('주소가 없으면 전문가가 갈 데를 모릅니다.');

    setBusy(true);
    try {
      const item = items.find((i) => i.id === f.serviceItemId);
      // 주문에는 고객이 먼저 있어야 한다 (orders.customer_id 는 NOT NULL).
      const customerId = await api.createOrFindCustomer(f.customerName.trim(), f.phone.trim());
      const created: any = await api.createOrder({
        'customer-id': customerId,
        'customer-snapshot': { 'customer-name': f.customerName.trim(), 'primary-phone': f.phone.trim() },
        'service-item-id': f.serviceItemId,
        'service-name': item?.name,
        'service-address': { address1: f.address1.trim(), address2: f.address2.trim() || null },
        'requested-date': f.requestedDate || null,
        'base-price': f.basePrice ? Number(f.basePrice) : (item?.['base-price'] ?? 0),
        'customer-notes': f.notes.trim() || null,
        'channel-code': 'manual',
      });
      if (created?.id) nav(`/orders/${created.id}`);
      else setOk('등록했어요.');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '등록하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    // BOM 을 붙인다 — 없으면 엑셀이 한글을 깨뜨려 열고, 운영자는 우리 탓이라고 생각한다.
    const blob = new Blob(['﻿' + CSV_SAMPLE], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sgsg-orders-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function upload(file: File) {
    setErr(null);
    setBulk(null);
    setBusy(true);
    try {
      const text = await file.text();
      const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
      const head = lines[0].split(',').map((h) => h.trim());
      const parsed = lines.slice(1).map((l) => {
        const cells = l.split(',');
        const r: Record<string, string> = {};
        head.forEach((h, i) => (r[h] = (cells[i] ?? '').trim()));
        return r;
      });
      // 줄마다 고객이 먼저 있어야 한다. 순차로 만든다 — 같은 번호가 두 줄에 있으면
      // 병렬로 돌릴 때 같은 고객이 두 번 생긴다.
      const rows: unknown[] = [];
      for (const r of parsed) {
        const customerId = await api.createOrFindCustomer(r['customer-name'], r.phone);
        rows.push({
          'customer-id': customerId,
          'customer-snapshot': { 'customer-name': r['customer-name'], 'primary-phone': r.phone },
          'service-item-id': r['service-item-id'],
          'service-address': { address1: r.address1, address2: r.address2 || null },
          'requested-date': r['requested-date'] || null,
          'base-price': r['base-price'] ? Number(r['base-price']) : 0,
          'customer-notes': r.notes || null,
          'channel-code': 'bulk',
        });
      }
      if (rows.length === 0) return setErr('빈 파일이에요.');
      const res: any = await api.createOrder({ rows });
      setBulk(res);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '파일을 읽지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button variant="ghost" size="s" onClick={() => nav('/orders')}>
          ‹ 목록
        </Button>
        <Text variable="heading3">주문 등록</Text>
      </div>

      {err && <Alert type="danger" title={err} />}
      {ok && <Alert type="success" title={ok} />}

      <Card>
        <Text variable="heading4">한 건 접수</Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <Field label="고객 이름" value={f.customerName} onChange={set('customerName')} />
          <Field label="연락처" value={f.phone} onChange={set('phone')} placeholder="010-0000-0000" />

          <div style={{ gridColumn: '1 / -1' }}>
            <Label>서비스</Label>
            <select
              value={f.serviceItemId}
              onChange={set('serviceItemId')}
              style={inputStyle}
            >
              <option value="">서비스를 고르세요</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} {i['base-price'] ? `(${i['base-price'].toLocaleString()}원)` : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="주소" value={f.address1} onChange={set('address1')} placeholder="서울 강남구 강남대로 396" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            {/* 상세주소는 전문가가 현장에서 읽는다. 지오코더에는 안 넘긴다 — '3층'은 지도에 없다. */}
            <Field label="상세주소" value={f.address2} onChange={set('address2')} placeholder="동·호수·출입방법" />
          </div>

          <Field label="희망일" value={f.requestedDate} onChange={set('requestedDate')} placeholder="2026-07-21 10:00" />
          <Field label="기본가 (비우면 서비스 가격)" value={f.basePrice} onChange={set('basePrice')} />

          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="고객 요청사항" value={f.notes} onChange={set('notes')} />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <Button disabled={busy} onClick={submit}>
            등록
          </Button>
        </div>
      </Card>

      <Card>
        <Text variable="heading4">여러 건 (CSV)</Text>
        <Text variable="body2" tone="sub">
          제휴사에서 엑셀로 보내온 건을 한 번에 넣습니다. 템플릿을 받아 그대로 채우세요.
        </Text>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <Button variant="secondary" size="s" onClick={downloadTemplate}>
            템플릿 받기
          </Button>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = '';
            }}
            style={{ font: 'inherit', color: 'var(--color-contents-contents-sub)' }}
          />
        </div>

        {bulk && (
          <div style={{ marginTop: 12 }}>
            <Alert
              type={bulk.failed > 0 ? 'warning' : 'success'}
              title={`${bulk.total}건 중 ${bulk.created}건 등록${bulk.failed > 0 ? `, ${bulk.failed}건 실패` : ''}`}
            />
            {/* ★ 실패한 줄을 감추지 않는다. "17건 등록" 만 말하고 끝내면 운영자는 어느
                3건이 빠졌는지 모른 채 넘어가고, 그 3건의 고객에게는 아무도 안 온다. */}
            {bulk.errors?.length > 0 && (
              <ul style={{ marginTop: 8, paddingLeft: 18, color: 'var(--color-individuals-danger)', fontSize: 13 }}>
                {bulk.errors.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 'var(--rd-8)',
  border: '1px solid var(--color-divider-divider)',
  background: 'var(--color-background-elevation-1)',
  color: 'var(--color-contents-contents)',
  font: 'inherit',
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <Text variable="body2" tone="sub">
        {children}
      </Text>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input value={value} onChange={onChange} placeholder={placeholder} style={inputStyle} />
    </div>
  );
}
