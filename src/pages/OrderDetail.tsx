import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Skeleton, Tag, Text } from '@sgsg/design/components';
import { api, ApiError, type ExitReason, type Order } from '../api';
import { ExitReasonModal } from '../ExitReasonModal';
import { progressLabel, statusLabel } from '../status';
import AssignModal from '../AssignModal';

type ExitKind = 'cancel' | 'recall' | 'unassigned';

/**
 * 주문 하나. **여기서 주문을 끝까지 몰고 간다.**
 *
 * 이 화면이 없어서 React 관리자로는 주문을 배정까지만 하고 손을 뗄 수밖에 없었다 —
 * 전달·진행 시작·서비스 완료·구매확정 버튼이 옛 CLJS 관리자에만 있었다. 운영자는 그
 * 버튼 하나 누르려고 다른 관리자를 열어야 했고, 그쪽의 취소 버튼은 고장나 있었다.
 *
 * ## 다음 한 걸음만 크게 보여 준다
 *
 * 상태 기계가 허용하는 전이는 여럿이지만, **보통 다음에 할 일은 하나**다. 그걸 크게
 * 놓고 나머지는 작게 둔다. 버튼 열두 개를 나란히 놓으면 운영자는 매번 읽고 고민한다.
 */

/** 주문 상태 → 지금 보통 할 일. 상태 기계(state_machine.clj)와 같은 순서다. */
const NEXT: Record<string, { label: string; run: (id: string) => Promise<unknown> } | undefined> = {
  new: { label: '주문 확인', run: (id) => api.checkOrder(id) },
  'expert-in-progress': { label: '서비스 완료 처리', run: (id) => api.completeOrder(id) },
  'service-completed': { label: '구매 확정', run: (id) => api.confirmOrder(id) },
};

const won = (n?: number | null) => (n == null ? '-' : `${n.toLocaleString()}원`);

export default function OrderDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [o, setO] = useState<Order | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exit, setExit] = useState<ExitKind | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      setO(await api.order(id));
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '주문을 불러오지 못했어요.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 모든 버튼이 이걸 지난다. **실패를 삼키지 않는다** — 삼키면 운영자는 눌렀는데
      아무 일도 안 일어난 화면을 보고, 한 번 더 누른다. */
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '처리하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  if (!o && !err) return <Skeleton height="240px" />;
  if (!o) return <Alert type="danger" title={err ?? '주문을 찾을 수 없어요.'} />;

  const st = String(o.status);
  const next = NEXT[st];
  const done = st === 'cancelled' || st === 'refunded' || st === 'purchase-confirmed';
  const assigned = Boolean((o as any)['expert-id']);
  const addr = (o as any)['service-address'] ?? {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button variant="ghost" size="s" onClick={() => nav('/orders')}>
          ‹ 목록
        </Button>
        <Text variable="heading3">{plain((o as any)['order-number']) ?? o.id}</Text>
        <Tag>{statusLabel(st)}</Tag>
      </div>

      {err && <Alert type="danger" title={err} />}

      {/* 다음 한 걸음. 크게. */}
      {!done && (
        <Card>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {next && (
              <Button disabled={busy} onClick={() => act(() => next.run(o.id))}>
                {next.label}
              </Button>
            )}

            {/* 배정 — 확인된 뒤부터. 후보 추천이 붙는다(거리·점수·신뢰). */}
            {(st === 'checked' || st === 'unassigned' || st === 'recalled' || st === 'assigned') && (
              <>
                <Button
                  variant={st === 'assigned' ? 'secondary' : 'primary'}
                  disabled={busy}
                  onClick={() => setAssigning(true)}
                >
                  {st === 'assigned' ? '재배정' : '전문가 배정'}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => act(() => api.autoAssign(o.id))}>
                  자동 배정
                </Button>
              </>
            )}

            {/* 배정 후: 전문가에게 전달하고, 작업을 시작시킨다. */}
            {st === 'assigned' && (
              <>
                <Button variant="secondary" disabled={busy} onClick={() => act(() => api.deliverOrder(o.id))}>
                  전문가에게 전달
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => act(() => api.startOrder(o.id))}>
                  작업 시작
                </Button>
              </>
            )}

            <div style={{ flex: 1 }} />

            {/* 내보내는 길. **셀 수 있는 사유 없이는 못 나간다.** */}
            {assigned && st !== 'recalled' && (
              <Button variant="secondary" disabled={busy} onClick={() => setExit('recall')}>
                회수
              </Button>
            )}
            <Button variant="danger" disabled={busy} onClick={() => setExit('cancel')}>
              취소
            </Button>
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <Text variable="heading4">서비스</Text>
          <Row k="서비스" v={(o as any)['service-name']} />
          <Row k="희망일" v={fmt((o as any)['requested-date'])} />
          <Row k="확정일" v={fmt((o as any)['confirmed-date'])} />
          <Row k="주소" v={addr.address1} />
          <Row k="상세" v={addr.address2} />
          <Row k="고객 요청" v={(o as any)['customer-notes']} />
        </Card>

        <Card>
          <Text variable="heading4">금액</Text>
          <Row k="기본가" v={won((o as any)['base-price'])} />
          <Row k="현장 추가" v={won((o as any)['on-site-costs'] ?? (o as any)['onsite-costs'])} />
          <Row k="총액" v={won(o.cost?.['total-amount'])} />
          <Row k="결제됨" v={won(o.cost?.['paid-amount'])} />
          <Row k="미수금" v={won(o.cost?.['unpaid-amount'])} />
        </Card>
      </div>

      <Card>
        <Text variable="heading4">전문가</Text>
        {assigned ? (
          <>
            <Row k="이름" v={(o as any)['expert-snapshot']?.['expert-name'] ?? (o as any)['expert-id']} />
            <Row k="진행 상태" v={progressLabel((o as any)['expert-progress-status'])} />
            <Row k="배정 시각" v={fmt((o as any)['assigned-at'])} />
          </>
        ) : (
          <Text variable="body2" tone="sub">
            아직 배정되지 않았어요.
          </Text>
        )}
      </Card>

      <Card>
        <Text variable="heading4">메모</Text>
        <Text variable="body2" tone="sub">
          운영자끼리 보는 기록이에요. 고객·전문가에게는 안 보입니다.
        </Text>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="무슨 일이 있었는지 적어 주세요"
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 'var(--rd-8)',
              border: '1px solid var(--color-divider-divider)',
              background: 'var(--color-background-elevation-1)',
              color: 'var(--color-contents-contents)',
              font: 'inherit',
            }}
          />
          <Button
            disabled={busy || note.trim().length === 0}
            onClick={() =>
              act(async () => {
                await api.addNote(o.id, note.trim());
                setNote('');
              })
            }
          >
            남기기
          </Button>
        </div>
      </Card>

      <ExitReasonModal
        open={exit != null}
        kind={exit ?? 'cancel'}
        orderLabel={`${(o as any)['service-name'] ?? ''} · ${addr.address1 ?? ''}`}
        onClose={() => setExit(null)}
        onDone={async (r: ExitReason) => {
          if (exit === 'cancel') await api.cancelOrder(o.id, r);
          else if (exit === 'recall') await api.recallOrder(o.id, r);
          else await api.unassignOrder(o.id, r);
          setExit(null);
          await load();
        }}
      />

      {assigning && (
        <AssignModal
          orderId={o.id}
          description={`${(o as any)['service-name'] ?? ''} · ${addr.address1 ?? ''}`}
          onClose={() => setAssigning(false)}
          onDone={() => {
            setAssigning(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

/**
 * 값 객체를 사람이 읽는 문자열로.
 *
 * ★ 서버의 값 객체(order-number 등)는 `{value: "..."}` 로 온다. 그걸 그대로 JSX 에 넣으면
 * React 가 죽는다(#31: object with keys {value}). 화면이 통째로 하얗게 되고, 브라우저로
 * 몰아 보지 않으면 타입체크도 빌드도 이걸 못 잡는다 — 실제로 못 잡았다.
 */
function plain(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'object') {
    const inner = (v as any).value;
    return inner == null ? null : String(inner);
  }
  return String(v);
}

function Row({ k, v }: { k: string; v?: unknown }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
      <div style={{ width: 84, flexShrink: 0 }}>
        <Text variable="body2" tone="sub">
          {k}
        </Text>
      </div>
      <Text variable="body2">{plain(v) || '-'}</Text>
    </div>
  );
}

function fmt(v?: string | null) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}
