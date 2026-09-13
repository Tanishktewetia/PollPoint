import { test } from "node:test";
import assert from "node:assert/strict";
import { answerError, questionSchema, submissionSchema } from "../../src/lib/survey/schema.ts";

const base = { id:"10000000-0000-4000-8000-000000000001",field_key:"test",section:"body",prompt:"Example",required:true };
test("numeric answers allow zero and explicit decline but reject decimals and missing values",()=>{
  const q=questionSchema.parse({...base,type:"integer",presentation:"number_input",config:{version:1,min:0,max:120,allow_decline:true}});
  assert.equal(answerError(q,{value:0}),null);
  assert.equal(answerError(q,{declined:true}),null);
  assert.ok(answerError(q,{value:1.5}));
  assert.ok(answerError(q,undefined));
});
test("selection validation rejects unknown, duplicate, and exclusive combinations",()=>{
  const q=questionSchema.parse({...base,type:"multi_choice",presentation:"checkbox_cards",config:{version:1,min:1,max:2,exclusive_option_ids:["none"],options:[{id:"a",label:"A"},{id:"none",label:"None"}]}});
  assert.equal(answerError(q,{option_ids:["none"]}),null);
  for(const option_ids of [[],["a","a"],["a","none"],["unknown"]])assert.ok(answerError(q,{option_ids}));
});
test("text length counts Unicode code points and ignores surrounding whitespace",()=>{
  const q=questionSchema.parse({...base,type:"text",presentation:"short_text",config:{version:1,min:1,max:2}});
  assert.equal(answerError(q,{text:" 😀😀 "}),null);
  assert.ok(answerError(q,{text:"\t\n\u00a0"}));
  assert.ok(answerError(q,{text:"abc"}));
});
test("submission payload cannot carry caller-controlled points or identity",()=>{
  const payload={assignmentId:base.id,answers:[{question_id:base.id,answer:{value:12}}]};
  assert.equal(submissionSchema.safeParse(payload).success,true);
  assert.equal(submissionSchema.safeParse({...payload,points:999}).success,false);
  assert.equal(submissionSchema.safeParse({...payload,userId:base.id}).success,false);
});
