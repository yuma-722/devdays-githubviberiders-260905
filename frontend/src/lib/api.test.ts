import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchResults, normalizeResults, resolveApiBase, submitSurvey } from './api';
import type { SurveyRequest } from './survey';

const payload: SurveyRequest = {
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

const fullData = () => ({
  totalResponses: 50,
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

const emptyData = () => ({
  totalResponses: 0,
  jobRole: {
    フロントエンドエンジニア: 0,
    バックエンドエンジニア: 0,
    フルスタックエンジニア: 0,
    DevOpsエンジニア: 0,
    データエンジニア: 0,
    モバイルエンジニア: 0,
    その他: 0,
  },
  eventRating: { average: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } },
  feedback: [],
});

describe('normalizeResults', () => {
  it('README のレスポンス形式をそのまま受け入れる', () => {
    const data = normalizeResults(fullData());
    expect(data.totalResponses).toBe(50);
    expect(data.jobRole['その他']).toBe(3);
    expect(data.eventRating.average).toBe(4.2);
    expect(data.eventRating.distribution['5']).toBe(19);
    expect(data.feedback).toHaveLength(1);
  });

  it('0 件時の契約（全キー 0・feedback 空）を受け入れる', () => {
    const data = normalizeResults(emptyData());
    expect(data.totalResponses).toBe(0);
    expect(Object.keys(data.jobRole)).toHaveLength(7);
    expect(Object.values(data.jobRole).every((v) => v === 0)).toBe(true);
    expect(Object.keys(data.eventRating.distribution)).toEqual(['1', '2', '3', '4', '5']);
    expect(data.feedback).toEqual([]);
  });

  it('契約外の余分なキーは無視する', () => {
    const data = normalizeResults({
      ...fullData(),
      jobRole: { ...fullData().jobRole, 未知: 99 },
      extra: true,
    });
    expect(Object.keys(data.jobRole)).toHaveLength(7);
    expect(data).not.toHaveProperty('extra');
  });

  it('data が空オブジェクトなら INVALID_RESPONSE（偽の 0 件集計にしない）', () => {
    expect(() => normalizeResults({})).toThrow(ApiError);
    expect(() => normalizeResults({})).toThrow(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
    expect(() => normalizeResults(null)).toThrow(ApiError);
    expect(() => normalizeResults([])).toThrow(ApiError);
  });

  it.each([
    ['totalResponses 欠落', { ...fullData(), totalResponses: undefined }],
    ['totalResponses が文字列', { ...fullData(), totalResponses: '50' }],
    ['totalResponses が負数', { ...fullData(), totalResponses: -1 }],
    ['jobRole の一部キー欠落', { ...fullData(), jobRole: { その他: 1 } }],
    ['jobRole の値が小数', { ...fullData(), jobRole: { ...fullData().jobRole, その他: 1.5 } }],
    ['eventRating 欠落', { ...fullData(), eventRating: undefined }],
    ['eventRating.average が文字列', { ...fullData(), eventRating: { average: '4.2', distribution: fullData().eventRating.distribution } }],
    ['eventRating.distribution 欠落', { ...fullData(), eventRating: { average: 4.2 } }],
    ['eventRating.distribution の評価キー欠落', { ...fullData(), eventRating: { average: 4.2, distribution: { '1': 0, '2': 0, '4': 0, '5': 0 } } }],
    ['feedback が配列でない', { ...fullData(), feedback: {} }],
    ['feedback 要素の型が壊れている', { ...fullData(), feedback: [{ id: 1, feedback: 'x', timestamp: 'y' }] }],
    ['feedback 要素に timestamp がない', { ...fullData(), feedback: [{ id: 'a', feedback: 'x' }] }],
  ])('%s なら INVALID_RESPONSE', (_label, data) => {
    expect(() => normalizeResults(data)).toThrow(expect.objectContaining({ name: 'ApiError', code: 'INVALID_RESPONSE' }));
  });
});

describe('fetchResults', () => {
  it('GET /api/surveys/results を呼び data を返す', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: fullData() }));
    const data = await fetchResults();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/surveys/results');
    expect(init.method).toBe('GET');
    expect(data.totalResponses).toBe(50);
    expect(data.eventRating.distribution['1']).toBe(1);
  });

  it('{success:true,data:{}} は INVALID_RESPONSE として失敗させる', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: {} }));
    await expect(fetchResults()).rejects.toMatchObject({ name: 'ApiError', code: 'INVALID_RESPONSE' });
  });

  it('data が欠けていれば INVALID_RESPONSE', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));
    await expect(fetchResults()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('500 応答では例外を投げ、偽の結果を返さない', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { success: false, error: 'DB に接続できません', code: 'DB_ERROR' }));
    await expect(fetchResults()).rejects.toMatchObject({ status: 500, code: 'DB_ERROR' });
  });
});

describe('タイムアウト / 中断', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** signal が abort されるまで解決しない Promise */
  const untilAbort = <T,>(signal: AbortSignal): Promise<T> =>
    new Promise<T>((_, reject) => {
      const fail = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
      if (signal.aborted) fail();
      else signal.addEventListener('abort', fail, { once: true });
    });

  /** ヘッダーは届くが本文が届かない応答を模した Response 風オブジェクト */
  const headersOnlyResponse = (signal: AbortSignal) => ({
    ok: true,
    status: 200,
    text: () => untilAbort<string>(signal),
  });

  it('ヘッダー受信前に 15 秒経過したら TIMEOUT', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => untilAbort<Response>(init.signal as AbortSignal));
    const pending = submitSurvey(payload);
    const assertion = expect(pending).rejects.toMatchObject({ status: 0, code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  it('ヘッダー受信後に本文が届かない場合も TIMEOUT（本文読み込みまでタイムアウト対象）', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      Promise.resolve(headersOnlyResponse(init.signal as AbortSignal)),
    );
    const pending = fetchResults();
    const assertion = expect(pending).rejects.toMatchObject({ status: 0, code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  it('タイムアウト前に本文が届けば正常に処理される', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          new Promise<string>((resolve) => {
            setTimeout(() => resolve(JSON.stringify({ success: true, data: fullData() })), 5_000);
          }),
      }),
    );
    const pending = fetchResults();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toMatchObject({ totalResponses: 50 });
  });

  it('本文読み込み中のネットワーク断は NETWORK_ERROR', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.reject(new TypeError('network error')),
    });
    await expect(fetchResults()).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('呼び出し側の AbortSignal による中断は ApiError にせずそのまま伝える', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => untilAbort<Response>(init.signal as AbortSignal));
    const controller = new AbortController();
    const pending = fetchResults(controller.signal);
    const assertion = expect(pending).rejects.toSatisfy((err: unknown) => !(err instanceof ApiError));
    controller.abort();
    await assertion;
  });
});
