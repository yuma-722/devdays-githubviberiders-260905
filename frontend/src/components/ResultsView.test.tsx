import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import type { SurveyResults } from '../lib/survey';
import { ResultsView, formatTimestamp } from './ResultsView';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, fetchResults: vi.fn() };
});

import { fetchResults } from '../lib/api';
const fetchMock = vi.mocked(fetchResults);

const sample: SurveyResults = {
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
  feedback: [
    { id: 'f1', feedback: 'とても勉強になりました', timestamp: '2025-06-24T10:00:00Z' },
    { id: 'f2', feedback: '会場が少し寒かった', timestamp: '2025-06-24T11:30:00Z' },
  ],
};

const emptyResults: SurveyResults = {
  totalResponses: 0,
  communityAffiliation: { 'VS Code Meetup': 0, 'GitHub dockyard': 0, どちらでもない: 0 },
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
};

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ResultsView', () => {
  it('読み込み中の状態を表示する', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(<ResultsView />);
    expect(screen.getByRole('status')).toHaveTextContent('集計結果を読み込んでいます');
    expect(screen.getByRole('button', { name: '読み込み中…' })).toBeDisabled();
  });

  it('集計結果を表示する', async () => {
    fetchMock.mockResolvedValue(sample);
    render(<ResultsView />);

    expect(await screen.findByTestId('total-responses')).toHaveTextContent('50件');
    expect(screen.getByTestId('rating-average')).toHaveTextContent('4.2');

    const community = screen.getByRole('region', { name: '所属コミュニティ' });
    expect(within(community).getByText('どちらでもない')).toBeInTheDocument();
    expect(within(community).getAllByRole('listitem')).toHaveLength(3);
    expect(community).toHaveTextContent('20件');

    const jobRole = screen.getByRole('region', { name: '職種' });
    expect(within(jobRole).getAllByRole('listitem')).toHaveLength(7);

    const hist = screen.getByRole('list', { name: '満足度ごとの回答数' });
    expect(within(hist).getAllByRole('listitem')).toHaveLength(5);
    expect(hist).toHaveTextContent('19');

    const feedback = screen.getByRole('region', { name: /ご意見・ご感想/ });
    expect(within(feedback).getAllByRole('listitem')).toHaveLength(2);
    expect(feedback).toHaveTextContent('とても勉強になりました');
    expect(screen.getByRole('button', { name: '最新の結果を取得' })).toBeEnabled();
  });

  it('0 件のときは空状態と 0 カウントを表示する', async () => {
    fetchMock.mockResolvedValue(emptyResults);
    render(<ResultsView />);

    expect(await screen.findByText('まだ回答がありません')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'アンケートに回答する' })).toHaveAttribute('href', '#/');
    expect(screen.getByTestId('total-responses')).toHaveTextContent('0件');
    expect(screen.getByTestId('rating-average')).toHaveTextContent('–');
    expect(screen.getByText('自由記述はまだありません。')).toBeInTheDocument();
    const jobRole = screen.getByRole('region', { name: '職種' });
    expect(within(jobRole).getAllByRole('listitem')).toHaveLength(7);
  });

  it('取得失敗時はエラーを表示し、再試行で復帰できる', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new ApiError('サーバーに接続できません', 0, 'NETWORK_ERROR'));
    fetchMock.mockResolvedValueOnce(sample);
    render(<ResultsView />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('集計結果を取得できませんでした');
    expect(alert).toHaveTextContent('サーバーに接続できません');
    expect(screen.queryByTestId('total-responses')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '再試行' }));
    expect(await screen.findByTestId('total-responses')).toHaveTextContent('50件');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('HTTP エラーではステータスとコードを表示する', async () => {
    fetchMock.mockRejectedValue(new ApiError('内部エラー', 500, 'INTERNAL_ERROR'));
    render(<ResultsView />);
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 500 / INTERNAL_ERROR');
  });
});

describe('formatTimestamp', () => {
  it('不正な日時はそのまま返す', () => {
    expect(formatTimestamp('not-a-date')).toBe('not-a-date');
    expect(formatTimestamp('')).toBe('');
  });

  it('ISO 日時を日本語表記に変換する', () => {
    expect(formatTimestamp('2025-06-24T10:00:00Z')).toMatch(/2025\/06\/24/);
  });
});
