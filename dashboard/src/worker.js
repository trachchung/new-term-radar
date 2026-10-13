import {readAssessment,saveAssessment} from "./assessment.js";
import {importSeoReview} from "./seo-import.js";
/** Protected Cloudflare D1 opportunity management API. ADMIN_TOKEN required. */
const encoder = new TextEncoder();
const STATES = new Set(["inbox","watch","build","reject"]);
function send(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","x-frame-options":"DENY"}});}
function fail(msg,status){return send({error:msg},status);}
function safe(s,max=200){return String(s??"").trim().slice(0,max);}
function normalize(s){return safe(s,200).normalize("NFKC").toLowerCase().replace(/\s+/g," ");}
function number(n,min,max,def){let v=Number(n);return Number.isInteger(v)&&v>=min&&v<=max?v:def;}
async function hash(value){return [...new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(value)))].map(n=>n.toString(16).padStart(2,"0")).join("");}
async function sameToken(got,wanted){
  if(!got||!wanted||typeof got!=="string"||typeof wanted!=="string"||wanted.length<24||got.length!==wanted.length)return false;
  const [a,b]=await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(got)),crypto.subtle.digest("SHA-256",encoder.encode(wanted))]);
  const x=new Uint8Array(a),y=new Uint8Array(b);let d=0;for(let i=0;i<x.length;i++)d|=x[i]^y[i];return d===0;
}
const available=env=>Boolean(env?.DB&&typeof env?.ADMIN_TOKEN==="string"&&env.ADMIN_TOKEN.length>=24);
async function auth(req,env){if(!available(env))return fail("DB/ADMIN_TOKEN not configured",503);
  const h=req.headers.get("authorization")||"";if(!h.startsWith("Bearer ")||!await sameToken(h.slice(7),env.ADMIN_TOKEN))return fail("Unauthorized",401);
  return null;
}
async function parseBody(req){const n=Number(req.headers.get("content-length")||0);if(n>1000000)throw {status:413,message:"Body too large"};
  const buf=await req.arrayBuffer();if(buf.byteLength>1000000)throw {status:413,message:"Body too large"};
  try{return JSON.parse(new TextDecoder().decode(buf));}catch{throw {status:400,message:"Invalid JSON"};}
}
const obj=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const validRow=r=>obj(r)&&typeof r.keyword==="string"&&r.keyword.trim().length>=2&&r.keyword.length<=200&&JSON.stringify(r).length<=18000;
async function importReport(env,doc){
  if(!obj(doc)||!Array.isArray(doc.opportunities)||doc.opportunities.length<1||doc.opportunities.length>200)
    throw {status:400,message:"Expected opportunities[] with 1–200 items"};
  const seen=new Set(),batch=[];
  for(const row of doc.opportunities){
    if(!validRow(row))throw {status:400,message:"Invalid or oversized opportunity"};
    const norm=normalize(row.keyword);if(seen.has(norm))continue;seen.add(norm);
    const id=await hash(norm);
    const stage=["hypothesis","needs-evidence","manual-review"].includes(row.stage)?row.stage:"hypothesis";
    const sql="INSERT INTO opportunities (id,keyword,normalized_key,stage,rubric_score,origin_count,evidence_count,intent_signature,record_json,imported_at)"+
       " VALUES (?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET keyword=excluded.keyword,"+
       "stage=excluded.stage,rubric_score=excluded.rubric_score,origin_count=excluded.origin_count,"+
       "evidence_count=excluded.evidence_count,intent_signature=excluded.intent_signature,"+
       "record_json=excluded.record_json,imported_at=datetime('now')";
    batch.push(env.DB.prepare(sql).bind(id,safe(row.keyword),norm,stage,number(row.rubric_score,0,100,0),
      Array.isArray(row.origins)?row.origins.length:0,Array.isArray(row.evidence)?row.evidence.length:0,
      safe(row.intent_signature,400),JSON.stringify(row)));
  }
  if(!batch.length)throw {status:400,message:"No unique items"};
  await env.DB.batch(batch);
  return {imported:batch.length,duplicate_rows:doc.opportunities.length-batch.length};
}
function display(row){let original={};try{original=JSON.parse(row.record_json)}catch{}
  return {...original,id:row.id,keyword:row.keyword,stage:row.stage,rubric_score:row.rubric_score,
    review_status:row.review_status,decision_note:row.decision_note,target_site:row.target_site,
    intent_signature:row.intent_signature,imported_at:row.imported_at,decision_updated_at:row.decision_updated_at};
}
async function listing(env,url){
  const limit=number(url.searchParams.get("limit"),1,100,50),offset=number(url.searchParams.get("offset"),0,100000,0);
  const status=url.searchParams.get("status")||"all",stage=url.searchParams.get("stage")||"all",query=safe(url.searchParams.get("q"),100),intent=safe(url.searchParams.get("intent"),400);
  if(status!=="all"&&!STATES.has(status))return fail("Invalid review status",400);
  if(stage!=="all"&&!["hypothesis","needs-evidence","manual-review"].includes(stage))return fail("Invalid stage",400);
  const rules=[],args=[];
  if(status!=="all"){rules.push("review_status=?");args.push(status)}
  if(stage!=="all"){rules.push("stage=?");args.push(stage)}
  if(query){rules.push("instr(lower(keyword),lower(?))>0");args.push(query)}
  if(intent){rules.push("intent_signature=?");args.push(intent)}
  const where=rules.length?" WHERE "+rules.join(" AND "):"";
  const total=await env.DB.prepare("SELECT count(*) AS count FROM opportunities"+where).bind(...args).first();
  const result=await env.DB.prepare("SELECT * FROM opportunities"+where+
    " ORDER BY CASE stage WHEN 'manual-review' THEN 0 WHEN 'needs-evidence' THEN 1 ELSE 2 END,"+
    " rubric_score DESC,keyword COLLATE NOCASE LIMIT ? OFFSET ?").bind(...args,limit,offset).all();
  return send({items:(result.results||[]).map(display),count:total?.count||0,limit,offset});
}
async function summary(env){
  const stats=await env.DB.prepare("SELECT review_status,stage,count(*) AS n FROM opportunities GROUP BY review_status,stage").all();
  const dup=await env.DB.prepare("SELECT intent_signature,count(*) AS n FROM opportunities WHERE length(intent_signature)>0"+
    " GROUP BY intent_signature HAVING count(*)>1 ORDER BY n DESC LIMIT 30").all();
  const scans=await env.DB.prepare("SELECT started_at,ended_at,status,total_topics,total_matches,errors_json,source_counts_json FROM collector_runs ORDER BY started_at DESC LIMIT 5").all();
  return send({stages:stats.results||[],possible_overlaps:dup.results||[],recent_runs:scans.results||[]});
}
async function decision(env,id,data){
  if(!/^[a-f0-9]{64}$/.test(id))return fail("Invalid id",400);
  if(!obj(data)||!STATES.has(data.review_status)||typeof data.decision_note!=="string"||
     data.decision_note.length>2000||typeof data.target_site!=="string"||data.target_site.length>200)
    return fail("Invalid review status, note or target site",400);
  const before=await env.DB.prepare("SELECT review_status,target_site FROM opportunities WHERE id=?").bind(id).first();
  if(!before)return fail("Item not found",404);
  await env.DB.batch([
    env.DB.prepare("UPDATE opportunities SET review_status=?,decision_note=?,target_site=?,decision_updated_at=datetime('now') WHERE id=?")
      .bind(data.review_status,data.decision_note.trim(),data.target_site.trim(),id),
    env.DB.prepare("INSERT INTO decision_events (opportunity_id,old_status,new_status,old_site,new_site,note) VALUES (?,?,?,?,?,?)")
      .bind(id,before.review_status,data.review_status,before.target_site,data.target_site.trim(),data.decision_note.trim())
  ]);
  return send({ok:true,review_status:data.review_status,id});
}
async function run(req,env){
  const url=new URL(req.url);
  if(!url.pathname.startsWith("/api/"))return env?.ASSETS?env.ASSETS.fetch(req):new Response("Assets unavailable",{status:503});
  if(url.pathname==="/api/health")return send({ready:available(env)});
  const forbidden=await auth(req,env);if(forbidden)return forbidden;
  if(url.pathname==="/api/items"&&req.method==="GET")return listing(env,url);
  if(url.pathname==="/api/summary"&&req.method==="GET")return summary(env);
  if(url.pathname==="/api/collect"&&req.method==="POST"){
    if(!env?.COLLECTOR)return fail("Collector service binding unavailable",503);
    const downstream=await env.COLLECTOR.fetch(new Request("https://collector.internal/internal/collect",{method:"POST"}));
    let data;try{data=await downstream.json()}catch{data={error:"Collector did not return valid JSON"}}
    return send(data,downstream.status);
  }
  if(url.pathname==="/api/export"&&req.method==="GET"){
    const rows=await env.DB.prepare("SELECT * FROM opportunities ORDER BY rubric_score DESC LIMIT 5000").all();
    const assessments=await env.DB.prepare("SELECT * FROM opportunity_assessments ORDER BY evaluated_at DESC LIMIT 5000").all();
    return send({exported_at:new Date().toISOString(),opportunities:(rows.results||[]).map(display),
      assessments:(assessments.results||[]).map(x=>({...x,
        snapshot:JSON.parse(x.snapshot_json||"{}"),labels:JSON.parse(x.labels_json||"[]")}))});
  }
  if(url.pathname==="/api/import"&&req.method==="POST")return send(await importReport(env,await parseBody(req)));

  if(url.pathname==="/api/import-seo"&&req.method==="POST"){
    try{return send(await importSeoReview(env.DB,await parseBody(req)))}
    catch(e){if(/^Invalid SEO import|^Invalid keyword/.test(String(e.message)))return fail(e.message,400);throw e}
  }
  const assessment=url.pathname.match(/^\/api\/items\/([a-f0-9]{64})\/assessment$/);
  if(assessment&&req.method==="GET"){
    const data=await readAssessment(env.DB,assessment[1]);return data?send(data):fail("Item not found",404);
  }
  if(assessment&&req.method==="POST"){
    try{const data=await saveAssessment(env.DB,assessment[1],await parseBody(req));return data?send(data):fail("Item not found",404)}
    catch(e){if(/^(Invalid|Only|Build days|Classification)/.test(String(e.message)))return fail(e.message,400);throw e}
  }

  const match=url.pathname.match(/^\/api\/items\/([a-f0-9]{64})\/decision$/);
  if(match&&req.method==="POST")return decision(env,match[1],await parseBody(req));
  return fail("Not found",404);
}
export default {async fetch(request,env){
  try{return await run(request,env)}catch(e){
    if(typeof e?.status==="number")return fail(e.message,e.status);
    console.error("Workbench request failed:",String(e?.message||e).slice(0,160));return fail("Server error",500);
  }
}};
export const testHooks={available,sameToken,normalize,importReport,run,display};
