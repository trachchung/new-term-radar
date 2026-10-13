import test from "node:test";
import assert from "node:assert/strict";
import {validate,readAssessment,saveAssessment} from "../src/assessment.js";
import {suggestSites} from "../src/site-match.js";
import {importSeoReview} from "../src/seo-import.js";
const id="a".repeat(64);
const sample={intent_fit:"aligned",evidence_quality:"mixed",placement:"extend-site",target_site:"imagekb.net",
 build_days:2,monetization:"ads",review_notes:"Some direct competing sites",
 snapshot:{organic:[{rank_group:1,url:"https://example.com/tool",title:"Sample"}],provider:"human-entered"},
 labels:[{rank:1,url:"https://example.com/tool",type:"direct-tool"}]};
function DB(){
 const source={id,keyword:"compress image 20kb",normalized_key:"compress image 20kb",stage:"needs-evidence",
  record_json:JSON.stringify({keyword:"compress image 20kb",evidence:[{url:"https://news.ycombinator.com/item?id=1"}],
    monthly_searches:null})};
 let saved=null;
 const db={
  get source(){return source},get saved(){return saved},
  prepare(sql){let vals=[];const stmt={
   bind(...v){vals=v;return stmt},
   async first(){
    if(sql.startsWith("SELECT keyword,record_json")||sql==="SELECT keyword FROM opportunities WHERE id=?")return vals[0]===id?source:null;
    if(sql.startsWith("SELECT * FROM opportunity_assessments"))return saved;
    if(sql.startsWith("SELECT id,record_json,stage,keyword FROM opportunities"))return vals[0]===source.normalized_key?source:null;
    return null
   },
   async run(){
    if(sql.startsWith("INSERT INTO opportunity_assessments")){
      const [opportunity_id,intent_fit,evidence_quality,placement,target_site,build_days,monetization,review_notes,snapshot_json,labels_json]=vals;
      saved={opportunity_id,intent_fit,evidence_quality,placement,target_site,build_days,monetization,review_notes,
       snapshot_json,labels_json,evaluated_at:"2026-10-13"};
    }else if(sql.startsWith("UPDATE opportunities")){
      source.record_json=vals[0];source.stage=vals[1];
    }
    return {success:true};
   }
  };return stmt},
  async batch(queries){for(const query of queries)await query.run();}
 };return db;
}
test("SERP labels cannot refer to injected or mismatched URLs",()=>{
 assert.equal(validate(sample).labels.length,1);
 assert.throws(()=>validate({...sample,labels:[{rank:1,url:"https://phishing.example",type:"direct-tool"}]}),/Classification/);
 assert.throws(()=>validate({...sample,snapshot:{organic:[{rank_group:1,url:"javascript:alert(1)"}]}}),/SERP/);
 assert.throws(()=>validate({...sample,labels:[{rank:1,url:"https://example.com/tool",type:"made-up"}]}),/Classification/);
});
test("Save and retrieve business assessment without overwriting opportunity research",async()=>{
 const db=DB();
 const saved=await saveAssessment(db,id,sample);
 assert.equal(saved.placement,"extend-site");
 assert.equal(saved.counts.direct_tool,1);
 assert.equal(saved.serp_review_complete,false); // only one labeled URL
 assert.equal(saved.target_site,"imagekb.net");
 assert.deepEqual(JSON.parse(db.source.record_json).evidence,[{url:"https://news.ycombinator.com/item?id=1"}]);
});
test("Generic image task offers thematic match, unrelated site does not",()=>{
 assert.equal(suggestSites("compress jpg images to 20kb")[0].domain,"imagekb.net");
 assert.equal(suggestSites("epa 608 hvac practice")[0].domain,"soocly.com");
 assert.deepEqual(suggestSites("rare obscure browser error"),[]);
});
test("Provider SEO import adds only missing data, without deleting pain evidence",async()=>{
 const db=DB();
 await saveAssessment(db,id,sample);
 const payload={reviews:[{keyword:"compress image 20kb",monthly_searches:240,
  monthly_searches_source:"dataforseo-labs-google-2840-en-2026-10-13",
  serp_snapshot:{reviewed_at:"2026-10-13",organic:[{rank_group:1,url:"https://competitor.example/result"}]}}]};
 const out=await importSeoReview(db,payload);
 assert.equal(out.updated,1);
 const record=JSON.parse(db.source.record_json);
 assert.equal(record.monthly_searches,240);
 assert.equal(record.evidence.length,1);
 assert.equal(db.saved.placement,"extend-site");
 // Subsequent lower provider estimates do not overwrite a previously known volume.
 const update=await importSeoReview(db,{reviews:[{...payload.reviews[0],monthly_searches:10}]});
 assert.equal(update.updated,0);
 assert.equal(JSON.parse(db.source.record_json).monthly_searches,240);
});
test("Unknown word is not inserted as fabricated existing opportunity",async()=>{
 const db=DB();
 const result=await importSeoReview(db,{reviews:[{keyword:"other term",monthly_searches:100,
  monthly_searches_source:"fake source"}]});
 assert.equal(result.updated,0);
 assert.deepEqual(result.unmatched,["other term"]);
});
