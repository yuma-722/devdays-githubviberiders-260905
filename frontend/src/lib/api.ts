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

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
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

async function request(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener('abort', onOuterAbort);
  try {
    return await fetch(`${resolveApiBase()}${path}`, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (signal?.aborted) throw err;
      throw new ApiError('サーバーからの応答がありません。時間をおいて再度お試しください', 0, 'TIMEOUT');
    }
    throw new ApiError('サーバーに接続できません。ネットワーク接続を確認してください', 0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}

/** POST /api/surveys */
export async function submitSurvey(payload: SurveyRequest, signal?: AbortSignal): Promise<SurveySuccessResponse> {
  const response = await request(
    '/surveys',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    },
    signal,
  );
  const body = await readJson(response);
  if (!response.ok) {
    throw errorFromResponse(response.status, body);
  }
  if (isRecord(body) && body.success === true && typeof body.surveyId === 'string') {
    return {
      success: true,
      surveyId: body.surveyId,
      message: typeof body.message === 'string' ? body.message : 'アンケートの登録が完了しました',
    };
  }
  throw new ApiError('サーバーから想定外の応答が返されました', response.status, 'INVALID_RESPONSE');
}

const toCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

/**
 * API の集計データを画面用に正規化する。
 * 全選択肢・全評価のキーを必ず持たせ、欠けているものは 0 とする（0 件時の表示を安定させる）。
 */
export function normalizeResults(raw: unknown): SurveyResults {
  if (!isRecord(raw)) {
    throw new ApiError('集計データの形式が不正です', 200, 'INVALID_RESPONSE');
  }
  const community = isRecord(raw.communityAffiliation) ? raw.communityAffiliation : {};
  const jobRole = isRecord(raw.jobRole) ? raw.jobRole : {};
  const rating = isRecord(raw.eventRating) ? raw.eventRating : {};
  const distribution = isRecord(rating.distribution) ? rating.distribution : {};

  const communityAffiliation: Record<string, number> = {};
  for (const key of [...COMMUNITIES, NO_COMMUNITY_KEY]) {
    communityAffiliation[key] = toCount(community[key]);
  }
  const jobRoleCounts: Record<string, number> = {};
  for (const key of JOB_ROLES) {
    jobRoleCounts[key] = toCount(jobRole[key]);
  }
  const ratingDistribution: Record<string, number> = {};
  for (const key of RATINGS) {
    ratingDistribution[String(key)] = toCount(distribution[String(key)]);
  }

  const averageRaw = rating.average;
  const average = typeof averageRaw === 'number' && Number.isFinite(averageRaw) ? averageRaw : 0;

  const feedback = Array.isArray(raw.feedback)
    ? raw.feedback.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.feedback !== 'string') return [];
        return [
          {
            id: typeof entry.id === 'string' ? entry.id : '',
            feedback: entry.feedback,
            timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : '',
          },
        ];
      })
    : [];

  return {
    totalResponses: toCount(raw.totalResponses),
    communityAffiliation,
    jobRole: jobRoleCounts,
    eventRating: { average, distribution: ratingDistribution },
    feedback,
  };
}

/** GET /api/surveys/results */
export async function fetchResults(signal?: AbortSignal): Promise<SurveyResults> {
  const response = await request(
    '/surveys/results',
    { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' },
    signal,
  );
  const body = await readJson(response);
  if (!response.ok) {
    throw errorFromResponse(response.status, body);
  }
  if (isRecord(body) && body.success === true) {
    return normalizeResults(body.data);
  }
  throw new ApiError('サーバーから想定外の応答が返されました', response.status, 'INVALID_RESPONSE');
}
