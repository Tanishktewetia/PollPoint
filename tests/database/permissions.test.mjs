import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, asRole } from "./harness.mjs";

const owner = "10000000-0000-4000-8000-000000000001";
const alice = "10000000-0000-4000-8000-000000000002";
const bob = "10000000-0000-4000-8000-000000000003";
const survey = "20000000-0000-4000-8000-000000000001";
const draft = "20000000-0000-4000-8000-000000000002";
const question = "30000000-0000-4000-8000-000000000001";
const push = "40000000-0000-4000-8000-000000000001";
const assignment = "50000000-0000-4000-8000-000000000001";
const submission = "60000000-0000-4000-8000-000000000001";
let db;

before(async () => {
  db = await createDatabase();
  await db.query(
    "insert into auth.users(id, raw_user_meta_data) values ($1, '{}'), ($2, '{\"role\":\"admin\"}'), ($3, '{}')",
    [owner, alice, bob],
  );
  await asRole(db, "service_role", null, (sql) =>
    sql.query("select public.bootstrap_first_admin($1)", [owner]),
  );
  await db.query(
    "insert into public.surveys(id,title,reward_points,created_by) values ($1,'Published test',50,$3), ($2,'Private draft',10,$3)",
    [survey, draft, owner],
  );
  await db.query(
    `insert into public.survey_questions(id,survey_id,position,section,field_key,type,presentation,prompt,config)
    values ($1,$2,4,'body','attention','single_choice','radio_cards','Pick blue','{"version":1,"options":[{"id":"blue","label":"Blue"},{"id":"red","label":"Red"}]}')`,
    [question, survey],
  );
  for (const [position, key] of [
    "age",
    "income_bracket",
    "marital_status",
    "country",
  ].entries()) {
    await db.query(
      `insert into public.survey_questions(survey_id,position,section,field_key,type,presentation,prompt,config)
      values ($1,$2,'demographics',$3,$4,$5,$3,$6)`,
      [
        survey,
        position,
        key,
        key === "age" ? "integer" : "single_choice",
        key === "age" ? "number_input" : "dropdown",
        JSON.stringify(
          key === "age"
            ? { version: 1, min: 0, max: 120, allow_decline: true }
            : {
                version: 1,
                options: [
                  { id: "prefer_not_to_say", label: "Prefer not to say" },
                ],
              },
        ),
      ],
    );
  }
  await db.query(
    `insert into private.question_checks(question_id,rule) values ($1,'{"version":1,"operator":"equals_option","expected_option_id":"blue"}')`,
    [question],
  );
  await db.query(
    "update public.surveys set approved_by=created_by,approved_at=now(),approved_definition_version=definition_version where id=$1",
    [survey],
  );
  await db.query(
    "update public.surveys set status='published', published_at=now() where id=$1",
    [survey],
  );
  await db.query(
    `insert into public.survey_pushes(id,survey_id,audience,created_by,request_id,request_fingerprint,targeted_count,new_assignment_count)
    values ($1,$2,'selected',$3,gen_random_uuid(),'test',1,1)`,
    [push, survey, owner],
  );
  await db.query("insert into public.survey_push_targets values ($1,$2)", [
    push,
    alice,
  ]);
  await db.query(
    "insert into public.survey_assignments(id,survey_id,user_id,first_push_id) values ($1,$2,$3,$4)",
    [assignment, survey, alice, push],
  );
  await db.query(
    `insert into public.survey_submissions(id,assignment_id,survey_id,user_id,survey_title_snapshot,reward_points_snapshot)
    values ($1,$2,$3,$4,'Published test',50)`,
    [submission, assignment, survey, alice],
  );
  await db.query(
    `insert into public.submission_answers values ($1,$2,$3,'{"option_id":"red"}')`,
    [submission, survey, question],
  );
  await db.query(
    `insert into private.response_flags(submission_id,question_id,rule_version,reason_code)
    values ($1,$2,1,'attention_check_failed')`,
    [submission, question],
  );
  await db.query(
    "insert into public.points_ledger(user_id,submission_id,amount) values ($1,$2,50)",
    [alice, submission],
  );
});
after(async () => {
  await db?.close();
});

test("clean migration replay enables RLS on every application table", async () => {
  const { rows } =
    await db.query(`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind='r'`);
  assert.equal(rows.length, 13);
  assert.ok(rows.every((row) => row.relrowsecurity));
});

test("signup provisions a profile but ignores forged admin metadata", async () => {
  assert.equal(
    (await db.query("select count(*)::int as n from public.profiles")).rows[0]
      .n,
    3,
  );
  await asRole(db, "authenticated", alice, async (sql) => {
    assert.equal(
      (await sql.query("select public.is_admin() as admin")).rows[0].admin,
      false,
    );
    assert.deepEqual((await sql.query("select id from public.profiles")).rows, [
      { id: alice },
    ]);
  });
});

test("anonymous clients cannot read application data or execute protected RPCs", async () => {
  for (const query of [
    "select * from public.profiles",
    "select * from public.surveys",
    "select public.is_admin()",
    "select public.admin_session()",
  ])
    await assert.rejects(
      asRole(db, "anon", null, (sql) => sql.query(query)),
      { code: "42501" },
    );
});

test("users see only assigned surveys and own responses and awards", async () => {
  await asRole(db, "authenticated", alice, async (sql) => {
    assert.deepEqual((await sql.query("select id from public.surveys")).rows, [
      { id: survey },
    ]);
    assert.equal(
      (await sql.query("select * from public.survey_questions")).rows.length,
      5,
    );
    assert.equal(
      (await sql.query("select * from public.submission_answers")).rows.length,
      1,
    );
    assert.equal(
      (
        await sql.query(
          "select sum(amount)::int as amount from public.points_ledger",
        )
      ).rows[0].amount,
      50,
    );
    assert.equal(
      (await sql.query("select * from public.survey_pushes")).rows.length,
      0,
    );
  });
  await asRole(db, "authenticated", bob, async (sql) => {
    for (const table of [
      "surveys",
      "survey_questions",
      "survey_assignments",
      "survey_submissions",
      "submission_answers",
      "points_ledger",
    ])
      assert.equal(
        (await sql.query(`select * from public.${table}`)).rows.length,
        0,
        table,
      );
  });
});

test("even authenticated admins cannot directly mutate critical tables", async () => {
  for (const user of [alice, owner]) {
    for (const query of [
      "update public.points_ledger set amount=999",
      "delete from public.survey_submissions",
      "update public.profiles set display_name='Injected'",
      "update public.surveys set reward_points=999",
      "delete from public.survey_assignments",
    ])
      await assert.rejects(
        asRole(db, "authenticated", user, (sql) => sql.query(query)),
        { code: "42501" },
      );
  }
});

test("private checks, flags, and membership remain inaccessible over user credentials", async () => {
  for (const user of [alice, owner]) {
    for (const table of [
      "admin_memberships",
      "question_checks",
      "response_flags",
    ])
      await assert.rejects(
        asRole(db, "authenticated", user, (sql) =>
          sql.query(`select * from private.${table}`),
        ),
        { code: "42501" },
      );
  }
});

test("admin RPC rejects ordinary users and accepts database-backed admins", async () => {
  await assert.rejects(
    asRole(db, "authenticated", alice, (sql) =>
      sql.query("select public.admin_session()"),
    ),
    { code: "42501" },
  );
  await asRole(db, "authenticated", owner, async (sql) => {
    assert.equal(
      (await sql.query("select public.admin_session() as allowed")).rows[0]
        .allowed,
      true,
    );
    assert.equal(
      (await sql.query("select * from public.profiles")).rows.length,
      3,
    );
    assert.equal(
      (await sql.query("select * from public.surveys")).rows.length,
      2,
    );
  });
});

test("bootstrap cannot be called by users and cannot configure a second first admin", async () => {
  await assert.rejects(
    asRole(db, "authenticated", alice, (sql) =>
      sql.query("select public.bootstrap_first_admin($1)", [alice]),
    ),
    { code: "42501" },
  );
  await assert.rejects(
    asRole(db, "service_role", null, (sql) =>
      sql.query("select public.bootstrap_first_admin($1)", [bob]),
    ),
    { code: "23505" },
  );
});

test("display-name RPC updates only the caller", async () => {
  await asRole(db, "authenticated", alice, (sql) =>
    sql.query("select public.update_display_name('Alice')"),
  );
  assert.equal(
    (
      await db.query("select display_name from public.profiles where id=$1", [
        alice,
      ])
    ).rows[0].display_name,
    "Alice",
  );
  assert.equal(
    (
      await db.query("select display_name from public.profiles where id=$1", [
        bob,
      ])
    ).rows[0].display_name,
    null,
  );
});

test("historical writes and duplicate or mismatched awards are rejected by database constraints", async () => {
  await assert.rejects(
    db.query("update public.surveys set reward_points=999 where id=$1", [
      survey,
    ]),
    { code: "23514" },
  );
  await assert.rejects(
    db.query(
      "update public.survey_questions set prompt='Changed' where id=$1",
      [question],
    ),
    { code: "23514" },
  );
  await assert.rejects(
    db.query("delete from private.question_checks where question_id=$1", [
      question,
    ]),
    { code: "23514" },
  );
  await assert.rejects(db.query("update public.points_ledger set amount=999"), {
    code: "23514",
  });
  await assert.rejects(
    db.query(
      "insert into public.points_ledger(user_id,submission_id,amount) values ($1,$2,50)",
      [alice, submission],
    ),
    { code: "23505" },
  );
  await assert.rejects(
    db.query(
      "insert into public.points_ledger(user_id,submission_id,amount) values ($1,$2,999)",
      [alice, submission],
    ),
    { code: "23514" },
  );
});

test("archived surveys remain readable in their owner's completed history", async () => {
  await db.query(
    "update public.surveys set status='archived', archived_at=now() where id=$1",
    [survey],
  );
  await asRole(db, "authenticated", alice, async (sql) => {
    assert.equal(
      (await sql.query("select * from public.surveys")).rows.length,
      1,
    );
    assert.equal(
      (await sql.query("select * from public.points_ledger")).rows.length,
      1,
    );
  });
  await assert.rejects(
    db.query(
      "update public.surveys set status='published',archived_at=null where id=$1",
      [survey],
    ),
    { code: "23514" },
  );
});
