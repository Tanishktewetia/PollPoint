import { test } from "node:test";
import assert from "node:assert/strict";
import { startPostgres } from "./postgres.mjs";
import {
  seedExample,
  assignUser,
  validAnswers,
  sampleId,
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
    await blockedUser.query("select set_config('request.jwt.claim.sub',$1,false)",[promoted.userId]);
    await promoter.query("begin");
    await promoter.query("insert into private.admin_memberships(user_id) values ($1)",[promoted.userId]);
    const denied = assert.rejects(blockedUser.query("select public.submit_survey($1,$2)",[promoted.assignmentId,answers]),{code:"42501"});
    await promoter.query("commit");
    await denied;
    // Submission wins: promotion waits, and future replay is denied without deleting history.
    await clients[0].query("begin");
    await clients[0].query("select public.submit_survey($1,$2)",[user.assignmentId,answers]);
    const promotion = promoter.query("insert into private.admin_memberships(user_id) values ($1)",[user.userId]);
    await clients[0].query("commit");
    await promotion;
    await assert.rejects(clients[0].query("select public.submit_survey($1,$2)",[user.assignmentId,answers]),{code:"42501"});

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
