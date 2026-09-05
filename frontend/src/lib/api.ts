import {
  COMMUNITIES,
  JOB_ROLES,
  NO_COMMUNITY_KEY,
  RATINGS,
  type SurveyRequest,
  type SurveyResults,
  type SurveySuccessResponse,
} from './survey';

/** API 呼び出し失敗を表すエラー。status は HTTP ステータス（ネットワーク断は 0）。 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * API のベース URL。VITE_API_BASE_URL（/api を含む）が設定されていればそれを、
 * 未設定なら同一オリジンの /api を使う。末尾スラッシュは除去する。
 */
export function resolveApiBase(configured: string | undefined = import.meta.env.VITE_API_BASE_URL): string {
  const value = (configured ?? '').trim();
  const base = value.length > 0 ? value : '/api';
  return base.replace(/\/+$/, '');
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseJson(text: string): unknown {
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function errorFromResponse(status: number, body: unknown): ApiError {
  if (isRecord(body) && typeof body.error === 'string' && body.error.length > 0) {
    const code = typeof body.code === 'string' ? body.code : `HTTP_${status}`;
    return new ApiError(body.error, status, code);
  }
  const fallback =
    status >= 500
      ? 'サーバーでエラーが発生しました。しばらくしてから再度お試しください'
      : `リクエストに失敗しました（HTTP ${status}）`;
  return new ApiError(fallback, status, `HTTP_${status}`);
}

interface JsonResponse {
  ok: boolean;
  status: number;
  body: unknown;
}

const TIMEOUT_ERROR = () =>
  new ApiError('サーバーからの応答がありません。時間をおいて再度お試しください', 0, 'TIMEOUT');
const NETWORK_ERROR = () =>
  new ApiError('サーバーに接続できません。ネットワーク接続を確認してください', 0, 'NETWORK_ERROR');

/**
 * fetch を実行し、JSON 本文の読み込み完了までを 1 つのタイムアウトで覆う。
 * ヘッダー受信後に本文が届かないケースも TIMEOUT として扱う。
 */
async function request(path: string, init: RequestInit, signal?: AbortSignal): Promise<JsonResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener('abort', onOuterAbort);

  const translate = (err: unknown): never => {
    if (signal?.aborted) throw err;
    if (controller.signal.aborted) throw TIMEOUT_ERROR();
    if (err instanceof DOMException && err.name === 'AbortError') throw TIMEOUT_ERROR();
    throw NETWORK_ERROR();
  };

  try {
    const response = await fetch(`${resolveApiBase()}${path}`, { ...init, signal: controller.signal }).catch(translate);
    const text = await response.text().catch(translate);
    return { ok: response.ok, status: response.status, body: parseJson(text) };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}

/** POST /api/surveys */
export async function submitSurvey(payload: SurveyRequest, signal?: AbortSignal): Promise<SurveySuccessResponse> {
  const { ok, status, body } = await request(
    '/surveys',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    },
    signal,
  );
  if (!ok) {
    throw errorFromResponse(status, body);
  }
  if (isRecord(body) && body.success === true && typeof body.surveyId === 'string') {
    return {
      success: true,
      surveyId: body.surveyId,
      message: typeof body.message === 'string' ? body.message : 'アンケートの登録が完了しました',
    };
  }
  throw new ApiError('サーバーから想定外の応答が返されました', status, 'INVALID_RESPONSE');
}

const invalidResults = (detail: string) =>
  new ApiError(`集計データの形式が不正です（${detail}）`, 200, 'INVALID_RESPONSE');

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** 指定キーがすべて非負整数で存在することを要求し、そのキーだけを抜き出す */
function requireCounts(source: unknown, keys: readonly string[], field: string): Record<string, number> {
  if (!isRecord(source)) throw invalidResults(`${field} がオブジェクトではありません`);
  const out: Record<string, number> = {};
  for (const key of keys) {
    const value = source[key];
    if (!isCount(value)) throw invalidResults(`${field}.${key} が非負整数ではありません`);
    out[key] = value;
  }
  return out;
}

/**
 * API の集計データを検証し、画面用の型へ変換する。
 * README の契約（totalResponses / 全選択肢・全評価のキー / average / feedback 配列）が
 * 欠けている・型が壊れている場合は INVALID_RESPONSE を投げ、偽の 0 件集計を表示しない。
 */
export function normalizeResults(raw: unknown): SurveyResults {
  if (!isRecord(raw)) throw invalidResults('data がオブジェクトではありません');

  if (!isCount(raw.totalResponses)) throw invalidResults('totalResponses が非負整数ではありません');

  const communityAffiliation = requireCounts(
    raw.communityAffiliation,
    [...COMMUNITIES, NO_COMMUNITY_KEY],
    'communityAffiliation',
  );
  const jobRole = requireCounts(raw.jobRole, JOB_ROLES, 'jobRole');

  if (!isRecord(raw.eventRating)) throw invalidResults('eventRating がオブジェクトではありません');
  const averageRaw = raw.eventRating.average;
  if (typeof averageRaw !== 'number' || !Number.isFinite(averageRaw) || averageRaw < 0) {
    throw invalidResults('eventRating.average が数値ではありません');
  }
  const distribution = requireCounts(
    raw.eventRating.distribution,
    RATINGS.map((r) => String(r)),
    'eventRating.distribution',
  );

  if (!Array.isArray(raw.feedback)) throw invalidResults('feedback が配列ではありません');
  const feedback = raw.feedback.map((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      typeof entry.feedback !== 'string' ||
      typeof entry.timestamp !== 'string'
    ) {
      throw invalidResults(`feedback[${index}] の形式が不正です`);
    }
    return { id: entry.id, feedback: entry.feedback, timestamp: entry.timestamp };
  });

  return {
    totalResponses: raw.totalResponses,
    communityAffiliation,
    jobRole,
    eventRating: { average: averageRaw, distribution },
    feedback,
  };
}

/** GET /api/surveys/results */
export async function fetchResults(signal?: AbortSignal): Promise<SurveyResults> {
  const { ok, status, body } = await request(
    '/surveys/results',
    { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' },
    signal,
  );
  if (!ok) {
    throw errorFromResponse(status, body);
  }
  if (isRecord(body) && body.success === true) {
    return normalizeResults(body.data);
  }
  throw new ApiError('サーバーから想定外の応答が返されました', status, 'INVALID_RESPONSE');
}
