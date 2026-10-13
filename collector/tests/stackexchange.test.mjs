import test from "node:test";
import assert from "node:assert/strict";
import {searchURL,extractQuestions,collectStack,SE_TOPICS} from "../src/stackexchange.js";
const now=Date.parse("2026-10-13T00:00:00Z");
const t=SE_TOPICS[0];
const item=(id,title,body="I need to compress photo files")=>({question_id:id,title,body,link:"https://superuser.com/questions/"+id+"/title",
  creation_date:Math.floor(Date.parse("2026-10-10T00:00:00Z")/1000)});
test("API search uses official endpoint, site constraint and 365-day date window",()=>{
  const url=new URL(searchURL(t,now));
  assert.equal(url.hostname,"api.stackexchange.com");
  assert.equal(url.searchParams.get("site"),"superuser");
  assert.equal(url.searchParams.get("filter"),"withbody");
});
test("real Q&A questions retain source/title/date, never invent Google demand",()=>{
  const questions=extractQuestions({items:[
    item(1,"How do I compress photos in a batch?", "<p>I have 500 images to compress</p>"),
    item(2,"Release notes photo compressor!", "<p>compress image</p>"),
    item(1,"How do I compress photos in a batch?")]},t,now);
  assert.equal(questions.length,1);
  assert.match(questions[0].url,/superuser.com\/questions\/1/);
  assert.equal(questions[0].source,"stackexchange-api-v2.3");
  assert.equal(questions[0].note.includes("<p>"),false);
  assert.equal(questions[0].monthly_searches,undefined);
});
test("rejects irrelevant, stale, and unknown outbound domains",()=>{
  const stale=item(3,"How can I compress photos?");stale.creation_date=1500000000;
  const evil=item(4,"How do I compress photos?");evil.link="https://attacker.example/questions/4";
  assert.equal(extractQuestions({items:[stale,evil,item(5,"How can I compress a PDF?","some other content")]},t,now).length,0);
});
test("backoff stops additional Stack Exchange requests without bypass",async()=>{
  let count=0;
  const result=await collectStack(SE_TOPICS.slice(0,3),now,async()=>{
    count++;return {ok:true,json:async()=>({items:[item(9,"How do I compress photos in bulk?")],backoff:40})};
  },async()=>1);
  assert.equal(count,1);assert.equal(result.backoff_seconds,40);
});
test("no matching questions, no write to D1",async()=>{
  let saves=0;const res=await collectStack([t],now,async()=>({ok:true,json:async()=>({items:[]})}),async()=>{saves++});
  assert.equal(saves,0);assert.equal(res.matched,0);
});
