import assert from 'node:assert/strict';
import test from 'node:test';

const configuredUrl = process.env.SURVEY_TEST_API_URL;
if (!configuredUrl) {
  throw new Error(
    'SURVEY_TEST_API_URL に空の開発用ストレージを使用するローカル API の URL を指定してください。',
  );
}

const baseUrl = new URL(`${configuredUrl.replace(/\/+$/, '')}/`);
if (
  baseUrl.protocol !== 'http:' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname) ||
  baseUrl.pathname !== '/api/' ||
  baseUrl.username ||
  baseUrl.password ||
  baseUrl.search ||
  baseUrl.hash
) {
  throw new Error('結合テストは http://localhost:<port>/api などのローカル API 専用です。');
}

const communityKeys = ['VS Code Meetup', 'GitHub dockyard', 'どちらでもない'];
const jobKeys = [
  'フロントエンドエンジニア',
  'バックエンドエンジニア',
  'フルスタックエンジニア',
  'DevOpsエンジニア',
  'データエンジニア',
  'モバイルエンジニア',
  'その他',
];
const validAnswer = {
  communityAffiliation: [],
  jobRole: ['フロントエンドエンジニア'],
  eventRating: 5,
};

async function request(path, body, raw = false) {
  const response = await fetch(new URL(path, baseUrl), {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  assert.match(response.headers.get('content-type') ?? '', /application\/json/i);
  return { status: response.status, body: await response.json() };
}

function assertCounts(counts, keys) {
  assert.deepEqual(Object.keys(counts).sort(), [...keys].sort());
  for (const value of Object.values(counts)) {
    assert.ok(Number.isInteger(value) && value >= 0);
  }
}

async function getResults() {
  const response = await request('surveys/results');
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  const data = response.body.data;
  assert.ok(Number.isInteger(data.totalResponses) && data.totalResponses >= 0);
  assertCounts(data.communityAffiliation, communityKeys);
  assertCounts(data.jobRole, jobKeys);
  assertCounts(data.eventRating.distribution, ['1', '2', '3', '4', '5']);
  assert.ok(Number.isFinite(data.eventRating.average));
  assert.ok(Array.isArray(data.feedback));
  return data;
}

test('実 HTTP API の登録・検証・集計契約', async (t) => {
  const initial = await getResults();
  assert.equal(
    initial.totalResponses,
    0,
    '既存回答を変更しないため中止しました。空の専用 File ストレージで実行してください。',
  );

  await t.test('0 件でも全選択肢と評価分布が返る', () => {
    assert.equal(initial.eventRating.average, 0);
    assert.deepEqual(initial.feedback, []);
    for (const counts of [
      initial.communityAffiliation,
      initial.jobRole,
      initial.eventRating.distribution,
    ]) {
      assert.ok(Object.values(counts).every((count) => count === 0));
    }
  });

  const invalidCases = [
    ['不正 JSON', '{', 400, true],
    ['JSON null', 'null', 400, true],
    ['JSON 配列', '[]', 400, true],
    ['配列の型不正', { ...validAnswer, communityAffiliation: 'VS Code Meetup' }, 400],
    ['評価の型不正', { ...validAnswer, eventRating: '5' }, 400],
    ['評価が小数', { ...validAnswer, eventRating: 1.5 }, 400],
    ['必須フィールド欠落', {}, 422],
    ['コミュニティが null', { ...validAnswer, communityAffiliation: null }, 422],
    ['職種が null', { ...validAnswer, jobRole: null }, 422],
    ['職種が空', { ...validAnswer, jobRole: [] }, 422],
    ['未知のコミュニティ', { ...validAnswer, communityAffiliation: ['未知'] }, 422],
    ['未知の職種', { ...validAnswer, jobRole: ['未知'] }, 422],
    ['その他の説明なし', { ...validAnswer, jobRole: ['その他'] }, 422],
    ['その他の説明が空白', { ...validAnswer, jobRole: ['その他'], jobRoleOther: '  ' }, 422],
    [
      'その他の説明が 101 文字',
      { ...validAnswer, jobRole: ['その他'], jobRoleOther: 'あ'.repeat(101) },
      422,
    ],
    ['自由記述が 1001 文字', { ...validAnswer, feedback: 'あ'.repeat(1001) }, 422],
    ['評価が下限未満', { ...validAnswer, eventRating: 0 }, 422],
    ['評価が上限超過', { ...validAnswer, eventRating: 6 }, 422],
  ];

  for (const [name, payload, status, raw] of invalidCases) {
    await t.test(name, async () => {
      const response = await request('surveys', payload, raw);
      assert.equal(response.status, status);
      assert.equal(response.body.success, false);
      assert.equal(typeof response.body.error, 'string');
      assert.ok(response.body.error.length > 0);
      assert.equal(typeof response.body.code, 'string');
      assert.ok(response.body.code.length > 0);
      assert.equal(response.body.surveyId, undefined);
    });
  }

  await t.test('不正な回答は保存されない', async () => {
    assert.equal((await getResults()).totalResponses, 0);
  });

  const feedbackText = 'フロントとバックの連携を体験できました。\n次回も参加したいです。';
  const longFeedback = 'あ'.repeat(1000);
  const ids = new Set();

  async function submit(answer) {
    const response = await request('surveys', answer);
    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(typeof response.body.message, 'string');
    assert.ok(response.body.message.length > 0);
    assert.equal(typeof response.body.surveyId, 'string');
    assert.ok(response.body.surveyId.length > 0);
    assert.ok(!ids.has(response.body.surveyId), '回答 ID は一意である必要があります。');
    ids.add(response.body.surveyId);
  }

  await t.test('未所属の回答を登録できる', async () => {
    await submit({ ...validAnswer, feedback: feedbackText });
  });

  await t.test('複数選択と文字数の上限ちょうどを登録できる', async () => {
    await submit({
      communityAffiliation: ['VS Code Meetup', 'GitHub dockyard'],
      jobRole: ['バックエンドエンジニア', 'その他'],
      jobRoleOther: 'あ'.repeat(100),
      eventRating: 3,
      feedback: longFeedback,
    });
  });

  await t.test('重複選択は二重集計せず空白の自由記述は一覧に出さない', async () => {
    await submit({
      communityAffiliation: ['VS Code Meetup', 'VS Code Meetup'],
      jobRole: ['バックエンドエンジニア', 'バックエンドエンジニア'],
      eventRating: 1,
      feedback: '   ',
    });
  });

  await t.test('同時登録でも回答を欠落させない', async () => {
    await Promise.all(
      [1, 2, 3, 4, 5].map((eventRating) =>
        submit({ communityAffiliation: [], jobRole: ['DevOpsエンジニア'], eventRating }),
      ),
    );
  });

  await t.test('登録した 8 件を正確に集計する', async () => {
    const data = await getResults();
    assert.equal(data.totalResponses, 8);
    assert.deepEqual(data.communityAffiliation, {
      'VS Code Meetup': 2,
      'GitHub dockyard': 1,
      'どちらでもない': 6,
    });
    assert.deepEqual(data.jobRole, {
      'フロントエンドエンジニア': 1,
      'バックエンドエンジニア': 2,
      'フルスタックエンジニア': 0,
      'DevOpsエンジニア': 5,
      'データエンジニア': 0,
      'モバイルエンジニア': 0,
      'その他': 1,
    });
    assert.equal(data.eventRating.average, 3);
    assert.deepEqual(data.eventRating.distribution, { 1: 2, 2: 1, 3: 2, 4: 1, 5: 2 });
    assert.equal(data.feedback.length, 2);
    assert.deepEqual(
      data.feedback.map((item) => item.feedback).sort(),
      [feedbackText, longFeedback].sort(),
    );
    for (const item of data.feedback) {
      assert.ok(ids.has(item.id));
      assert.ok(Number.isFinite(Date.parse(item.timestamp)));
      assert.match(item.timestamp, /(?:Z|\+00:00)$/);
    }
  });
});
