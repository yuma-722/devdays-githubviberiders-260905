import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { routeFromHash } from './lib/router';

vi.mock('./lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/api')>();
  return { ...actual, fetchResults: vi.fn(), submitSurvey: vi.fn() };
});

import { fetchResults } from './lib/api';

beforeEach(() => {
  window.location.hash = '';
  vi.mocked(fetchResults).mockImplementation(() => new Promise(() => {}));
});

afterEach(() => {
  vi.clearAllMocks();
  window.location.hash = '';
});

describe('routeFromHash', () => {
  it('ハッシュから画面を判定する', () => {
    expect(routeFromHash('')).toBe('survey');
    expect(routeFromHash('#/')).toBe('survey');
    expect(routeFromHash('#/results')).toBe('results');
    expect(routeFromHash('#/results/')).toBe('results');
    expect(routeFromHash('#/unknown')).toBe('survey');
  });
});

describe('App', () => {
  it('初期表示はアンケートフォームで、ナビゲーションが現在地を示す', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 2, name: 'イベントの感想を教えてください' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'ページ' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'アンケートに回答' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '集計結果' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: '本文へスキップ' })).toHaveAttribute('href', '#main');
  });

  it('ナビゲーションで集計結果に切り替わる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: '集計結果' }));
    expect(screen.getByRole('heading', { level: 2, name: '集計結果' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/results');
    expect(fetchResults).toHaveBeenCalled();
  });

  it('hashchange で画面が切り替わる', async () => {
    render(<App />);
    await act(async () => {
      window.location.hash = '#/results';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByRole('heading', { level: 2, name: '集計結果' })).toBeInTheDocument();
  });

  it('#/results で開くと集計結果が初期表示になる', () => {
    window.location.hash = '#/results';
    render(<App />);
    expect(screen.getByRole('heading', { level: 2, name: '集計結果' })).toBeInTheDocument();
  });
});
