import { test } from "node:test";
import assert from "node:assert/strict";
import { startPostgres } from "./postgres.mjs";
import {
  seedExample,
  assignUser,
  validAnswers,
  sampleId,
  adminId,
} from "../database/fixtures.mjs";

test("independent PostgreSQL sessions serialize duplicate submissions and archival correctly", async () => {
  const cluster = await startPostgres();
  try {
    await seedExample(cluster.db);
    const user = await assignUser(cluster.db);
    const answers = JSON.stringify(await validAnswers(cluster.db));
    const clients = await Promise.all(
      Array.from({ length: 6 }, () => cluster.connect()),
    );
    for (const client of clients) {
      await client.query("set role authenticated");
      await client.query(
        "select set_config('request.jwt.claim.sub',$1,false)",
        [user.userId],
      );
    }
    const receipts = await Promise.all(
      clients.map((c) =>
        c.query("select public.submit_survey($1,$2) as receipt", [
          user.assignmentId,
          answers,
        ]),
      ),
    );
    assert.equal(new Set(receipts.map((r) => r.rows[0].receipt.id)).size, 1);
    assert.equal(
      (
        await cluster.db.query(
          "select count(*)::int as n,sum(amount)::int as points from public.points_ledger",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await cluster.db.query(
          "select sum(amount)::int as points from public.points_ledger",
        )
      ).rows[0].points,
      100,
    );

    // Promotion wins: a waiting submission must recheck membership after the lock.
    const promoted = await assignUser(cluster.db);
    const promoter = await cluster.connect();
    const blockedUser = await cluster.connect();
    await blockedUser.query("set role authenticated");
    await blockedUser.query(
      "select set_config('request.jwt.claim.sub',$1,false)",
      [promoted.userId],
    );
    await promoter.query("begin");
    await promoter.query(
      "insert into private.admin_memberships(user_id) values ($1)",
      [promoted.userId],
    );
    const denied = assert.rejects(
      blockedUser.query("select public.submit_survey($1,$2)", [
        promoted.assignmentId,
        answers,
      ]),
      { code: "42501" },
    );
    await promoter.query("commit");
    await denied;
    // Submission wins: promotion waits, and future replay is denied without deleting history.
    await clients[0].query("begin");
    await clients[0].query("select public.submit_survey($1,$2)", [
      user.assignmentId,
      answers,
    ]);
    const promotion = promoter.query(
      "insert into private.admin_memberships(user_id) values ($1)",
      [user.userId],
    );
    await clients[0].query("commit");
    await promotion;
    await assert.rejects(
      clients[0].query("select public.submit_survey($1,$2)", [
        user.assignmentId,
        answers,
      ]),
      { code: "42501" },
    );

    const other = await assignUser(cluster.db);
    const writer = await cluster.connect(),
      participant = await cluster.connect();
    await participant.query("set role authenticated");
    await participant.query(
      "select set_config('request.jwt.claim.sub',$1,false)",
      [other.userId],
    );
    await writer.query("begin");
    await writer.query(
      "update public.surveys set status='archived',archived_at=now() where id=$1",
      [sampleId],
    );
    const pending = participant.query("select public.submit_survey($1,$2)", [
      other.assignmentId,
      answers,
    ]);
    const rejected = assert.rejects(pending, { code: "P0002" });
    await writer.query("commit");
    await rejected;
    assert.equal(
      (
        await cluster.db.query(
          "select count(*)::int as n from public.survey_submissions",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await cluster.close();
  }
});

test("push retries, promotion, stale approval and import leases serialize across sessions", async () => {
  const cluster = await startPostgres();
  try {
    await seedExample(cluster.db);
    const user = await assignUser(cluster.db);
    const admin = await cluster.connect(),
      otherAdmin = await cluster.connect(),
      writer = await cluster.connect();
    for (const c of [admin, otherAdmin]) {
      await c.query("set role authenticated");
      await c.query("select set_config('request.jwt.claim.sub',$1,false)", [
        adminId,
      ]);
    }
    const template = (
      await admin.query("select public.admin_survey($1) as d", [sampleId])
    ).rows[0].d;
    const definition = {
      title: "Concurrent draft",
      description: "",
      reward_points: 10,
      questions: template.questions.map((q) => {
        const copy = { ...q };
        delete copy.id;
        return copy;
      }),
    };
    const draft = (
      await admin.query("select public.admin_save_survey(null,null,$1) as d", [
        JSON.stringify(definition),
      ])
    ).rows[0].d;
    await admin.query("select public.admin_approve_survey($1,$2)", [
      draft.id,
      draft.definition_version,
    ]);
    const request = (await writer.query("select gen_random_uuid() as id"))
      .rows[0].id;
    const args = [
      draft.id,
      draft.definition_version,
      "selected",
      [user.userId],
      request,
    ];
    const results = await Promise.all(
      [admin, otherAdmin].map((c) =>
        c.query("select public.admin_push_survey($1,$2,$3,$4,$5) as d", args),
      ),
    );
    assert.deepEqual(results[0].rows[0].d, results[1].rows[0].d);
    await writer.query("begin");
    await writer.query(
      "insert into private.admin_memberships(user_id) values ($1)",
      [user.userId],
    );
    const denied = assert.rejects(
      admin.query(
        "select public.admin_push_survey($1,$2,'selected',$3,gen_random_uuid())",
        [draft.id, draft.definition_version, [user.userId]],
      ),
      { code: "22023" },
    );
    await writer.query("commit");
    await denied;
    const second = await assignUser(cluster.db);
    const copy = (
      await admin.query("select public.admin_copy_survey($1) as d", [draft.id])
    ).rows[0].d;
    await admin.query("select public.admin_approve_survey($1,$2)", [
      copy.id,
      copy.definition_version,
    ]);
    await writer.query("begin");
    await writer.query(
      "update public.surveys set title='Changed after approval' where id=$1",
      [copy.id],
    );
    const stale = assert.rejects(
      admin.query(
        "select public.admin_push_survey($1,$2,'selected',$3,gen_random_uuid())",
        [copy.id, copy.definition_version, [second.userId]],
      ),
      { code: "40001" },
    );
    await writer.query("commit");
    await stale;
    const meta = {
      hash: "a".repeat(64),
      filename: "request.txt",
      mime: "text/plain",
      bytes: 100,
      reward_points: 10,
      model: "gemini-3.6-flash",
      prompt_version: "pollpoint-v1",
    };
    const imports = await Promise.allSettled(
      [admin, otherAdmin].map((c) =>
        c.query("select public.admin_begin_import($1,$2)", [
          request,
          JSON.stringify(meta),
        ]),
      ),
    );
    assert.equal(imports.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      imports.find((r) => r.status === "rejected").reason.code,
      "55P03",
    );
  } finally {
    await cluster.close();
  }
});
