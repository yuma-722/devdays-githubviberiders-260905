import { describe, expect, it } from 'vitest';
import { countChars, emptyDraft, hasErrors, toSurveyRequest, validateDraft, type SurveyDraft } from './validation';

const validDraft = (): SurveyDraft => ({
  ...emptyDraft(),
  communityAffiliation: ['VS Code Meetup'],
  jobRole: ['フロントエンドエンジニア'],
  eventRating: 5,
  feedback: 'とても良かったです',
});

describe('validateDraft', () => {
  it('正しい入力ではエラーがない', () => {
    expect(hasErrors(validateDraft(validDraft()))).toBe(false);
  });

  it('コミュニティは空配列でも有効', () => {
    const errors = validateDraft({ ...validDraft(), communityAffiliation: [] });
    expect(errors.communityAffiliation).toBeUndefined();
  });

  it('職種が未選択ならエラー', () => {
    const errors = validateDraft({ ...validDraft(), jobRole: [] });
    expect(errors.jobRole).toMatch(/1 つ以上/);
  });

  it('「その他」選択時は具体的な職種が必須', () => {
    const errors = validateDraft({ ...validDraft(), jobRole: ['その他'], jobRoleOther: '   ' });
    expect(errors.jobRoleOther).toBeDefined();
  });

  it('「その他」の職種は 100 文字以内', () => {
    const ok = validateDraft({ ...validDraft(), jobRole: ['その他'], jobRoleOther: 'あ'.repeat(100) });
    expect(ok.jobRoleOther).toBeUndefined();
    const ng = validateDraft({ ...validDraft(), jobRole: ['その他'], jobRoleOther: 'あ'.repeat(101) });
    expect(ng.jobRoleOther).toMatch(/100 文字以内/);
  });

  it('「その他」未選択なら jobRoleOther は無視される', () => {
    const errors = validateDraft({ ...validDraft(), jobRoleOther: 'x'.repeat(500) });
    expect(errors.jobRoleOther).toBeUndefined();
  });

  it('評価が未選択・範囲外・非整数ならエラー', () => {
    expect(validateDraft({ ...validDraft(), eventRating: null }).eventRating).toBeDefined();
    expect(validateDraft({ ...validDraft(), eventRating: 6 as never }).eventRating).toBeDefined();
    expect(validateDraft({ ...validDraft(), eventRating: 0 as never }).eventRating).toBeDefined();
    expect(validateDraft({ ...validDraft(), eventRating: 2.5 as never }).eventRating).toBeDefined();
  });

  it('フィードバックは 1000 文字以内', () => {
    expect(validateDraft({ ...validDraft(), feedback: 'あ'.repeat(1000) }).feedback).toBeUndefined();
    expect(validateDraft({ ...validDraft(), feedback: 'あ'.repeat(1001) }).feedback).toMatch(/1000 文字以内/);
  });
});

describe('countChars', () => {
  it('サロゲートペアを 1 文字として数える', () => {
    expect(countChars('𠮷野家')).toBe(3);
    expect(countChars('')).toBe(0);
  });
});

describe('toSurveyRequest', () => {
  it('README の契約どおりのボディを生成する', () => {
    const request = toSurveyRequest({
      ...validDraft(),
      communityAffiliation: ['VS Code Meetup', 'GitHub dockyard'],
      jobRole: ['バックエンドエンジニア', 'その他'],
      jobRoleOther: '  テクニカルライター  ',
      eventRating: 4,
      feedback: '  次回も参加したい  ',
    });
    expect(request).toEqual({
      communityAffiliation: ['VS Code Meetup', 'GitHub dockyard'],
      jobRole: ['バックエンドエンジニア', 'その他'],
      jobRoleOther: 'テクニカルライター',
      eventRating: 4,
      feedback: '次回も参加したい',
    });
  });

  it('「その他」未選択なら jobRoleOther を送らず、空のフィードバックは省略する', () => {
    const request = toSurveyRequest({ ...validDraft(), jobRoleOther: '不要', feedback: '   ' });
    expect(request).not.toHaveProperty('jobRoleOther');
    expect(request).not.toHaveProperty('feedback');
    expect(request.communityAffiliation).toEqual(['VS Code Meetup']);
  });

  it('未所属は空配列として送る', () => {
    const request = toSurveyRequest({ ...validDraft(), communityAffiliation: [] });
    expect(request.communityAffiliation).toEqual([]);
  });

  it('重複した選択は 1 つにまとめる', () => {
    const request = toSurveyRequest({
      ...validDraft(),
      jobRole: ['フロントエンドエンジニア', 'フロントエンドエンジニア'],
    });
    expect(request.jobRole).toEqual(['フロントエンドエンジニア']);
  });

  it('不正なドラフトからは生成できない', () => {
    expect(() => toSurveyRequest({ ...validDraft(), jobRole: [] })).toThrow();
  });
});
