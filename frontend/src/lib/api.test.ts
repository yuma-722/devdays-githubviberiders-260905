import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchResults, normalizeResults, resolveApiBase, submitSurvey } from './api';
import type { SurveyRequest } from './survey';

const payload: SurveyRequest = {
  communityAffiliation: [],
  jobRole: ['DevOpsエンジニア'],
  eventRating: 3,
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveApiBase', () => {
  it('未設定なら同一オリジンの /api', () => {
    expect(resolveApiBase(undefined)).toBe('/api');
    expect(resolveApiBase('')).toBe('/api');
    expect(resolveApiBase('   ')).toBe('/api');
  });

  it('設定値の末尾スラッシュを除去する', () => {
    expect(resolveApiBase('https://example.com/api/')).toBe('https://example.com/api');
  });
});

describe('submitSurvey', () => {
  it('POST /api/surveys に JSON を送り、201 の応答を返す', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, { success: true, message: 'アンケートの登録が完了しました', surveyId: 'abc-123' }),
    );
    const result = await submitSurvey(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/surveys');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual(payload);
    expect(result).toEqual({ success: true, message: 'アンケートの登録が完了しました', surveyId: 'abc-123' });
  });

  it('422 のエラー応答を ApiError として投げる', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, { success: false, error: '職種は 1 つ以上選択してください', code: 'VALIDATION_ERROR' }),
    );
    await expect(submitSurvey(payload)).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'VALIDATION_ERROR',
      message: '職種は 1 つ以上選択してください',
    });
  });

  it('400 の応答を ApiError として投げる', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { success: false, error: 'リクエストが不正です', code: 'BAD_REQUEST' }));
    await expect(submitSurvey(payload)).rejects.toMatchObject({ status: 400, code: 'BAD_REQUEST' });
  });

  it('500 でボディが JSON でなくても失敗として扱う', async () => {
    fetchMock.mockResolvedValue(new Response('Internal Server Error', { status: 500 }));
    const err = await submitSurvey(payload).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).code).toBe('HTTP_500');
  });

  it('2xx でも success が真でなければ失敗として扱う', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { success: false, error: 'x', code: 'Y' }));
    await expect(submitSurvey(payload)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('ネットワーク断は NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(submitSurvey(payload)).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});

describe('normalizeResults', () => {
  it('README のレスポンス形式をそのまま受け入れる', () => {
    const data = normalizeResults({
      totalResponses: 50,
      communityAffiliation: { 'VS Code Meetup': 20, 'GitHub dockyard': 15, どちらでもない: 5 },
      jobRole: {
        フロントエンドエンジニア: 15,
        バックエンドエンジニア: 12,
        フルスタックエンジニア: 8,
        DevOpsエンジニア: 5,
        データエンジニア: 4,
        モバイルエンジニア: 3,
        その他: 3,
      },
      eventRating: { average: 4.2, distribution: { '1': 1, '2': 2, '3': 8, '4': 20, '5': 19 } },
      feedback: [{ id: 'f1', feedback: '良かった', timestamp: '2025-06-24T10:00:00Z' }],
    });
    expect(data.totalResponses).toBe(50);
    expect(data.communityAffiliation['どちらでもない']).toBe(5);
    expect(data.jobRole['その他']).toBe(3);
    expect(data.eventRating.average).toBe(4.2);
    expect(data.eventRating.distribution['5']).toBe(19);
    expect(data.feedback).toHaveLength(1);
  });

  it('欠けているキーは 0 で補う（0 件時の表示を安定させる）', () => {
    const data = normalizeResults({
      totalResponses: 0,
      communityAffiliation: {},
      jobRole: {},
      eventRating: { average: 0, distribution: {} },
      feedback: [],
    });
    expect(Object.keys(data.communityAffiliation)).toEqual(['VS Code Meetup', 'GitHub dockyard', 'どちらでもない']);
    expect(Object.keys(data.jobRole)).toHaveLength(7);
    expect(Object.values(data.jobRole).every((v) => v === 0)).toBe(true);
    expect(Object.keys(data.eventRating.distribution)).toEqual(['1', '2', '3', '4', '5']);
    expect(data.feedback).toEqual([]);
  });

  it('形式が不正なら例外', () => {
    expect(() => normalizeResults(null)).toThrow(ApiError);
  });
});

describe('fetchResults', () => {
  it('GET /api/surveys/results を呼び data を返す', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: {
          totalResponses: 1,
          communityAffiliation: { 'VS Code Meetup': 1 },
          jobRole: { その他: 1 },
          eventRating: { average: 5, distribution: { '5': 1 } },
          feedback: [],
        },
      }),
    );
    const data = await fetchResults();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/surveys/results');
    expect(init.method).toBe('GET');
    expect(data.totalResponses).toBe(1);
    expect(data.eventRating.distribution['1']).toBe(0);
  });

  it('500 応答では例外を投げ、偽の結果を返さない', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { success: false, error: 'DB に接続できません', code: 'DB_ERROR' }));
    await expect(fetchResults()).rejects.toMatchObject({ status: 500, code: 'DB_ERROR' });
  });
});
