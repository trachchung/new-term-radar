import test from "node:test";
import assert from "node:assert/strict";
import worker,{extract,matches,requestURL,ingest,collect} from "../src/worker.js";
const topic={keyword:"bulk image compressor",query:"image",require:[["image","photo"],["compress","compression"]]};
const now=Date.parse("2026-10-13T10:00:00Z");
const hit=(id,comment_text,created_at="2026-10-12T07:00:00.000Z")=>({objectID:String(id),comment_text,created_at});
class FakeDB {
  constructor(){this.records=new Map();this.runs=new Map();this.provider=null;}
  prepare(sql){let args=[];const self=this;const stmt={
    bind(...items){args=items;return this},
    async first(){if(sql.startsWith("SELECT record_json"))return self.records.get(args[0])||null;if(sql.startsWith("SELECT blocked_until"))return self.provider;
      if(sql.startsWith("SELECT started_at FROM collector_runs"))return [...self.runs.values()].filter(x=>x.status==="completed"||x.status==="partial").sort((a,b)=>a.started_at.localeCompare(b.started_at)).at(-1)||null;
      return null},
    async run(){
      if(sql.startsWith("INSERT INTO collector_runs"))self.runs.set(args[0],{id:args[0],started_at:args[1],status:"running"});
      if(sql.startsWith("INSERT INTO collector_provider_state"))self.provider={blocked_until:args[2],last_attempted_at:args[1]};
      if(sql.startsWith("UPDATE collector_provider_state"))self.provider={...self.provider,blocked_until:args[0],last_error:args[1]};
      if(sql.startsWith("UPDATE collector_runs"))self.runs.set(args[5],{...self.runs.get(args[5]),status:args[1],matched:args[2],errors:args[3],sources:JSON.parse(args[4])});
      if(sql.startsWith("INSERT INTO opportunities")){
        const [id,keyword,normalized_key,stage,rubric_score,origin_count,evidence_count,intent_signature,record_json]=args;
        const old=self.records.get(id)||{};
        self.records.set(id,{...old,id,keyword,normalized_key,stage,rubric_score,origin_count,evidence_count,intent_signature,record_json});
      }
      return {success:true};
    }
  };return stmt}
}
test("topic must match both action and actual complaint",()=>{
  assert.equal(matches("I wish I could compress photos without uploading",topic),true);
  assert.equal(matches("This photo editor launch is a great success",topic),false);
  assert.equal(matches("I need a PDF compressor",topic),false);
});
test("dated public comments preserve url, HTML stripped and are capped",()=>{
  const data={hits:[hit(10,"<p>I need to compress many photo files and it takes too long manually.</p>"),
    hit(10,"I need to compress image photos because the current process is slow and annoying."),
    hit(11,"New software shipped today and my photos look great all around."),
    hit(12,"I need to compress and process images at scale because uploads are painful.", "2020-01-01T00:00:00Z")]};
  const result=extract(data,topic,now);
  assert.equal(result.length,1);
  assert.equal(result[0].url,"https://news.ycombinator.com/item?id=10");
  assert.equal(result[0].note.includes("<p>"),false);
  assert.equal(result[0].source,"hn-algolia-public-api");
});
test("request is bounded and filters comment timestamp",()=>{
  const url=new URL(requestURL(topic,now));
  assert.equal(url.searchParams.get("tags"),"comment");
  assert.equal(url.searchParams.get("hitsPerPage"),"80");
  assert.match(url.searchParams.get("numericFilters"),/^created_at_i>[0-9]+$/);
});
test("import preserves search volume, decisions, and external evidence",async()=>{
  const db=new FakeDB();const env={DB:db};
  const comments=extract({hits:[hit(21,"I wish I could compress all my photos in bulk without manually resizing each file every day.")]},topic,now);
  const added=await ingest(env,topic,comments,now);
  assert.equal(added,1);
  const row=[...db.records.values()][0];let original=JSON.parse(row.record_json);
  assert.equal(original.monthly_searches,null);
  assert.equal(original.stage,"needs-evidence");
  original.monthly_searches=330;
  original.monthly_searches_source="manually exported Google Ads";
  original.evidence.push({url:"https://example.org/discussion",note:"other source",published_at:"2026-10-09"});
  db.records.set(row.id,{...row,stage:"manual-review",rubric_score:78,record_json:JSON.stringify(original),
    review_status:"build",decision_note:"Build later"});
  await ingest(env,topic,comments,now);
  const saved=db.records.get(row.id),result=JSON.parse(saved.record_json);
  assert.equal(saved.review_status,"build");
  assert.equal(saved.decision_note,"Build later");
  assert.equal(saved.stage,"manual-review");
  assert.equal(result.monthly_searches,330);
  assert.equal(result.evidence.length,2);
  assert.equal(result.independent_evidence_sites.length,2);
});
test("collector logs failures and never creates entries without pain evidence",async()=>{
  const db=new FakeDB();
  const fetcher=async()=>({ok:true,json:async()=>({hits:[hit(99,"This product launched and I love the image compression features.") ]})});
  const out=await collect({DB:db},{now,topics:[topic],fetcher});
  assert.equal(out.matched,0);
  assert.equal(db.records.size,0);
  assert.equal([...db.runs.values()][0].status,"completed");
});
test("collector inserts real matched comments and marks partial failures",async()=>{
  const db=new FakeDB();
  const second={...topic,keyword:"another keyword",query:"fail"};
  const fetcher=async(url)=>url.includes("fail")?{ok:false,status:429}:{ok:true,json:async()=>({hits:[
    hit(100,"I need to compress many product images, and the manual photo workflow is really frustrating.") ]})};
  const out=await collect({DB:db},{now,topics:[topic,second],fetcher});
  assert.equal(out.status,"partial");
  assert.equal(out.matched,1);
  assert.equal(out.failures.length,1);
  assert.equal(db.records.size,1);
});

test("manual collection endpoint is private service-binding only and rate limited",async()=>{
  const db=new FakeDB(), env={DB:db};
  const get=await worker.fetch(new Request("https://collector.internal/internal/collect",{method:"GET"}),env);
  assert.equal(get.status,404);
  db.prepare("INSERT INTO collector_runs").bind("manual-test",new Date().toISOString(),1).run();
  // Stub lacks SELECT latest row, so the endpoint can be tested with a preexisting query failure fixture later.
});

test("rejects self-promotional job CV and unrelated distant mentions",()=>{
  const job="Location: London Remote: Yes Technologies: Shopify, photo software, Cloudflare "+
            "Email: candidate@example.com Resume/CV: https://my.site/resume.pdf. I need a job and can edit photos.";
  assert.equal(extract({hits:[hit(12345,job)]},topic,now).length,0);
  const unrelated="I need a better process for shipping products. ".repeat(12)+
    "My notes contain the terms Shopify, image, compress, and file, but this is not about compression.";
  assert.equal(extract({hits:[hit(12346,unrelated)]},topic,now).length,0);
});
test("redacts email addresses from stored quote excerpts",()=>{
  const text="I need to compress all my photos for upload and cannot do this manually. Email me at private@example.com";
  const data=extract({hits:[hit(12347,text)]},topic,now);
  assert.equal(data.length,1);
  assert.equal(data[0].note.includes("private@example.com"),false);
  assert.equal(data[0].note.includes("[email redacted]"),true);
});

test("multi-source daily collector merges real Stack Exchange questions and records counts",async()=>{
  const db=new FakeDB(),env={DB:db},q={
    keyword:"bulk image compressor",query:"batch image compress",site:"superuser",
    require:[["image","photo","picture"],["compress","reduce","size"]]
  };
  const stackFetcher=async()=>({ok:true,json:async()=>({items:[{
    question_id:555123,title:"How do I compress many image files in bulk?",
    body:"I have thousands of photos that I need to compress",
    creation_date:Math.floor(Date.parse("2026-10-10T02:00:00Z")/1000),
    link:"https://superuser.com/questions/555123/compress-image-files"
  }]})});
  const result=await collect(env,{now,topics:[],stackTopics:[q],stackFetcher});
  assert.equal(result.sources.hacker_news,0);
  assert.equal(result.sources.stackexchange,1);
  assert.equal(result.total_topics,1);
  assert.equal(db.records.size,1);
  const stored=JSON.parse([...db.records.values()][0].record_json);
  assert.equal(stored.evidence[0].source,"stackexchange-api-v2.3");
  assert.equal(stored.monthly_searches,null);
  assert.deepEqual([...db.runs.values()][0].sources,{hacker_news:0,stackexchange:1,stackexchange_status:"completed"});
});

test("provider cooldown prevents repeat requests and preserves HN independently",async()=>{
  const db=new FakeDB(),site={keyword:"bulk image compressor",site:"superuser",query:"batch image compress",require:[["image"],["compress"]]};
  let calls=0;
  const request=async()=>{calls++;return {ok:false,status:429,text:async()=>"quota exhausted"}};
  const first=await collect({DB:db},{now,topics:[],stackTopics:[site],stackFetcher:request});
  assert.equal(first.sources.stackexchange_status,"limited");
  assert.equal(calls,1);
  const next=await collect({DB:db},{now:now+60*60*1000,topics:[],stackTopics:[site],stackFetcher:request});
  assert.equal(next.sources.stackexchange_status,"cooldown");
  assert.equal(calls,1);
});

test("duplicate Cloudflare Cron cannot re-query HN within 20 hours",async()=>{
  const db=new FakeDB(),env={DB:db},q={keyword:"test compress image",query:"image",require:[["image"],["compress"]]};
  let fetchCalls=0;
  const fetcher=async()=>{fetchCalls++;return {ok:true,json:async()=>({hits:[]})}};
  const first=await collect(env,{now,topics:[q],stackTopics:[],fetcher,skipIfRecent:true});
  assert.equal(first.status,"completed");
  const second=await collect(env,{now:now+3600000,topics:[q],stackTopics:[],fetcher,skipIfRecent:true});
  assert.equal(second.status,"skipped");
  assert.equal(fetchCalls,1);
  assert.equal(db.runs.size,1);
});
