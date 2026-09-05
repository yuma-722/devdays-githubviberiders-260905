import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchResults } from '../lib/api';
import { ROUTE_HASH } from '../lib/router';
import {
  COMMUNITIES,
  JOB_ROLES,
  NO_COMMUNITY_KEY,
  RATING_LABELS,
  RATINGS,
  type EventRating,
  type SurveyResults,
} from '../lib/survey';

type LoadState =
  | { kind: 'loading'; previous?: SurveyResults }
  | { kind: 'error'; message: string; code: string; status: number; previous?: SurveyResults }
  | { kind: 'ready'; data: SurveyResults; fetchedAt: Date };

const percent = (count: number, total: number): number => (total > 0 ? Math.round((count / total) * 100) : 0);

const timeFormatter = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatTimestamp = (iso: string): string => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateTimeFormatter.format(date);
};

interface BarListProps {
  id: string;
  items: { key: string; label: string; count: number }[];
  total: number;
  unit?: string;
  tone?: 'line' | 'amber';
}

/** 路線バー形式のカウント一覧。数値はテキストで読め、バーは装飾 */
function BarList({ id, items, total, unit = '件', tone = 'line' }: BarListProps) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ul className="bars" aria-labelledby={id} data-tone={tone}>
      {items.map((item) => {
        const ratio = item.count > 0 ? Math.max(0.03, item.count / max) : 0;
        return (
          <li key={item.key} className="bar">
            <span className="bar__label">{item.label}</span>
            <span className="bar__track" aria-hidden="true">
              <span className="bar__fill" style={{ transform: `scaleX(${ratio})` }} />
            </span>
            <span className="bar__value">
              <span className="bar__count">
                {item.count}
                <span className="bar__unit">{unit}</span>
              </span>
              <span className="bar__percent">{percent(item.count, total)}%</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ResultsView() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((prev) => ({
      kind: 'loading',
      previous: prev.kind === 'ready' ? prev.data : prev.previous,
    }));
    try {
      const data = await fetchResults(controller.signal);
      if (controller.signal.aborted) return;
      setState({ kind: 'ready', data, fetchedAt: new Date() });
    } catch (err) {
      if (controller.signal.aborted) return;
      setState((prev) => ({
        kind: 'error',
        message: err instanceof ApiError ? err.message : '集計結果の取得中に予期しないエラーが発生しました',
        code: err instanceof ApiError ? err.code : 'UNEXPECTED',
        status: err instanceof ApiError ? err.status : 0,
        previous: prev.kind === 'loading' ? prev.previous : undefined,
      }));
    }
  }, []);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const loading = state.kind === 'loading';

  return (
    <section className="results" aria-labelledby="results-heading" aria-busy={loading}>
      <div className="results__head">
        <div>
          <h2 id="results-heading" className="results__title">
            集計結果
          </h2>
          <p className="results__lead">
            回答はリアルタイムに集計されます。
            {state.kind === 'ready' && (
              <>
                {' '}
                <span className="results__updated">最終更新 {timeFormatter.format(state.fetchedAt)}</span>
              </>
            )}
          </p>
        </div>
        <button type="button" className="button" onClick={() => void load()} disabled={loading}>
          {loading ? '読み込み中…' : '最新の結果を取得'}
        </button>
      </div>

      {state.kind === 'loading' && (
        <div className="notice notice--muted" role="status">
          <span className="spinner" aria-hidden="true" />
          集計結果を読み込んでいます…
        </div>
      )}

      {state.kind === 'error' && (
        <div className="notice notice--error" role="alert">
          <p className="notice__title">集計結果を取得できませんでした</p>
          <p>{state.message}</p>
          <p className="notice__meta">
            {state.status > 0 && (
              <span className="notice__code">
                HTTP {state.status} / {state.code}
              </span>
            )}
          </p>
          <div className="actions">
            <button type="button" className="button button--primary" onClick={() => void load()}>
              再試行
            </button>
          </div>
        </div>
      )}

      {state.kind === 'ready' && <ResultsBody data={state.data} />}
    </section>
  );
}

function ResultsBody({ data }: { data: SurveyResults }) {
  const total = data.totalResponses;
  const empty = total === 0;
  const ratingTotal = RATINGS.reduce((sum, r) => sum + (data.eventRating.distribution[String(r)] ?? 0), 0);
  const ratingMax = Math.max(1, ...RATINGS.map((r) => data.eventRating.distribution[String(r)] ?? 0));

  return (
    <div className="results__body">
      {empty && (
        <div className="notice notice--empty" role="status">
          <p className="notice__title">まだ回答がありません</p>
          <p>最初の回答者になりませんか？</p>
          <div className="actions">
            <a className="button button--primary" href={ROUTE_HASH.survey}>
              アンケートに回答する
            </a>
          </div>
        </div>
      )}

      <div className="summary">
        <div className="summary__item">
          <span className="summary__label" id="total-label">
            回答数
          </span>
          <span className="summary__value" aria-labelledby="total-label" data-testid="total-responses">
            {total}
            <span className="summary__unit">件</span>
          </span>
        </div>
        <div className="summary__item">
          <span className="summary__label" id="average-label">
            平均満足度
          </span>
          <span className="summary__value" aria-labelledby="average-label" data-testid="rating-average">
            {empty ? '–' : data.eventRating.average.toFixed(1)}
            <span className="summary__unit">/ 5</span>
          </span>
        </div>
      </div>

      <section className="block block--rating" aria-labelledby="rating-heading">
        <h3 id="rating-heading" className="block__title">
          満足度の分布
        </h3>
        <ol className="histogram" aria-label="満足度ごとの回答数">
          {RATINGS.map((rating: EventRating) => {
            const count = data.eventRating.distribution[String(rating)] ?? 0;
            const ratio = count > 0 ? Math.max(0.06, count / ratingMax) : 0;
            return (
              <li key={rating} className="histogram__col">
                <span className="histogram__count">
                  {count}
                  <span className="visually-hidden">件（{percent(count, ratingTotal)}%）</span>
                </span>
                <span className="histogram__track" aria-hidden="true">
                  <span className="histogram__fill" style={{ transform: `scaleY(${ratio})` }} />
                </span>
                <span className="histogram__rating">{rating}</span>
                <span className="histogram__label">{RATING_LABELS[rating]}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="block-grid">
        <section className="block" aria-labelledby="community-heading">
          <h3 id="community-heading" className="block__title">
            所属コミュニティ
          </h3>
          <BarList
            id="community-heading"
            total={total}
            items={[...COMMUNITIES, NO_COMMUNITY_KEY].map((key) => ({
              key,
              label: key,
              count: data.communityAffiliation[key] ?? 0,
            }))}
          />
        </section>

        <section className="block" aria-labelledby="jobrole-heading">
          <h3 id="jobrole-heading" className="block__title">
            職種
          </h3>
          <p className="block__note">複数選択のため合計は回答数を超えることがあります。</p>
          <BarList
            id="jobrole-heading"
            total={total}
            items={JOB_ROLES.map((key) => ({ key, label: key, count: data.jobRole[key] ?? 0 }))}
          />
        </section>
      </div>

      <section className="block" aria-labelledby="feedback-heading">
        <h3 id="feedback-heading" className="block__title">
          ご意見・ご感想 <span className="block__count">{data.feedback.length} 件</span>
        </h3>
        {data.feedback.length === 0 ? (
          <p className="block__empty">自由記述はまだありません。</p>
        ) : (
          <ul className="feedback-list">
            {data.feedback.map((entry, index) => (
              <li key={entry.id || index} className="feedback">
                <blockquote className="feedback__text">{entry.feedback}</blockquote>
                {entry.timestamp && (
                  <time className="feedback__time" dateTime={entry.timestamp}>
                    {formatTimestamp(entry.timestamp)}
                  </time>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
