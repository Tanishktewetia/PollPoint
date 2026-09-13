import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase, asRole } from "./harness.mjs";
import {
  seedExample,
  assignUser,
  validAnswers,
  adminId,
  sampleId,
} from "./fixtures.mjs";
let db, user, definition, survey;
before(async () => {
  db = await createDatabase();
  await seedExample(db);
  user = await assignUser(db);
  await db.query(
    "update auth.users set email='participant@example.invalid' where id=$1",
    [user.userId],
  );
  const sample = await rpc("admin_survey", [sampleId]);
  definition = {
    title: "Shared builder test",
    description: "Requirements",
    reward_points: 25,
    questions: sample.questions.map((q) => {
      const copy = { ...q };
      delete copy.id;
      return copy;
    }),
  };
});
after(async () => {
  await db?.close();
});
async function rpc(name, args = [], caller = adminId) {
  return asRole(
    db,
    "authenticated",
    caller,
    async (sql) =>
      (
        await sql.query(
          `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as value`,
          args.map((v) =>
            v && typeof v === "object" && !Array.isArray(v)
              ? JSON.stringify(v)
              : v,
          ),
        )
      ).rows[0].value,
  );
}
test("admin endpoints deny participants and roster excludes admins without exposing Auth grants", async () => {
  for (const [name, args] of [
    ["admin_user_roster", [1]],
    ["admin_survey_list", [1]],
    ["admin_survey", [sampleId]],
    ["admin_responses", [sampleId, 1]],
    ["admin_save_survey", [null, null, definition]],
    ["admin_approve_survey", [sampleId, 1]],
    ["admin_push_survey", [sampleId, 1, "all", [], randomUUID()]],
  ])
    await assert.rejects(rpc(name, args, user.userId), { code: "42501" });
  const roster = await rpc("admin_user_roster", [1]);
  assert.equal(roster.length, 1);
  assert.equal(roster[0].email, "participant@example.invalid");
  assert.equal(roster[0].total_points, "0");
  await assert.rejects(
    asRole(db, "authenticated", adminId, (sql) =>
      sql.query("select email from auth.users"),
    ),
    { code: "42501" },
  );
});
test("manual saves validate, optimistic edits invalidate approval, first push publishes atomically", async () => {
  survey = await rpc("admin_save_survey", [null, null, definition]);
  assert.equal(survey.status, "draft");
  await assert.rejects(
    rpc("admin_push_survey", [
      survey.id,
      survey.definition_version,
      "all",
      [],
      randomUUID(),
    ]),
    { code: "22023" },
  );
  const approved = await rpc("admin_approve_survey", [
    survey.id,
    survey.definition_version,
  ]);
  assert.equal(
    approved.approved_definition_version,
    approved.definition_version,
  );
  survey = await rpc("admin_save_survey", [
    survey.id,
    survey.definition_version,
    { ...definition, title: "Edited survey" },
  ]);
  assert.equal(survey.approved_definition_version, null);
  await assert.rejects(
    rpc("admin_save_survey", [
      survey.id,
      approved.definition_version,
      definition,
    ]),
    { code: "40001" },
  );
  await assert.rejects(
    rpc("admin_save_survey", [
      survey.id,
      survey.definition_version,
      { ...definition, questions: definition.questions.slice(1) },
    ]),
    { code: "22023" },
  );
  survey = await rpc("admin_approve_survey", [
    survey.id,
    survey.definition_version,
  ]);
  await assert.rejects(
    rpc("admin_push_survey", [
      survey.id,
      survey.definition_version,
      "selected",
      [adminId],
      randomUUID(),
    ]),
    { code: "22023" },
  );
  assert.equal((await rpc("admin_survey", [survey.id])).status, "draft");
  const request = randomUUID(),
    args = [survey.id, survey.definition_version, "all", [], request];
  const first = await rpc("admin_push_survey", args);
  assert.equal(first.targeted, 1);
  assert.equal(first.assigned, 1);
  assert.deepEqual(await rpc("admin_push_survey", args), first);
  await assert.rejects(
    rpc("admin_push_survey", [
      survey.id,
      survey.definition_version,
      "selected",
      [user.userId],
      request,
    ]),
    { code: "22023" },
  );
  const later = await assignUser(db);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.survey_assignments where survey_id=$1 and user_id=$2",
        [survey.id, later.userId],
      )
    ).rows[0].n,
    0,
  );
  const again = await rpc("admin_push_survey", [
    survey.id,
    survey.definition_version,
    "all",
    [],
    randomUUID(),
  ]);
  assert.equal(again.targeted, 2);
  assert.equal(again.assigned, 1);
  assert.equal(again.already_assigned, 1);
  await assert.rejects(
    rpc("admin_save_survey", [
      survey.id,
      survey.definition_version,
      definition,
    ]),
    { code: "40001" },
  );
  const copy = await rpc("admin_copy_survey", [survey.id]);
  assert.equal(copy.status, "draft");
  assert.equal(copy.approved_definition_version, null);
});
test("admin review sees private quality flags and the roster reconciles earned totals", async () => {
  const answer = await validAnswers(db);
  await rpc(
    "submit_survey",
    [user.assignmentId, JSON.stringify(answer)],
    user.userId,
  );
  const responses = await rpc("admin_responses", [sampleId, 1]);
  assert.equal(responses.length, 1);
  assert.equal(responses[0].flags.length, 1);
  assert.equal(responses[0].points, 100);
  const roster = await rpc("admin_user_roster", [1]);
  assert.equal(roster.find((u) => u.id === user.userId).total_points, "100");
  await db.query("insert into private.admin_memberships(user_id) values ($1)", [
    user.userId,
  ]);
  assert.ok(
    !(await rpc("admin_user_roster", [1])).some((u) => u.id === user.userId),
  );
  assert.equal(
    (
      await db.query(
        "select sum(amount)::text total from public.points_ledger where user_id=$1",
        [user.userId],
      )
    ).rows[0].total,
    "100",
  );
});
test("import leases are owner-only, idempotent, bounded and persist into the shared review/approval path", async () => {
  const meta = {
    hash: "a".repeat(64),
    filename: "requirements.txt",
    mime: "text/plain",
    bytes: 100,
    reward_points: 75,
    model: "gemini-2.5-flash",
    prompt_version: "pollpoint-v1",
  };
  const request = randomUUID(),
    started = await rpc("admin_begin_import", [request, meta]);
  await assert.rejects(rpc("admin_begin_import", [request, meta]), {
    code: "55P03",
  });
  await assert.rejects(
    rpc("admin_begin_import", [request, { ...meta, hash: "b".repeat(64) }]),
    { code: "22023" },
  );
  assert.equal(
    await rpc("admin_import_status", [started.id], user.userId),
    null,
  );
  await assert.rejects(
    rpc(
      "admin_finish_import",
      [started.id, started.lease_token, definition],
      user.userId,
    ),
    { code: "42501" },
  );
  await assert.rejects(
    rpc("admin_finish_import", [started.id, randomUUID(), definition]),
    { code: "40001" },
  );
  await assert.rejects(
    rpc("admin_finish_import", [
      started.id,
      started.lease_token,
      { ...definition, questions: [] },
    ]),
    { code: "22023" },
  );
  await rpc("admin_fail_import", [
    started.id,
    started.lease_token,
    "invalid_draft",
  ]);
  const retry = await rpc("admin_begin_import", [request, meta]);
  assert.equal(retry.id, started.id);
  assert.notEqual(retry.lease_token, started.lease_token);
  const finished = await rpc("admin_finish_import", [
    retry.id,
    retry.lease_token,
    definition,
  ]);
  let imported = await rpc("admin_survey", [finished.survey_id]);
  assert.equal(imported.status, "needs_review");
  assert.equal(imported.reward_points, 75);
  assert.equal(imported.authoring_source, "gemini");
  assert.equal(
    (await rpc("admin_begin_import", [request, meta])).survey_id,
    imported.id,
  );
  await assert.rejects(
    rpc("admin_push_survey", [
      imported.id,
      imported.definition_version,
      "all",
      [],
      randomUUID(),
    ]),
    { code: "40001" },
  );
  const edits = {
    title: "Reviewed import",
    description: imported.description,
    reward_points: 75,
    questions: imported.questions.map((q) => {
      const copy = { ...q };
      delete copy.id;
      return copy;
    }),
  };
  imported = await rpc("admin_save_survey", [
    imported.id,
    imported.definition_version,
    edits,
  ]);
  assert.equal(imported.status, "needs_review");
  imported = await rpc("admin_approve_survey", [
    imported.id,
    imported.definition_version,
  ]);
  assert.equal(imported.status, "draft");
  const push = await rpc("admin_push_survey", [
    imported.id,
    imported.definition_version,
    "all",
    [],
    randomUUID(),
  ]);
  assert.equal(push.assigned, 1);
  const one = await rpc("admin_begin_import", [randomUUID(), meta]);
  await rpc("admin_begin_import", [randomUUID(), meta]);
  await assert.rejects(rpc("admin_begin_import", [randomUUID(), meta]), {
    code: "55P03",
  });
  await db.query(
    "update private.survey_imports set lease_expires_at=now()-interval '1 second' where id=$1",
    [one.id],
  );
  await assert.rejects(
    rpc("admin_finish_import", [one.id, one.lease_token, definition]),
    { code: "40001" },
  );
  await rpc("admin_begin_import", [randomUUID(), meta]);
  await db.query(
    "update private.survey_imports set status='failed',attempts=10 where id=$1",
    [one.id],
  );
  await assert.rejects(rpc("admin_begin_import", [randomUUID(), meta]), {
    code: "54000",
  });
});
