import {before,after,test} from "node:test";
import assert from "node:assert/strict";
import {createDatabase,asRole} from "./harness.mjs";
import {seedExample,assignUser,completeHistory,adminId} from "./fixtures.mjs";
let db,user,other;
before(async()=>{db=await createDatabase();await seedExample(db);user=await assignUser(db);other=await assignUser(db);});
after(async()=>{await db?.close();});
const history=(id,page=1)=>asRole(db,"authenticated",id,async sql=>(await sql.query("select public.participant_history($1) as value",[page])).rows[0].value);
test("empty history has a zero string balance and no completion for assignments",async()=>{
  assert.deepEqual(await history(user.userId),{total_points:"0",entries:[]});
});
test("archived completions retain snapshots, zero rewards and a reconciled bigint total across pages",async()=>{
  await completeHistory(db,user.userId,23,2147483647);
  const first=await history(user.userId),second=await history(user.userId,2);
  assert.equal(first.entries.length,21);
  assert.equal(second.entries.length,3);
  assert.equal(first.total_points,(22n*2147483647n).toString());
  assert.equal(second.total_points,first.total_points);
  assert.equal(new Set([...first.entries.slice(0,20),...second.entries].map(e=>e.id)).size,23);
  assert.ok(second.entries.some(e=>e.title==="History survey 1" && e.points===0));
  const snapshots=(await db.query("select id,survey_title_snapshot as title,reward_points_snapshot as points from public.survey_submissions where user_id=$1",[user.userId])).rows;
  for(const e of [...first.entries,...second.entries]) assert.ok(snapshots.some(s=>s.id===e.id&&s.title===e.title&&s.points===e.points));
  const ledger=(await db.query("select sum(amount)::text as total from public.points_ledger where user_id=$1",[user.userId])).rows[0];
  assert.equal(first.total_points,ledger.total);
  assert.deepEqual(await history(user.userId,0),first);
  assert.deepEqual(await history(user.userId,null),first);
  assert.deepEqual((await history(user.userId,99999)).entries,[]);
});
test("history isolates users, denies anonymous callers and excludes promoted admins",async()=>{
  assert.deepEqual(await history(other.userId),{total_points:"0",entries:[]});
  await assert.rejects(asRole(db,"anon",null,sql=>sql.query("select public.participant_history(1)")),{code:"42501"});
  await assert.rejects(history(adminId),{code:"42501"});
  await db.query("insert into private.admin_memberships(user_id) values ($1)",[user.userId]);
  await assert.rejects(history(user.userId),{code:"42501"});
});
