import {
  COMMUNITIES,
  FEEDBACK_MAX,
  JOB_ROLES,
  JOB_ROLE_OTHER_MAX,
  OTHER_JOB_ROLE,
  RATINGS,
  type Community,
  type EventRating,
  type JobRole,
  type SurveyRequest,
} from './survey';

/** フォームの入力状態（送信前のドラフト） */
export interface SurveyDraft {
  communityAffiliation: Community[];
  jobRole: JobRole[];
  jobRoleOther: string;
  eventRating: EventRating | null;
  feedback: string;
}

export type SurveyField = 'communityAffiliation' | 'jobRole' | 'jobRoleOther' | 'eventRating' | 'feedback';

export type SurveyErrors = Partial<Record<SurveyField, string>>;

export const emptyDraft = (): SurveyDraft => ({
  communityAffiliation: [],
  jobRole: [],
  jobRoleOther: '',
  eventRating: null,
  feedback: '',
});

export const isRating = (value: unknown): value is EventRating =>
  typeof value === 'number' && Number.isInteger(value) && (RATINGS as readonly number[]).includes(value);

const unique = <T,>(items: readonly T[]): T[] => Array.from(new Set(items));

export const needsJobRoleOther = (jobRole: readonly JobRole[]): boolean => jobRole.includes(OTHER_JOB_ROLE);

/**
 * 文字数は UTF-16 コード単位で数える（バックエンドの .NET `string.Length` と同一基準）。
 * 絵文字などのサロゲートペアは 2 文字として扱われる。
 */
export const countChars = (text: string): number => text.length;

export function validateDraft(draft: SurveyDraft): SurveyErrors {
  const errors: SurveyErrors = {};

  if (!Array.isArray(draft.communityAffiliation)) {
    errors.communityAffiliation = '所属コミュニティの形式が不正です';
  } else if (draft.communityAffiliation.some((c) => !(COMMUNITIES as readonly string[]).includes(c))) {
    errors.communityAffiliation = '所属コミュニティに不正な値が含まれています';
  }

  const roles = unique(draft.jobRole);
  if (roles.length === 0) {
    errors.jobRole = '職種を 1 つ以上選択してください';
  } else if (roles.some((r) => !(JOB_ROLES as readonly string[]).includes(r))) {
    errors.jobRole = '職種に不正な値が含まれています';
  }

  if (needsJobRoleOther(roles)) {
    const other = draft.jobRoleOther.trim();
    if (other.length === 0) {
      errors.jobRoleOther = '「その他」を選んだ場合は具体的な職種を入力してください';
    } else if (countChars(other) > JOB_ROLE_OTHER_MAX) {
      errors.jobRoleOther = `その他の職種は ${JOB_ROLE_OTHER_MAX} 文字以内で入力してください`;
    }
  }

  if (!isRating(draft.eventRating)) {
    errors.eventRating = 'イベントの満足度を 1〜5 から選択してください';
  }

  if (countChars(draft.feedback) > FEEDBACK_MAX) {
    errors.feedback = `ご意見・ご感想は ${FEEDBACK_MAX} 文字以内で入力してください`;
  }

  return errors;
}

export const hasErrors = (errors: SurveyErrors): boolean => Object.keys(errors).length > 0;

/**
 * 検証済みドラフトを API リクエストへ変換する。
 * 「その他」未選択時は jobRoleOther を送らず、空のフィードバックは省略する。
 */
export function toSurveyRequest(draft: SurveyDraft): SurveyRequest {
  const errors = validateDraft(draft);
  if (hasErrors(errors) || draft.eventRating === null) {
    throw new Error('入力内容に不備があるためリクエストを作成できません');
  }
  const jobRole = unique(draft.jobRole);
  const request: SurveyRequest = {
    communityAffiliation: unique(draft.communityAffiliation),
    jobRole,
    eventRating: draft.eventRating,
  };
  if (needsJobRoleOther(jobRole)) {
    request.jobRoleOther = draft.jobRoleOther.trim();
  }
  const feedback = draft.feedback.trim();
  if (feedback.length > 0) {
    request.feedback = feedback;
  }
  return request;
}
