import { useEffect, useState } from 'react';
import { Alert, Button, Modal } from '@sgsg/design/components';
import { api, ApiError, type ExitCatalog, type ExitReason } from './api';

/**
 * 주문을 내보낼 때 묻는다: **누구 때문에, 왜.**
 *
 * ## 왜 자유 텍스트를 안 받나
 *
 * 회고: "취소·이관 사유가 자유 텍스트로만 남아 어느 지역에서 왜 취소가 많은지 셀 수 없다."
 *
 * '고객 변심', '변심', '단순변심', '고객이 마음 바뀜' 은 사람 눈에 하나지만 집계에는
 * 넷이다. 그래서 코드를 고르게 한다. 상세 설명은 **덧붙이는 것**이지 대신하는 것이 아니다.
 *
 * ## 주체를 먼저 고른다
 *
 * '일정이 안 맞는다' 는 고객이 말할 때와 전문가가 말할 때 다른 문제다. 전자는 우리가
 * 날짜를 못 잡아 준 것이고, 후자는 우리가 배정을 잘못한 것이다. 하나로 뭉치면 어느
 * 쪽을 고쳐야 하는지 알 수 없다.
 */
export function ExitReasonModal({
  open,
  kind,
  orderLabel,
  onClose,
  onDone,
}: {
  open: boolean;
  kind: 'cancel' | 'recall' | 'unassigned';
  orderLabel: string;
  onClose: () => void;
  onDone: (r: ExitReason) => Promise<void>;
}) {
  const [cat, setCat] = useState<ExitCatalog | null>(null);
  const [party, setParty] = useState<string>('customer');
  const [code, setCode] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode(null);
    setDetail('');
    setError(null);
    api.exitCatalog().then(setCat).catch(() => setError('사유 목록을 불러오지 못했어요.'));
  }, [open]);

  const title =
    kind === 'cancel' ? '주문 취소' : kind === 'recall' ? '작업 회수' : '배정 실패로 표시';

  const reasons = cat?.parties.find((p) => p.code === party)?.reasons ?? [];
  const needsDetail = code === 'other';

  async function submit() {
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      await onDone({ party, code, detail: detail.trim() || undefined });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '처리하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} description={orderLabel}>
      {error && <Alert type="danger" title={error} />}

      <div style={{ marginTop: 12, marginBottom: 8, fontSize: 13, fontWeight: 700 }}>누구 때문인가요</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {cat?.parties.map((p) => (
          <Button
            key={p.code}
            size="s"
            variant={party === p.code ? 'primary' : 'secondary'}
            onClick={() => {
              setParty(p.code);
              setCode(null);
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div style={{ marginTop: 16, marginBottom: 8, fontSize: 13, fontWeight: 700 }}>왜인가요</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {reasons.map((r) => (
          <label
            key={r.code}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 8,
              cursor: 'pointer',
              border: '1px solid var(--color-line-line-normal)',
              background:
                code === r.code ? 'var(--color-background-primary-elevation-1)' : 'transparent',
              color: code === r.code ? 'var(--color-primary-primary-text)' : 'inherit',
            }}
          >
            <input
              type="radio"
              name="exit-code"
              checked={code === r.code}
              onChange={() => setCode(r.code)}
            />
            <span style={{ fontSize: 14 }}>{r.label}</span>
          </label>
        ))}
      </div>

      <div style={{ marginTop: 16, marginBottom: 6, fontSize: 13, fontWeight: 700 }}>
        상세 {needsDetail && <span style={{ color: 'var(--color-status-danger)' }}>*</span>}
      </div>
      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        rows={3}
        placeholder={
          needsDetail
            ? '무슨 일이 있었는지 적어 주세요. 이 글자가 다음 분류표를 만듭니다.'
            : '덧붙일 말이 있으면 (선택)'
        }
        style={{
          width: '100%',
          padding: 10,
          borderRadius: 8,
          border: '1px solid var(--color-line-line-normal)',
          background: 'var(--color-background-background-normal)',
          color: 'inherit',
          fontFamily: 'inherit',
          fontSize: 14,
          resize: 'vertical',
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
        <Button
          variant="danger"
          disabled={!code || (needsDetail && detail.trim().length < 5)}
          loading={busy}
          onClick={submit}
        >
          {title}
        </Button>
      </div>
    </Modal>
  );
}
