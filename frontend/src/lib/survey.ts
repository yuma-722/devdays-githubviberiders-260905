export const COMMUNITIES = ['VS Code Meetup', 'GitHub dockyard'] as const;
export type Community = (typeof COMMUNITIES)[number];

/** 集計結果でコミュニティ未所属を表すキー */
export const NO_COMMUNITY_KEY = 'どちらでもない' as const;

export const JOB_ROLES = [
  'フロントエンドエンジニア',
  'バックエンドエンジニア',
  'フルスタックエンジニア',
  'DevOpsエンジニア',
  'データエンジニア',
  'モバイルエンジニア',
  'その他',
] as const;
export type JobRole = (typeof JOB_ROLES)[number];
export const OTHER_JOB_ROLE: JobRole = 'その他';

export const RATINGS = [1, 2, 3, 4, 5] as const;
export type EventRating = (typeof RATINGS)[number];

export const RATING_LABELS: Record<EventRating, string> = {
  1: '非常に不満',
  2: '不満',
  3: 'どちらでもない',
  4: '満足',
  5: '非常に満足',
};

export const JOB_ROLE_OTHER_MAX = 100;
export const FEEDBACK_MAX = 1000;

/** POST /api/surveys のリクエストボディ */
export interface SurveyRequest {
  communityAffiliation: Community[];
  jobRole: JobRole[];
  jobRoleOther?: string;
  eventRating: EventRating;
  feedback?: string;
}

export interface SurveySuccessResponse {
  success: true;
  message: string;
  surveyId: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
}

export interface FeedbackEntry {
  id: string;
  feedback: string;
  timestamp: string;
}

/** GET /api/surveys/results の data */
export interface SurveyResults {
  totalResponses: number;
  communityAffiliation: Record<string, number>;
  jobRole: Record<string, number>;
  eventRating: {
    average: number;
    distribution: Record<string, number>;
  };
  feedback: FeedbackEntry[];
}

export interface SurveyResultsResponse {
  success: true;
  data: SurveyResults;
}
