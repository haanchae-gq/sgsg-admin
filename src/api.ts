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
  /** 배정에 **실제로 쓰인** 거리. 그날 이미 근처에 가면 hop-km 이고, 아니면 base-km 이다. */
  'distance-km'?: number | null;
  /** 사업장에서의 거리. 변하지 않는 사실 — 그날 일정이 깨지면 이 값으로 되돌아간다. */
  'base-km'?: number | null;
  /** 그날 직전 현장에서의 거리. **다른 플랫폼은 이 값을 모른다.** */
  'hop-km'?: number | null;
  'hop-from'?: string | null;
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

export type DayStop = {
  'order-id': string;
  name?: string;
  address?: string;
  amount?: number;
  'travel-km'?: number;
  'travel-minutes'?: number;
};

export type DayMarketDate = {
  date: string;
  days: { orders: string[]; stops: DayStop[] }[];
  /** ★ 단건은 '실패' 다. 이 숫자가 크면 물량이 얇다는 뜻이고, 그건 마케팅이 풀 문제다. */
  singles: { id: string; 'service-name'?: string; address?: string; amount?: number }[];
};

export type DayCandidate = {
  'expert-id': string;
  name: string;
  'commute-km'?: number | null;
  'hourly-take'?: number | null;
  take?: number;
  available: boolean;
  blockers: { code: string; label: string }[];
  /** ★ 그가 이 하루를 원한다고 말했다. 운영자가 몰랐던 사실이다. */
  'wants-it'?: boolean;
  'wants-note'?: string | null;
  cautions?: string[];
  trust?: { 'enough-sample': boolean; label: string };
};

export type DayCandidates = {
  orders: string[];
  date: string;
  stops: DayStop[];
  candidates: DayCandidate[];
};

export type RiskItem = {
  'order-id': string;
  'service-name'?: string;
  'confirmed-date'?: string;
  'expert-name'?: string;
  'customer-name'?: string;
  'customer-phone'?: string;
  /** 물어보긴 했나 (침묵), 아니면 아직 안 물어봤나 */
  asked: boolean;
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

  /**
   * ★ 노쇼 — 말없이 안 왔다.
   *
   * 이 호출이 없어서 `no-show` 는 **만들 수 있는 길이 없는 죽은 값**이었다. 운영자가
   * 취소/회수로 처리했고, 그건 집계상 '주문 취소' 였다. 우리가 세지 않으니 데이터상
   * 노쇼는 영원히 0건이었다.
   *
   * 운영자만 찍는다: 전문가가 자기 노쇼를 신고할 리 없다.
   */
  markNoShow: (id: string, detail?: string) =>
    send('POST', `/orders/${id}/no-show`, { detail: detail ?? null }),

  // 주문의 나머지 여정. 이 버튼들이 옛 CLJS 관리자에만 있어서, React 관리자로는
  // 주문을 **끝까지 몰고 갈 수 없었다** — 배정까지 하고 나면 손을 뗄 수밖에 없었다.
  deliverOrder: (id: string) => send('POST', `/orders/${id}/deliver`),
  autoAssign: (id: string) => send('POST', `/orders/${id}/auto-assign`),
  startOrder: (id: string) => send('PATCH', `/orders/${id}/start`),
  completeOrder: (id: string) => send('PATCH', `/orders/${id}/complete`),
  confirmOrder: (id: string) => send('PATCH', `/orders/${id}/confirm`),
  setProgress: (id: string, to: string) => send('PATCH', `/orders/${id}/progress`, { to }),
  addNote: (id: string, note: string) => send('POST', `/orders/${id}/notes`, { note }),

  /** 손으로 접수한 주문. 전화·카톡으로 들어온 건은 여전히 사람이 넣는다. */
  createOrder: (b: unknown) => send('POST', '/orders', b),

  /**
   * 주문에는 **고객이 먼저 있어야 한다** (orders.customer_id 는 NOT NULL).
   *
   * ★ 옛 CLJS 등록 화면은 이 단계를 `:orders/create-or-find-customer` 라는 이벤트에
   * 맡겼는데 **그 이벤트는 어디에도 등록돼 있지 않았다.** re-frame 은 없는 이벤트를
   * 조용히 무시한다 — 그래서 등록 버튼을 눌러도 아무 일도 일어나지 않았다. 즉 그 화면은
   * 처음부터 동작하지 않았고, 아무도 몰랐다.
   *
   * 전화번호로 찾고, 없으면 만든다. 같은 번호로 다시 걸어 온 고객이 매번 새 사람이
   * 되면 이력이 흩어진다.
   */
  createOrFindCustomer: async (name: string, phone: string): Promise<string> => {
    const found = items(await send('GET', `/customers?${qs({ page: 1, limit: 1, search: phone })}`)) as any[];
    const hit = found.find((c) => (c['primary-phone'] ?? '').replace(/\D/g, '') === phone.replace(/\D/g, ''));
    if (hit?.id) return hit.id;
    const made: any = await send('POST', '/customers', {
      'customer-name': name,
      'primary-phone': phone,
    });
    if (!made?.id) throw new ApiError(500, '고객을 만들지 못했어요.');
    return made.id;
  },

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

  // ---------------------------------------------------------------------------
  // 하루 시장 — 우리는 주문을 팔지 않는다. 하루를 판다.
  //
  // ★ 이 호출들이 없어서 관리자는 하루를 팔 수 없었고, 주문을 낱개로 배정했다.
  //   백엔드가 partition-pool 로 구조적으로 막아 둔 편식을 **운영 화면이 되살리고**
  //   있었다: 25만원짜리 이사청소만 골라 배정하고 7.9만원 먼 건은 남는다.
  // ---------------------------------------------------------------------------

  dayMarket: (): Promise<{ market: DayMarketDate[] }> => send('GET', '/day-market'),

  /**
   * ★ 지금 전화할 목록 — 물어봤는데 답이 없고 방문이 24시간 안으로 다가온 예약.
   *
   * 알림톡을 한 통도 안 보내고도 이 목록만으로 노쇼를 줄인다. 침묵을 눈에 보이게 하는
   * 것만으로.
   */
  riskBoard: (): Promise<{ items: RiskItem[] }> => send('GET', '/confirmations/risk-board'),

  /** 이 하루를 **누가** 할 수 있나. 전문가앱과 방향이 반대다. */
  dayCandidates: (orderIds: string[]): Promise<DayCandidates> =>
    send('POST', '/day-market/candidates', { orderIds }),

  /** 하루를 판다. **전부 아니면 전무** — 반쪽짜리 하루는 우리가 판 물건이 아니다. */
  assignDay: (orderIds: string[], expertId: string) =>
    send('POST', '/day-market/assign', { orderIds, expertId }),

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
  /**
   * ★ 노쇼 건수.
   *
   * 이 값이 0 이면 이제 **'노쇼가 없다'** 는 뜻이다. 예전엔 '우리가 안 센다' 는 뜻이었다 —
   * 노쇼를 만들 수 있는 코드 경로가 아예 없어서 데이터상 영원히 0건이었다.
   */
  'no-show'?: number;
  /**
   * 전문가 이탈을 **언제 말했는지**로 나눈 것.
   *
   * 3주 전 취소와 당일 잠수는 다른 사건이다. 이걸 안 보면 둘이 똑같은 1건이 되고,
   * 그 지표로 벌점을 매기면 미리 알려 준 성실한 사람을 벌하고 사라지는 사람을 놓친다.
   */
  'by-lead-time'?: { bucket: string; count: number }[];
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
