import { randomUUID } from "node:crypto";
export const adminId = "10000000-0000-4000-8000-000000000010";
export const sampleId = "e2000000-0000-4000-8000-000000000001";

export async function seedExample(db) {
  await db.query("insert into auth.users(id) values ($1)", [adminId]);
  await db.query("insert into private.admin_memberships(user_id) values ($1)", [
    adminId,
  ]);
  return (
    await db.query("select private.install_example_survey($1) as id", [adminId])
  ).rows[0].id;
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
