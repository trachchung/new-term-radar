import test from "node:test";
import assert from "node:assert/strict";
import worker, {testHooks} from "../src/worker.js";

const KEY="THIS_IS_A_TEST_ONLY_SECRET_WITH_32_CHARS";
function fakeDB(){
  const map=new Map(),events=[];
  return {
    map,events,
    prepare(sql){
      let args=[];
      const bind=(...values)=>{args=values;return stmt};
      const stmt={bind,
        async first(){
          if(sql.startsWith("SELECT review_status")){const v=map.get(args[0]);return v?{review_status:v.review_status,target_site:v.target_site}:null}
          if(sql.startsWith("SELECT count(*)"))return {count:[...map.values()].length};
          return null;
        },
        async all(){
          if(sql.startsWith("SELECT review_status,stage"))return {results:[]};
          if(sql.startsWith("SELECT intent_signature"))return {results:[]};
          if(sql.startsWith("SELECT * FROM opportunities"))return {results:[...map.values()]};
          return {results:[]};
        },
        async run(){
          if(sql.startsWith("INSERT INTO opportunities")){
            const [id,keyword,normalized_key,stage,rubric_score,origin_count,evidence_count,intent_signature,record_json]=args;
            const old=map.get(id);
            map.set(id,{id,keyword,normalized_key,stage,rubric_score,origin_count,evidence_count,intent_signature,
              record_json,review_status:old?.review_status||"inbox",decision_note:old?.decision_note||"",
              target_site:old?.target_site||"",imported_at:"2026-10-13",decision_updated_at:old?.decision_updated_at||null});
          }else if(sql.startsWith("UPDATE opportunities")){
            const [review_status,decision_note,target_site,id]=args;
            Object.assign(map.get(id),{review_status,decision_note,target_site,decision_updated_at:"2026-10-13"});
          }else if(sql.startsWith("INSERT INTO decision_events"))events.push(args);
          return {success:true};
        }
      };
      return stmt;
    },
    async batch(statements){for(const stmt of statements)await stmt.run();return statements.map(()=>({success:true}));}
  };
}
const req=(path,method="GET",body=null,token=KEY)=>new Request("https://test.example"+path,{method,headers:{"authorization":"Bearer "+token,...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):null});
const env=()=>({ADMIN_TOKEN:KEY,DB:fakeDB(),ASSETS:{fetch:async()=>new Response("public-shell")}});

test("API fails closed without a DB or ADMIN_TOKEN",async()=>{
  const res=await worker.fetch(req("/api/items"),{ASSETS:{fetch:()=>new Response("public")}});
  assert.equal(res.status,503);
  assert.equal((await res.json()).error.includes("not configured"),true);
});
test("authentication rejects wrong token and allows valid token",async()=>{
  const e=env();
  assert.equal((await worker.fetch(req("/api/summary","GET",null,"guess"),e)).status,401);
  assert.equal((await worker.fetch(req("/api/summary"),e)).status,200);
  assert.equal(await testHooks.sameToken(KEY,KEY),true);
  assert.equal(await testHooks.sameToken(KEY,KEY+"1"),false);
});
test("import deduplicates, persists decisions across repeated imports, leaves audit event",async()=>{
  const e=env();
  const payload={opportunities:[
    {keyword:"Compress Images to 20KB",stage:"hypothesis",rubric_score:21,intent_signature:"20kb|compress|image",evidence:[]},
    {keyword:" compress images to 20kb ",stage:"needs-evidence",rubric_score:40}
  ]};
  let response=await worker.fetch(req("/api/import","POST",payload),e);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{imported:1,duplicate_rows:1});
  assert.equal(e.DB.map.size,1);
  const row=[...e.DB.map.values()][0];
  response=await worker.fetch(req("/api/items/"+row.id+"/decision","POST",
    {review_status:"build",decision_note:"SERP checked",target_site:"imagekb.net"}),e);
  assert.equal(response.status,200);
  response=await worker.fetch(req("/api/import","POST",{opportunities:payload.opportunities.slice(0,1)}),e);
  assert.equal(response.status,200);
  const after=[...e.DB.map.values()][0];
  assert.equal(after.review_status,"build");
  assert.equal(after.decision_note,"SERP checked");
  assert.equal(e.DB.events.length,1);
});
test("invalid status and oversized imports are blocked",async()=>{
  const e=env();
  assert.equal((await worker.fetch(req("/api/import","POST",{opportunities:[]}),e)).status,400);
  assert.equal((await worker.fetch(req("/api/import","POST",{opportunities:Array(201).fill({keyword:"test"})}),e)).status,400);
  assert.equal((await worker.fetch(req("/api/items?status=not-valid"),e)).status,400);
});
test("auth needed for export; static assets do not use API auth",async()=>{
  const e=env();
  assert.equal((await worker.fetch(req("/"),e)).status,200);
  assert.equal((await worker.fetch(req("/api/export","GET",null,"wrong"),e)).status,401);
  assert.equal((await worker.fetch(req("/api/export"),e)).status,200);
});
test("normalization preserves meaningful file size distinctions",()=>{
  assert.notEqual(testHooks.normalize("image compressor 20kb"),testHooks.normalize("image compressor 200kb"));
});

test("authenticated manual collection uses private service binding, not public fetch",async()=>{
  const e=env();
  let calls=0;
  e.COLLECTOR={fetch:async request=>{calls++;assert.equal(new URL(request.url).pathname,"/internal/collect");
    assert.equal(request.method,"POST");return new Response(JSON.stringify({status:"completed",topics:12,matched:3}),{headers:{"content-type":"application/json"}});}};
  assert.equal((await worker.fetch(req("/api/collect","POST",null,"wrong"),e)).status,401);
  assert.equal(calls,0);
  const response=await worker.fetch(req("/api/collect","POST"),e);
  assert.equal(response.status,200);
  assert.equal((await response.json()).matched,3);
  assert.equal(calls,1);
});
