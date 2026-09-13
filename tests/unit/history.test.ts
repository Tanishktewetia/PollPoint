import {test} from "node:test";
import assert from "node:assert/strict";
import {historySchema,formatPoints} from "../../src/lib/survey/history.ts";
test("history preserves decimal-string balances above JavaScript safe integer precision",()=>{
  const value="9007199254740993";
  assert.equal(historySchema.parse({total_points:value,entries:[]}).total_points,value);
  assert.equal(formatPoints(value).replaceAll(",",""),value);
  assert.equal(formatPoints("0"),"0");
  for(const total_points of [9007199254740992,"1.5","-1","1e10"])
    assert.equal(historySchema.safeParse({total_points,entries:[]}).success,false);
});
