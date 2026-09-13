import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
export const adminId = "10000000-0000-4000-8000-000000000010";
export const sampleId = "e2000000-0000-4000-8000-000000000001";

export async function seedExample(db) {
  await db.query("insert into auth.users(id) values ($1)", [adminId]);
  await db.query("insert into private.admin_memberships(user_id) values ($1)", [
    adminId,
  ]);
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260913000400_example_survey.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const definition = JSON.parse(migration.split("$definition$")[1]);
  const countries = JSON.parse(migration.split("$countries$")[1]);
  await db.query(
    "insert into public.surveys(id,title,description,reward_points,created_by) values ($1,'Everyday life, your way','Everyday habits and choices',100,$2)",
    [sampleId, adminId],
  );
  for (const [position, item] of definition.entries()) {
    if (item.key === "country") item.config.options = countries;
    const {
      rows: [q],
    } = await db.query(
      `insert into public.survey_questions(survey_id,position,section,field_key,type,presentation,prompt,required,config)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [
        sampleId,
        position,
        item.section,
        item.key,
        item.type,
        item.presentation,
        item.prompt,
        item.required ?? true,
        JSON.stringify(item.config),
      ],
    );
    if (item.check)
      await db.query(
        "insert into private.question_checks(question_id,rule) values ($1,$2)",
        [q.id, JSON.stringify(item.check)],
      );
  }
  await db.query(
    "update public.surveys set approved_by=created_by,approved_at=now(),approved_definition_version=definition_version where id=$1",
    [sampleId],
  );
  await db.query(
    "update public.surveys set status='published',published_at=now() where id=$1",
    [sampleId],
  );
  return sampleId;
}

export async function assignUser(db, surveyId = sampleId) {
  const userId = randomUUID();
  await db.query("insert into auth.users(id) values ($1)", [userId]);
  const {
    rows: [push],
  } = await db.query(
    `insert into public.survey_pushes(survey_id,audience,created_by,request_id,request_fingerprint,targeted_count,new_assignment_count)
    values ($1,'selected',$2,$3,'isolated-test',1,1) returning id`,
    [surveyId, adminId, randomUUID()],
  );
  await db.query("insert into public.survey_push_targets values ($1,$2)", [
    push.id,
    userId,
  ]);
  const {
    rows: [assignment],
  } = await db.query(
    "insert into public.survey_assignments(survey_id,user_id,first_push_id) values ($1,$2,$3) returning id",
    [surveyId, userId, push.id],
  );
  return { userId, assignmentId: assignment.id };
}

export async function validAnswers(db, surveyId = sampleId) {
  const { rows } = await db.query(
    "select * from public.survey_questions where survey_id=$1 order by position",
    [surveyId],
  );
  return rows
    .filter((q) => q.required)
    .map((q) => ({
      question_id: q.id,
      answer:
        q.type === "integer"
          ? { declined: true }
          : q.type === "text"
            ? { text: "Wireless earbuds" }
            : q.type === "multi_choice"
              ? { option_ids: [q.config.options[0].id] }
              : { option_id: q.config.options[0].id },
    }));
}

// Isolated history fixtures use real publication and submission validation.
export async function completeHistory(db, userId, count, reward = 7) {
  for (let i = 0; i < count; i++) {
    const surveyId = randomUUID(),
      pushId = randomUUID(),
      assignmentId = randomUUID();
    await db.query(
      "insert into public.surveys(id,title,reward_points,created_by) values ($1,$2,$3,$4)",
      [surveyId, `History survey ${i + 1}`, i === 0 ? 0 : reward, adminId],
    );
    await db.query(
      `insert into public.survey_questions(survey_id,position,section,field_key,type,presentation,prompt,required,config)
      select $1,position,section,field_key,type,presentation,prompt,required,config from public.survey_questions where survey_id=$2`,
      [surveyId, sampleId],
    );
    await db.query(
      "update public.surveys set approved_by=created_by,approved_at=now(),approved_definition_version=definition_version where id=$1",
      [surveyId],
    );
    await db.query(
      "update public.surveys set status='published',published_at=now() where id=$1",
      [surveyId],
    );
    await db.query(
      `insert into public.survey_pushes(id,survey_id,audience,created_by,request_id,request_fingerprint,targeted_count,new_assignment_count)
      values ($1,$2,'selected',$3,gen_random_uuid(),'history-fixture',1,1)`,
      [pushId, surveyId, adminId],
    );
    await db.query("insert into public.survey_push_targets values ($1,$2)", [
      pushId,
      userId,
    ]);
    await db.query(
      "insert into public.survey_assignments(id,survey_id,user_id,first_push_id) values ($1,$2,$3,$4)",
      [assignmentId, surveyId, userId, pushId],
    );
    const answers = await validAnswers(db, surveyId);
    const { asRole } = await import("./harness.mjs");
    await asRole(db, "authenticated", userId, (sql) =>
      sql.query("select public.submit_survey($1,$2)", [
        assignmentId,
        JSON.stringify(answers),
      ]),
    );
    await db.query(
      "update public.surveys set status='archived',archived_at=now() where id=$1",
      [surveyId],
    );
  }
}
