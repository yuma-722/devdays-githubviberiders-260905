import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { ApiError, submitSurvey } from '../lib/api';
import { ROUTE_HASH } from '../lib/router';
import {
  COMMUNITIES,
  FEEDBACK_MAX,
  JOB_ROLES,
  JOB_ROLE_OTHER_MAX,
  NO_COMMUNITY_KEY,
  type Community,
  type JobRole,
} from '../lib/survey';
import {
  countChars,
  emptyDraft,
  hasErrors,
  needsJobRoleOther,
  toSurveyRequest,
  validateDraft,
  type SurveyDraft,
  type SurveyErrors,
  type SurveyField,
} from '../lib/validation';
import { RatingScale } from './RatingScale';

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; surveyId: string; message: string }
  | { kind: 'error'; message: string; code: string; status: number };

const FIELD_ORDER: SurveyField[] = ['communityAffiliation', 'jobRole', 'jobRoleOther', 'eventRating', 'feedback'];

const FIELD_TITLES: Record<SurveyField, string> = {
  communityAffiliation: '所属コミュニティ',
  jobRole: '職種',
  jobRoleOther: 'その他の職種',
  eventRating: 'イベントの満足度',
  feedback: 'ご意見・ご感想',
};

const STATION_COUNT = 4;

const toggle = <T,>(list: readonly T[], item: T, on: boolean): T[] =>
  on ? (list.includes(item) ? [...list] : [...list, item]) : list.filter((x) => x !== item);

interface SurveyFormProps {
  /** 送信成功時に呼ばれる（画面遷移などに利用） */
  onSubmitted?: (surveyId: string) => void;
}

export function SurveyForm({ onSubmitted }: SurveyFormProps) {
  const [draft, setDraft] = useState<SurveyDraft>(emptyDraft);
  // 「どちらでもない」を明示的に選んだか（空配列と区別して進行表示に使う）
  const [communityNone, setCommunityNone] = useState(false);
  const [feedbackTouched, setFeedbackTouched] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });
  const inFlight = useRef(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLElement>(null);
  const uid = useId();

  const errors: SurveyErrors = useMemo(() => validateDraft(draft), [draft]);
  const attempted = attempt > 0;
  const showError = (field: SurveyField) => (attempted ? errors[field] : undefined);
  const submitting = state.kind === 'submitting';
  const otherSelected = needsJobRoleOther(draft.jobRole);

  // 各駅（設問）の通過状態: 回答済みで、その設問に誤りがない
  const stationDone = {
    community: (draft.communityAffiliation.length > 0 || communityNone) && !errors.communityAffiliation,
    jobRole: draft.jobRole.length > 0 && !errors.jobRole && !errors.jobRoleOther,
    rating: draft.eventRating !== null && !errors.eventRating,
    feedback: (feedbackTouched || draft.feedback.length > 0) && !errors.feedback,
  };
  const doneCount = Object.values(stationDone).filter(Boolean).length;

  useEffect(() => {
    if (attempt > 0 && hasErrors(errors)) {
      summaryRef.current?.focus();
    }
    // 送信を試みたタイミングだけエラー一覧へフォーカスを移す
  }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state.kind === 'success') {
      successRef.current?.focus();
    }
  }, [state.kind]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    setAttempt((n) => n + 1);
    if (hasErrors(errors)) return;

    inFlight.current = true;
    setState({ kind: 'submitting' });
    try {
      const response = await submitSurvey(toSurveyRequest(draft));
      setState({ kind: 'success', surveyId: response.surveyId, message: response.message });
      onSubmitted?.(response.surveyId);
    } catch (err) {
      if (err instanceof ApiError) {
        setState({ kind: 'error', message: err.message, code: err.code, status: err.status });
      } else {
        setState({
          kind: 'error',
          message: '送信中に予期しないエラーが発生しました',
          code: 'UNEXPECTED',
          status: 0,
        });
      }
    } finally {
      inFlight.current = false;
    }
  };

  const reset = () => {
    setDraft(emptyDraft());
    setCommunityNone(false);
    setFeedbackTouched(false);
    setAttempt(0);
    setState({ kind: 'idle' });
  };

  if (state.kind === 'success') {
    return (
      <section className="panel panel--success" aria-labelledby={`${uid}-done`} tabIndex={-1} ref={successRef}>
        <p className="panel__stamp" aria-hidden="true">
          終点
        </p>
        <h2 id={`${uid}-done`} className="panel__title">
          ご回答ありがとうございました
        </h2>
        <p className="panel__lead" role="status">
          {state.message}
        </p>
        <dl className="receipt">
          <dt>受付番号</dt>
          <dd>
            <code data-testid="survey-id">{state.surveyId}</code>
          </dd>
        </dl>
        <div className="actions">
          <a className="button button--primary" href={ROUTE_HASH.results}>
            集計結果を見る
          </a>
          <button type="button" className="button" onClick={reset}>
            もう一度回答する
          </button>
        </div>
      </section>
    );
  }

  const visibleErrors = FIELD_ORDER.filter((f) => attempted && errors[f]);

  return (
    <form
      className="survey"
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="survey-heading"
      aria-describedby="survey-lead"
      aria-busy={submitting}
    >
      <div className="survey__intro">
        <h2 id="survey-heading" className="survey__title">
          イベントの感想を教えてください
        </h2>
        <p className="survey__lead" id="survey-lead">
          所要時間はおよそ 1 分。<span className="mark-required">必須</span>
          の付いた設問にお答えください。回答は匿名で集計されます。
        </p>
        <p className="survey__progress" aria-live="polite">
          <span className="survey__progress-count">{doneCount}</span> / {STATION_COUNT} 駅を通過
        </p>
      </div>

      {visibleErrors.length > 0 && (
        <div className="notice notice--error" role="alert" tabIndex={-1} ref={summaryRef} id={`${uid}-summary`}>
          <p className="notice__title">入力内容を確認してください</p>
          <ul className="notice__list">
            {visibleErrors.map((field) => (
              <li key={field}>
                <a href={`#${uid}-${field}`}>{FIELD_TITLES[field]}</a>: {errors[field]}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="route" aria-label="設問">
        {/* 駅 1: 所属コミュニティ */}
        <li className="station" data-done={stationDone.community} data-index={1}>
          <span className="station__mark" aria-hidden="true" />
          <fieldset
            className="field"
            id={`${uid}-communityAffiliation`}
            aria-describedby={`${uid}-community-hint`}
            disabled={submitting}
          >
            <legend className="field__legend">
              所属コミュニティ <span className="tag">複数選択可</span>
            </legend>
            <p className="field__hint" id={`${uid}-community-hint`}>
              所属しているコミュニティをすべて選んでください。
            </p>
            <div className="choices">
              {COMMUNITIES.map((community: Community) => {
                const id = `${uid}-community-${community.replace(/\s+/g, '-')}`;
                const checked = draft.communityAffiliation.includes(community);
                return (
                  <label key={community} className="choice" htmlFor={id} data-checked={checked}>
                    <input
                      type="checkbox"
                      id={id}
                      name="communityAffiliation"
                      value={community}
                      checked={checked}
                      onChange={(e) => {
                        setCommunityNone(false);
                        setDraft((d) => ({
                          ...d,
                          communityAffiliation: toggle(d.communityAffiliation, community, e.target.checked),
                        }));
                      }}
                    />
                    <span className="choice__label">{community}</span>
                  </label>
                );
              })}
              <label className="choice choice--quiet" htmlFor={`${uid}-community-none`} data-checked={communityNone}>
                <input
                  type="checkbox"
                  id={`${uid}-community-none`}
                  name="communityAffiliationNone"
                  checked={communityNone}
                  onChange={(e) => {
                    setCommunityNone(e.target.checked);
                    if (e.target.checked) {
                      setDraft((d) => ({ ...d, communityAffiliation: [] }));
                    }
                  }}
                />
                <span className="choice__label">{NO_COMMUNITY_KEY}</span>
              </label>
            </div>
          </fieldset>
        </li>

        {/* 駅 2: 職種 */}
        <li className="station" data-done={stationDone.jobRole} data-index={2}>
          <span className="station__mark" aria-hidden="true" />
          <fieldset
            className="field"
            id={`${uid}-jobRole`}
            aria-describedby={showError('jobRole') ? `${uid}-jobRole-error` : `${uid}-jobRole-hint`}
            aria-invalid={showError('jobRole') ? true : undefined}
            aria-required="true"
            disabled={submitting}
          >
            <legend className="field__legend">
              職種 <span className="mark-required">必須</span> <span className="tag">複数選択可</span>
            </legend>
            <p className="field__hint" id={`${uid}-jobRole-hint`}>
              兼務している場合は当てはまるものをすべて選んでください。
            </p>
            <div className="choices choices--grid">
              {JOB_ROLES.map((role: JobRole) => {
                const id = `${uid}-jobRole-${role}`;
                const checked = draft.jobRole.includes(role);
                return (
                  <label key={role} className="choice" htmlFor={id} data-checked={checked}>
                    <input
                      type="checkbox"
                      id={id}
                      name="jobRole"
                      value={role}
                      checked={checked}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, jobRole: toggle(d.jobRole, role, e.target.checked) }))
                      }
                    />
                    <span className="choice__label">{role}</span>
                  </label>
                );
              })}
            </div>
            {showError('jobRole') && (
              <p className="field__error" id={`${uid}-jobRole-error`}>
                {errors.jobRole}
              </p>
            )}
            {otherSelected && (
              <div className="field__sub" id={`${uid}-jobRoleOther-wrap`}>
                <label className="field__label" htmlFor={`${uid}-jobRoleOther`}>
                  その他の職種 <span className="mark-required">必須</span>
                </label>
                <input
                  className="input"
                  id={`${uid}-jobRoleOther`}
                  name="jobRoleOther"
                  type="text"
                  value={draft.jobRoleOther}
                  maxLength={JOB_ROLE_OTHER_MAX}
                  autoComplete="off"
                  aria-invalid={showError('jobRoleOther') ? true : undefined}
                  aria-describedby={`${uid}-jobRoleOther-count${showError('jobRoleOther') ? ` ${uid}-jobRoleOther-error` : ''}`}
                  onChange={(e) => setDraft((d) => ({ ...d, jobRoleOther: e.target.value }))}
                  placeholder="例: テクニカルライター"
                />
                <p className="field__count" id={`${uid}-jobRoleOther-count`}>
                  {countChars(draft.jobRoleOther)} / {JOB_ROLE_OTHER_MAX} 文字
                </p>
                {showError('jobRoleOther') && (
                  <p className="field__error" id={`${uid}-jobRoleOther-error`}>
                    {errors.jobRoleOther}
                  </p>
                )}
              </div>
            )}
          </fieldset>
        </li>

        {/* 駅 3: 満足度 */}
        <li className="station" data-done={stationDone.rating} data-index={3}>
          <span className="station__mark" aria-hidden="true" />
          <fieldset className="field" id={`${uid}-eventRating`} disabled={submitting}>
            <legend className="field__legend">
              イベントの満足度 <span className="mark-required">必須</span>
            </legend>
            <p className="field__hint" id={`${uid}-rating-hint`}>
              1 = 非常に不満、5 = 非常に満足
            </p>
            <RatingScale
              value={draft.eventRating}
              onChange={(rating) => setDraft((d) => ({ ...d, eventRating: rating }))}
              disabled={submitting}
              describedBy={showError('eventRating') ? `${uid}-eventRating-error` : `${uid}-rating-hint`}
              invalid={Boolean(showError('eventRating'))}
            />
            {showError('eventRating') && (
              <p className="field__error" id={`${uid}-eventRating-error`}>
                {errors.eventRating}
              </p>
            )}
          </fieldset>
        </li>

        {/* 駅 4: 自由記述 */}
        <li className="station station--last" data-done={stationDone.feedback} data-index={4}>
          <span className="station__mark" aria-hidden="true" />
          <div className="field" id={`${uid}-feedback-field`}>
            <label className="field__legend" htmlFor={`${uid}-feedback`}>
              ご意見・ご感想 <span className="tag">任意</span>
            </label>
            <p className="field__hint" id={`${uid}-feedback-hint`}>
              良かった点、改善してほしい点、次回取り上げてほしいテーマなど。
            </p>
            <textarea
              className="input input--textarea"
              id={`${uid}-feedback`}
              name="feedback"
              rows={5}
              value={draft.feedback}
              disabled={submitting}
              maxLength={FEEDBACK_MAX}
              aria-invalid={showError('feedback') ? true : undefined}
              aria-describedby={`${uid}-feedback-hint ${uid}-feedback-count${showError('feedback') ? ` ${uid}-feedback-error` : ''}`}
              onChange={(e) => setDraft((d) => ({ ...d, feedback: e.target.value }))}
              onBlur={() => setFeedbackTouched(true)}
            />
            <p className="field__count" id={`${uid}-feedback-count`}>
              {countChars(draft.feedback)} / {FEEDBACK_MAX} 文字
            </p>
            {showError('feedback') && (
              <p className="field__error" id={`${uid}-feedback-error`}>
                {errors.feedback}
              </p>
            )}
          </div>
        </li>
      </ol>

      <div className="survey__footer">
        {state.kind === 'error' && (
          <div className="notice notice--error" role="alert">
            <p className="notice__title">送信できませんでした</p>
            <p>{state.message}</p>
            <p className="notice__meta">
              入力内容は保持されています。内容を確認して再送信してください。
              {state.status > 0 && (
                <>
                  {' '}
                  <span className="notice__code">
                    HTTP {state.status} / {state.code}
                  </span>
                </>
              )}
            </p>
          </div>
        )}
        <button
          type="submit"
          className="button button--primary button--large"
          disabled={submitting}
          aria-disabled={submitting}
        >
          {submitting ? '送信中…' : state.kind === 'error' ? '再送信する' : 'アンケートを送信'}
        </button>
        {submitting && (
          <p className="survey__status" role="status">
            回答を送信しています。しばらくお待ちください。
          </p>
        )}
      </div>
    </form>
  );
}
