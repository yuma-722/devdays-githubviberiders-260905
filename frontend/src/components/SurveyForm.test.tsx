import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import { SurveyForm } from './SurveyForm';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, submitSurvey: vi.fn() };
});

import { submitSurvey } from '../lib/api';
const submitMock = vi.mocked(submitSurvey);

const fillValidForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('checkbox', { name: 'VS Code Meetup' }));
  await user.click(screen.getByRole('checkbox', { name: 'バックエンドエンジニア' }));
  await user.click(screen.getByRole('radio', { name: '4: 満足' }));
  await user.type(screen.getByRole('textbox', { name: /ご意見・ご感想/ }), '楽しかったです');
};

beforeEach(() => {
  submitMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SurveyForm', () => {
  it('主要なコントロールが日本語のラベルで取得できる', () => {
    render(<SurveyForm />);
    expect(screen.getByRole('form', { name: 'イベントの感想を教えてください' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /所属コミュニティ/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /職種/ })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'イベントの満足度' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /ご意見・ご感想/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'アンケートを送信' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: /エンジニア|その他/ })).toHaveLength(7);
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });

  it('未入力で送信すると検証エラーを表示し API を呼ばない', async () => {
    const user = userEvent.setup();
    render(<SurveyForm />);
    await user.click(screen.getByRole('button', { name: 'アンケートを送信' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('職種を 1 つ以上選択してください');
    expect(alert).toHaveTextContent('イベントの満足度を 1〜5 から選択してください');
    expect(alert).toHaveFocus();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('「その他」を選ぶと入力欄が現れ、空のままでは送信できない', async () => {
    const user = userEvent.setup();
    render(<SurveyForm />);
    expect(screen.queryByRole('textbox', { name: /その他の職種/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'その他' }));
    const other = screen.getByRole('textbox', { name: /その他の職種/ });
    expect(other).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: '5: 非常に満足' }));
    await user.click(screen.getByRole('button', { name: 'アンケートを送信' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('具体的な職種を入力してください');
    expect(other).toHaveAttribute('aria-invalid', 'true');
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('正しい入力で送信すると API を呼び、完了画面を表示する', async () => {
    const user = userEvent.setup();
    submitMock.mockResolvedValue({ success: true, message: 'アンケートの登録が完了しました', surveyId: 'id-001' });
    render(<SurveyForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'アンケートを送信' }));

    expect(await screen.findByRole('heading', { name: 'ご回答ありがとうございました' })).toBeInTheDocument();
    expect(screen.getByTestId('survey-id')).toHaveTextContent('id-001');
    expect(screen.getByRole('link', { name: '集計結果を見る' })).toHaveAttribute('href', '#/results');
    expect(submitMock).toHaveBeenCalledWith({
      communityAffiliation: ['VS Code Meetup'],
      jobRole: ['バックエンドエンジニア'],
      eventRating: 4,
      feedback: '楽しかったです',
    });
  });

  it('「どちらでもない」を選ぶとコミュニティは空配列で送信される', async () => {
    const user = userEvent.setup();
    submitMock.mockResolvedValue({ success: true, message: 'ok', surveyId: 'id-002' });
    render(<SurveyForm />);
    await user.click(screen.getByRole('checkbox', { name: 'GitHub dockyard' }));
    await user.click(screen.getByRole('checkbox', { name: 'どちらでもない' }));
    expect(screen.getByRole('checkbox', { name: 'GitHub dockyard' })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'データエンジニア' }));
    await user.click(screen.getByRole('radio', { name: '3: どちらでもない' }));
    await user.click(screen.getByRole('button', { name: 'アンケートを送信' }));

    await screen.findByRole('heading', { name: 'ご回答ありがとうございました' });
    expect(submitMock).toHaveBeenCalledWith(expect.objectContaining({ communityAffiliation: [] }));
  });

  it('送信中はボタンが無効になり、二重送信されない', async () => {
    const user = userEvent.setup();
    let resolve: (v: { success: true; message: string; surveyId: string }) => void = () => {};
    submitMock.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    render(<SurveyForm />);
    await fillValidForm(user);
    const button = screen.getByRole('button', { name: 'アンケートを送信' });
    await user.click(button);

    const busy = await screen.findByRole('button', { name: '送信中…' });
    expect(busy).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('回答を送信しています');
    await user.click(busy);
    await user.click(busy);
    expect(submitMock).toHaveBeenCalledTimes(1);

    resolve({ success: true, message: '完了', surveyId: 'id-003' });
    await screen.findByRole('heading', { name: 'ご回答ありがとうございました' });
  });

  it('API エラー時はエラーを表示し、入力内容を保持して再送信できる', async () => {
    const user = userEvent.setup();
    submitMock.mockRejectedValueOnce(new ApiError('サーバーでエラーが発生しました', 500, 'INTERNAL_ERROR'));
    submitMock.mockResolvedValueOnce({ success: true, message: '完了', surveyId: 'id-004' });
    render(<SurveyForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'アンケートを送信' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('送信できませんでした');
    expect(alert).toHaveTextContent('サーバーでエラーが発生しました');
    expect(alert).toHaveTextContent('HTTP 500 / INTERNAL_ERROR');
    expect(screen.getByRole('checkbox', { name: 'バックエンドエンジニア' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '4: 満足' })).toBeChecked();
    expect(screen.getByRole('textbox', { name: /ご意見・ご感想/ })).toHaveValue('楽しかったです');
    expect(screen.queryByRole('heading', { name: 'ご回答ありがとうございました' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '再送信する' }));
    await screen.findByRole('heading', { name: 'ご回答ありがとうございました' });
    expect(submitMock).toHaveBeenCalledTimes(2);
  });

  it('文字数カウンタが更新される', async () => {
    const user = userEvent.setup();
    render(<SurveyForm />);
    await user.type(screen.getByRole('textbox', { name: /ご意見・ご感想/ }), 'あいう');
    expect(screen.getByText('3 / 1000 文字')).toBeInTheDocument();
  });

  it('回答が揃うと進行表示が更新される', async () => {
    const user = userEvent.setup();
    render(<SurveyForm />);
    const progress = screen.getByText(/駅を通過/);
    expect(progress).toHaveTextContent('0 / 4 駅を通過');
    await user.click(screen.getByRole('checkbox', { name: 'モバイルエンジニア' }));
    await user.click(screen.getByRole('radio', { name: '2: 不満' }));
    expect(progress).toHaveTextContent('2 / 4 駅を通過');
    const stations = within(screen.getByRole('list', { name: '設問' })).getAllByRole('listitem');
    expect(stations[1]).toHaveAttribute('data-done', 'true');
    expect(stations[2]).toHaveAttribute('data-done', 'true');
    expect(stations[0]).toHaveAttribute('data-done', 'false');
  });

  it('評価はキーボード操作で選択できる', async () => {
    const user = userEvent.setup();
    render(<SurveyForm />);
    const first = screen.getByRole('radio', { name: '1: 非常に不満' });
    first.focus();
    await user.keyboard('[Space]');
    expect(first).toBeChecked();
    await user.keyboard('[ArrowRight]');
    await waitFor(() => expect(screen.getByRole('radio', { name: '2: 不満' })).toBeChecked());
  });
});
