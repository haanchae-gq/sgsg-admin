/**
 * 상태 어휘.
 *
 * 백엔드의 값은 영어 keyword 다. 화면마다 따로 한글을 붙이면 같은 상태를 두 화면이
 * 다르게 부른다 — 실제로 그랬다. 한 군데서만 옮긴다.
 *
 * **'거절'·'실패'·'반려' 를 쓰지 않는다** (용어 사전). 전문가가 배정을 받지 않은 것은
 * 실패가 아니고, 고객이 취소한 것도 실패가 아니다.
 */

export const ORDER_STATUS: Record<string, string> = {
  new: '접수',
  checked: '검수 완료',
  unassigned: '배정 대기',
  assigned: '배정 완료',
  'expert-in-progress': '작업 중',
  'service-completed': '작업 완료',
  'purchase-confirmed': '구매확정',
  recalled: '회수',
  cancelled: '취소',
  refunded: '환불',
};

export const PROGRESS_STATUS: Record<string, string> = {
  assigned: '배정됨',
  'reservation-confirmed': '일정 확정',
  departed: '출발',
  arrived: '도착',
  'in-progress': '작업 중',
  'additional-cost-requested': '추가비용 요청',
  'service-completed': '작업 완료',
  'balance-payment-waiting': '잔금 대기',
  'purchase-confirmed': '구매확정',
  'as-requested': 'AS 요청',
  'as-completed': 'AS 완료',
  'transfer-requested': '이관 요청',
};

export const PAYMENT_STATUS: Record<string, string> = {
  pending: '미결제',
  deposit_paid: '계약금 결제',
  balance_pending: '잔금 대기',
  balance_paid: '결제 완료',
  refunded: '환불',
};

export const statusLabel = (s?: string | null) => (s ? (ORDER_STATUS[s] ?? s) : '-');
export const progressLabel = (s?: string | null) => (s ? (PROGRESS_STATUS[s] ?? s) : '-');
export const paymentLabel = (s?: string | null) => (s ? (PAYMENT_STATUS[s] ?? s) : '-');

/** 이 주문이 지금 운영자를 기다리고 있나. 기다리면 그게 곧 다음 버튼이다. */
export function nextAction(o: { status: string }): { label: string; kind: 'check' | 'assign' } | null {
  if (o.status === 'new') return { label: '검수', kind: 'check' };
  if (o.status === 'checked' || o.status === 'unassigned') return { label: '전문가 배정', kind: 'assign' };
  return null;
}
