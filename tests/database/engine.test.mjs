import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, asRole } from "./harness.mjs";
import {
  seedExample,
  assignUser,
  validAnswers,
  sampleId,
  adminId,
} from "./fixtures.mjs";

let db, user, answers;
before(async () => {
  db = await createDatabase();
  await seedExample(db);
  user = await assignUser(db);
  answers = await validAnswers(db);
});
after(async () => {
  await db?.close();
});
const submit = (payload = answers, target = user) =>
  asRole(db, "authenticated", target.userId, (sql) =>
    sql.query("select public.submit_survey($1,$2::jsonb) as receipt", [
      target.assignmentId,
      JSON.stringify(payload),
    ]),
  );

test("sample contains every supported format and is assigned only to intended users", async () => {
  const { rows } = await db.query(
    "select type,presentation from public.survey_questions where survey_id=$1",
    [sampleId],
  );
  assert.equal(rows.length, 11);
  assert.equal(new Set(rows.map((q) => q.presentation)).size, 6);
  const countries = (
    await db.query(
      "select config from public.survey_questions where field_key='country' and survey_id=$1",
      [sampleId],
    )
  ).rows[0].config.options;
  assert.equal(countries.length, 250);
  await asRole(db, "authenticated", user.userId, async (sql) => {
    const cards = (
      await sql.query("select public.available_surveys(1) as cards")
    ).rows[0].cards;
    assert.equal(cards.length, 1);
    const view = (
      await sql.query("select public.assigned_survey($1) as survey", [
        user.assignmentId,
      ])
    ).rows[0].survey;
    assert.ok(!JSON.stringify(view).includes("expected_option_id"));
    assert.ok(!JSON.stringify(view).includes("equals_option"));
  });
});

test("invalid, missing, duplicate, extra, and cross-survey answers award nothing", async () => {
  const unknown = {
    question_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    answer: { option_id: "x" },
  };
  const multi = answers.find((a) => "option_ids" in a.answer);
  const cases = [
    [],
    answers.slice(1),
    [...answers, answers[0]],
    [...answers, unknown],
    answers.map((a, i) => (i === 0 ? { ...a, answer: { value: 121 } } : a)),
    answers.map((a) =>
      a === multi ? { ...a, answer: { option_ids: ["none", "watch"] } } : a,
    ),
    answers.map((a) =>
      a === multi ? { ...a, answer: { option_ids: ["watch", "watch"] } } : a,
    ),
    answers.map((a, i) =>
      i === 0 ? { ...a, answer: { declined: true, value: 30 } } : a,
    ),
    answers.map((a, i) => (i === 0 ? { ...a, points: 999 } : a)),
    answers.map((a) =>
      "text" in a.answer ? { ...a, answer: { text: "x".repeat(121) } } : a,
    ),
  ];
  for (const payload of cases)
    await assert.rejects(submit(payload), { code: "22023" });
  assert.equal(
    (await db.query("select count(*)::int as n from public.survey_submissions"))
      .rows[0].n,
    0,
  );
  assert.equal(
    (await db.query("select count(*)::int as n from public.points_ledger"))
      .rows[0].n,
    0,
  );
});

test("unassigned callers and anonymous users cannot submit or read another assignment", async () => {
  await assert.rejects(
    asRole(db, "authenticated", adminId, (sql) =>
      sql.query("select public.submit_survey($1,$2)", [
        user.assignmentId,
        JSON.stringify(answers),
      ]),
    ),
    { code: "42501" },
  );
  await assert.rejects(
    asRole(db, "anon", null, (sql) =>
      sql.query("select public.submit_survey($1,$2)", [
        user.assignmentId,
        JSON.stringify(answers),
      ]),
    ),
    { code: "42501" },
  );
  const view = await asRole(db, "authenticated", adminId, (sql) =>
    sql.query("select public.assigned_survey($1) as value", [
      user.assignmentId,
    ]),
  );
  assert.equal(view.rows[0].value, null);
});

test("transaction rolls back answers and flags if the ledger insert fails", async () => {
  await db.exec(`create function private.test_fail_credit() returns trigger language plpgsql as $$begin raise exception 'injected failure'; end;$$;
    create trigger test_fail_credit before insert on public.points_ledger for each row execute function private.test_fail_credit();`);
  await assert.rejects(submit(), { code: "P0001" });
  for (const table of [
    "public.survey_submissions",
    "public.submission_answers",
    "private.response_flags",
    "public.points_ledger",
  ])
    assert.equal(
      (await db.query(`select count(*)::int as n from ${table}`)).rows[0].n,
      0,
    );
  await db.exec(
    "drop trigger test_fail_credit on public.points_ledger; drop function private.test_fail_credit();",
  );
});

test("failed attention checks still earn full points, and retries return exactly one receipt", async () => {
  const first = (await submit()).rows[0].receipt;
  const retry = (await submit([])).rows[0].receipt;
  assert.deepEqual(retry, first);
  assert.equal(first.points, 100);
  assert.equal(
    (await db.query("select count(*)::int as n from private.response_flags"))
      .rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n,sum(amount)::int as points from public.points_ledger",
      )
    ).rows[0].points,
    100,
  );
  const cards = await asRole(db, "authenticated", user.userId, (sql) =>
    sql.query("select public.available_surveys(1) as cards"),
  );
  assert.equal(cards.rows[0].cards.length, 0);
});

test("correct attention answer has no flag and optional free text is accepted", async () => {
  const other = await assignUser(db);
  const questions = (
    await db.query(
      "select id,field_key from public.survey_questions where survey_id=$1",
      [sampleId],
    )
  ).rows;
  const check = questions.find((q) => q.field_key === "color_choice").id;
  const optional = questions.find(
    (q) => q.field_key === "shopping_improvement",
  ).id;
  const payload = answers.map((a) =>
    a.question_id === check ? { ...a, answer: { option_id: "blue" } } : a,
  );
  payload.push({
    question_id: optional,
    answer: { text: "More detailed product descriptions." },
  });
  const result = (await submit(payload, other)).rows[0].receipt;
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from private.response_flags where submission_id=$1",
        [result.id],
      )
    ).rows[0].n,
    0,
  );
});

test("archived surveys reject unfinished submissions but preserve completed receipts", async () => {
  const other = await assignUser(db);
  await db.query(
    "update public.surveys set status='archived',archived_at=now() where id=$1",
    [sampleId],
  );
  await assert.rejects(submit(answers, other), { code: "P0002" });
  const receipt = (await submit()).rows[0].receipt;
  assert.equal(receipt.points, 100);
});

test("publication rejects unsupported config, missing demographics and leaked check fields", async () => {
  await assert.rejects(
    db.query("select private.validate_question_config('single_choice',$1)", [
      JSON.stringify({
        version: 1,
        options: [{ id: "x", label: "X" }],
        expected_option_id: "x",
      }),
    ]),
    { code: "22023" },
  );
  await assert.rejects(
    db.query("select private.validate_question_config('text',$1)", [
      JSON.stringify({ version: 1, min: 0, max: 10000 }),
    ]),
    { code: "22023" },
  );
  const {
    rows: [draft],
  } = await db.query(
    "insert into public.surveys(title,reward_points,created_by) values ('Invalid',10,$1) returning id",
    [adminId],
  );
  await assert.rejects(
    db.query(
      "update public.surveys set status='published',published_at=now() where id=$1",
      [draft.id],
    ),
    { code: "22023" },
  );
});
