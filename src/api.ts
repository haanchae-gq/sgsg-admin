/**
 * 백엔드.
 *
 * 서버의 목록은 전부 `{items, pagination}` 봉투다. 전문가앱에서 이걸 각 호출부가
 * 알아서 벗기게 뒀다가 캐스팅 하나가 어긋나 TypeError 가 났고, 화면은 그걸
 * "네트워크에 연결할 수 없어요" 로 뭉뚱그렸다. 서버에는 작업이 3건 있었다.
 * 여기서는 처음부터 한 군데서 벗긴다.
 */

const ACCESS = 'sgsg.admin.token';
const REFRESH = 'sgsg.admin.refresh';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let access: string | null = localStorage.getItem(ACCESS);
let refresh: string | null = localStorage.getItem(REFRESH);

export const isLoggedIn = () => access != null;

function setSession(t: string | null, r?: string | null) {
  access = t;
  if (t) localStorage.setItem(ACCESS, t);
  else localStorage.removeItem(ACCESS);
  if (r !== undefined) {
    refresh = r;
    if (r) localStorage.setItem(REFRESH, r);
    else localStorage.removeItem(REFRESH);
  }
}

async function raw(method: string, path: string, body?: unknown, idem?: string) {
  return fetch(`/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      ...(idem ? { 'Idempotency-Key': idem } : {}),
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
}

async function refreshSession(): Promise<boolean> {
  if (!refresh) return false;
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'refresh-token': refresh }),
    });
    if (!res.ok) return false;
    const d = await res.json();
    setSession(d.token, d['refresh-token'] ?? refresh);
    return true;
  } catch {
    return false;
  }
}

async function send(method: string, path: string, body?: unknown, idem?: string): Promise<any> {
  let res = await raw(method, path, body, idem);

  // access 토큰은 30분이다. 만료되면 한 번 갱신하고 재시도한다.
  // 갱신도 실패하면 로그아웃 — refresh 루프는 로그인 화면보다 나쁘다.
  if (res.status === 401 && (await refreshSession())) {
    res = await raw(method, path, body, idem);
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (res.status === 401) setSession(null, null);
    throw new ApiError(res.status, data?.error ?? '문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
  }
  return data;
}

function items(d: unknown): any[] {
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object' && Array.isArray((d as any).items)) return (d as any).items;
  return [];
}

const qs = (o: Record<string, unknown>) =>
  Object.entries(o)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

// --- 타입 ------------------------------------------------------------------

export type Order = {
  id: string;
  status: string;
  'payment-status': string;
  'expert-progress-status': string | null;
  'order-number': { value: string };
  'service-name'?: string;
  'expert-id'?: string | null;
  'channel-code'?: string;
  'channel-order-number'?: string;
  'customer-snapshot'?: { 'customer-name'?: string; phone?: string; address?: { address1?: string } };
  'expert-snapshot'?: { 'expert-name'?: string };
  'requested-date'?: string;
  'created-at'?: string;
  cost: { 'total-amount': number; 'paid-amount': number; 'unpaid-amount': number };
};

export type Expert = {
  id: string;
  rating?: number | null;
  'account-grade'?: string;
  'approval-status'?: string;
  'active-status'?: string;
  'business-info'?: { 'business-name'?: string; contact?: string };
  'service-info'?: { 'region-groups'?: string[] };
  statistics?: Record<string, number>;
};

export type Candidate = {
  'expert-id': string;
  name: string;
  region: string;
  rating?: number | null;
  available: boolean;
  score: number;
  /** 항상 온다(좌표를 알면). 먼 사람의 거리도 운영자는 알아야 한다. */
  'distance-km'?: number | null;
  reasons: string[];
  blockers: { code: string; label: string }[];
  /** 알고 하라는 것. blockers(못 하는 일)와 다르다 — 차단이 아니라 사실이다. */
  cautions: string[];
  trust?: {
    'enough-sample': boolean;
    label: string;
    'drop-rate-pct'?: number;
    'accept-rate-pct'?: number | null;
    penalty?: number;
  };
};

// --- 호출 ------------------------------------------------------------------

export const api = {
  login: async (email: string, password: string) => {
    const d = await send('POST', '/auth/login', { email, password });
    setSession(d.token, d['refresh-token']);
    return d;
  },
  logout: () => setSession(null, null),
  me: () => send('GET', '/auth/me'),

  dashboard: () => send('GET', '/dashboard/summary'),

  orders: async (f: Record<string, unknown>): Promise<{ items: Order[]; pagination: any }> => {
    const d = await send('GET', `/orders?${qs({ page: 1, limit: 50, ...f })}`);
    return { items: items(d) as Order[], pagination: (d as any)?.pagination };
  },
  order: (id: string): Promise<Order> => send('GET', `/orders/${id}`),
  checkOrder: (id: string) => send('PATCH', `/orders/${id}/check`),
  assignExpert: (id: string, expertId: string) =>
    send('POST', `/orders/${id}/assign`, { 'expert-id': expertId }),
  // 주문을 내보내는 세 길. **셀 수 있는 사유 없이는 못 나간다** —
  // 자유 텍스트로만 남기던 시절에는 "어느 지역에서 왜 취소가 많은가"를 셀 수 없었다.
  cancelOrder: (id: string, r: ExitReason) => send('POST', `/orders/${id}/cancel`, r),
  recallOrder: (id: string, r: ExitReason) => send('POST', `/orders/${id}/recall`, r),
  unassignOrder: (id: string, r: ExitReason) => send('PATCH', `/orders/${id}/unassign`, r),

  // 화면이 코드를 지어내지 않게, 고를 수 있는 것을 서버가 준다.
  /** 전문가별 신뢰 지표. 표본이 적으면 숫자 대신 '아직 판단하기 일러요' 가 온다. */
  expertTrust: async (days = 90): Promise<ExpertTrust[]> =>
    items(await send('GET', `/expert-trust?days=${days}`)) as ExpertTrust[],

  /** 좌표 상태. 좌표 없는 주문은 거리·동선에서 조용히 빠진다 — 보이게 둔다. */
  geocodeStatus: async (): Promise<{ orders: number; experts: number; geocoder: string }> =>
    (await send('GET', '/geocode/status')) as { orders: number; experts: number; geocoder: string },
  geocodeBackfill: async (limit = 100) => send('POST', `/geocode/backfill?limit=${limit}`),

  exitCatalog: async (): Promise<ExitCatalog> => (await send('GET', '/exit-reasons/catalog')) as ExitCatalog,
  exitStats: async (days = 30): Promise<ExitStats> =>
    (await send('GET', `/exit-reasons/stats?days=${days}`)) as ExitStats,

  experts: async (f: Record<string, unknown> = {}): Promise<Expert[]> =>
    items(await send('GET', `/experts?${qs({ page: 1, limit: 200, ...f })}`)) as Expert[],

  // 배정 후보. 기계가 좁히고 사람이 고른다 — 못 하는 사람도 이유와 함께 남는다.
  candidates: (orderId: string): Promise<{
    site: Record<string, unknown>;
    candidates: Candidate[];
  }> => send('GET', `/orders/${orderId}/candidates`),

  onSitePolicies: async () => items(await send('GET', '/on-site-policies')),
  setOnSitePolicy: (b: unknown) => send('POST', '/on-site-policies', b),

  assignments: async (f: Record<string, unknown> = {}) =>
    items(await send('GET', `/assignments?${qs({ page: 1, limit: 50, ...f })}`)),

  // 위사 커넥터
  wisaStatus: (): Promise<{ enabled: boolean }> => send('GET', '/wisa/status'),
  wisaMappings: async () => items(await send('GET', '/wisa/mappings')),
  setWisaMapping: (pno: number, serviceItemId: string, note?: string) =>
    send('POST', '/wisa/mappings', { pno, 'service-item-id': serviceItemId, note }),
  wisaSync: () => send('POST', '/wisa/sync'),
  wisaFailures: async () => items(await send('GET', '/wisa/failures')),
  wisaResync: (orderId: string) => send('POST', `/wisa/orders/${orderId}/resync`),

  services: async () => items(await send('GET', '/services/items?page=1&limit=200')),

  // --- 전문가 ---
  approveExpert: (id: string) => send('PATCH', `/experts/${id}/approve`),
  // 백엔드 경로 이름은 reject 지만 화면에서는 '승인 안 함' 이다 —
  // 서류가 모자란 것은 실패가 아니다 (용어 사전).
  rejectExpert: (id: string, reason: string) =>
    send('PATCH', `/experts/${id}/reject`, { reason }),

  // --- 고객 ---
  customers: async (f: Record<string, unknown> = {}) =>
    items(await send('GET', `/customers?${qs({ page: 1, limit: 100, ...f })}`)),

  // --- 서비스 카탈로그 ---
  categories: async () => {
    const d = await send('GET', '/services/categories');
    return Array.isArray(d) ? d : items(d);
  },
  createItem: (b: unknown) => send('POST', '/services/items', b),
  updateItem: (id: string, b: unknown) => send('PUT', `/services/items/${id}`, b),

  // --- 결제 ---
  payments: async (f: Record<string, unknown> = {}) =>
    items(await send('GET', `/payments?${qs({ page: 1, limit: 100, ...f })}`)),
  refund: (id: string, amount: number, reason: string) =>
    send('POST', `/payments/${id}/refund`, { amount, reason }),

  // --- 정산 ---
  commissionPolicies: async () => items(await send('GET', '/commission-policies')),
  setCommission: (scope: string, rate: number, scopeId?: string, note?: string) =>
    // 화면은 %(0~50)로 다루고 서버에는 비율(0~0.5)로 보낸다. 사람은 20 을 입력하지
    // 0.2 를 입력하지 않는다 — 그 변환을 사용자에게 시키면 언젠가 누군가 0.2 를
    // 넣고 20% 를 뗐다고 믿는다.
    send('POST', '/commission-policies', { scope, rate: rate / 100, 'scope-id': scopeId, note }),
  settlements: async (f: Record<string, unknown> = {}) =>
    items(await send('GET', `/settlements?${qs(f)}`)),
  settlementPreview: (expertId: string, year: number, month: number) =>
    send('GET', `/settlement-preview?${qs({ expertId, year, month })}`),
  closeSettlement: (expertId: string, year: number, month: number) =>
    send('POST', '/settlements', { 'expert-id': expertId, year, month }),
  settlementAction: (id: string, action: 'approve' | 'pay' | 'cancel') =>
    send('PATCH', `/settlements/${id}/${action}`),

  // --- 리뷰 ---
  reviews: async (f: Record<string, unknown> = {}) =>
    items(await send('GET', `/admin/reviews?${qs({ page: 1, limit: 100, ...f })}`)),
  blindReview: (id: string, reason: string) =>
    send('POST', `/admin/reviews/${id}/blind`, { reason }),
  unblindReview: (id: string) => send('POST', `/admin/reviews/${id}/unblind`),

  // --- 문의 ---
  inquiries: async (f: Record<string, unknown> = {}) =>
    items(await send('GET', `/inquiries?${qs({ page: 1, limit: 100, ...f })}`)),
};


// ---------------------------------------------------------------------------
// 이탈 사유
// ---------------------------------------------------------------------------

export type ExitReason = { party: string; code: string; detail?: string };

export type ExitCatalog = {
  kinds: { code: string; label: string }[];
  parties: { code: string; label: string; reasons: { code: string; label: string }[] }[];
};

export type ExitStats = {
  total: number;
  /** 기타 비율. 이 숫자가 크면 분류표가 현실을 못 담고 있다는 뜻이다 — 우리가 고칠 신호. */
  'other-ratio': number;
  'by-reason': { kind: string; party: string; code: string; label: string; count: number }[];
  'by-region': { region: string; count: number; top: string }[];
};


export type ExpertTrust = {
  'expert-id': string;
  name: string;
  'enough-sample': boolean;
  label: string;
  'drop-rate-pct'?: number;
  'accept-rate-pct'?: number | null;
  'response-median-minutes'?: number | null;
  penalty?: number;
};
