/** Scheduled collector: uses public HN comments, never claims Google search demand. */
import {TOPICS,NEED_WORDS} from "./topics.js";
import {SE_TOPICS,collectStack} from "./stackexchange.js";

const API="https://hn.algolia.com/api/v1/search_by_date";
const DAYS=180,RESULTS_PER_QUERY=80,MAX_EVIDENCE=6,TIMEOUT=10000;
const encoder=new TextEncoder();
function compact(value){return String(value??"").replace(/\s+/g," ").trim();}
function key(value){return compact(value).normalize("NFKC").toLowerCase();}
async function sha(value){const buf=await crypto.subtle.digest("SHA-256",encoder.encode(value));return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function plain(markup){
  return compact(String(markup||"")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,(whole,dec,hex,name)=>{
      if(dec||hex){const code=parseInt(dec||hex,dec?10:16);return code>0&&code<=1114111?String.fromCodePoint(code):" ";}
      return ({"amp":"&","lt":"<","gt":">","quot":'"',"apos":"'","nbsp":" "}[name.toLowerCase()]||" ");
    }));
}
const PROFILE_MARKERS=[/location:[^\n]{0,180}remote:/i,/technologies:/i,
  /willing to relocate:/i,/resume\/cv:\s*https?:/i,/linkedin:\s*https?:/i];
function excerpt(text,topic){
  if(PROFILE_MARKERS.some(re=>re.test(text)))return "";
  const lower=text.toLowerCase();
  for(const cue of NEED_WORDS){
    let at=lower.indexOf(cue),trials=0;
    while(at>=0&&trials++<8){
      const start=Math.max(0,at-50),end=Math.min(lower.length,at+280);
      const snippet=lower.slice(start,end);
      if(topic.require.every(group=>group.some(word=>snippet.includes(word.toLowerCase())))){
        return text.slice(start,end)
          .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[email redacted]")
          .replace(/\+?\d[\d\s().-]{9,}\d/g,"[phone redacted]");
      }
      at=lower.indexOf(cue,at+cue.length);
    }
  }
  return "";
}
export function matches(text,topic){return Boolean(excerpt(text,topic));}
export function extract(response,topic,now=Date.now()){
  const rows=Array.isArray(response?.hits)?response.hits:[],seen=new Set(),out=[];
  const earliest=now-DAYS*86400000;
  for(const item of rows){
    if(!item||typeof item!=="object")continue;
    const id=String(item.objectID||""),date=Date.parse(item.created_at||"");
    if(!/^[0-9]+$/.test(id)||!Number.isFinite(date)||date<earliest||date>now+86400000||seen.has(id))continue;
    const quote=plain(item.comment_text),snippet=quote.length>=55?excerpt(quote,topic):"";
    if(!snippet||snippet.length<45)continue;
    seen.add(id);
    out.push({url:"https://news.ycombinator.com/item?id="+id,type:"hacker-news-comment",
      note:snippet.slice(0,420),published_at:new Date(date).toISOString(),
      collected_at:new Date(now).toISOString(),source:"hn-algolia-public-api",
      source_query:topic.query,verified:false});
    if(out.length>=MAX_EVIDENCE)break;
  }
  return out;
}
export function requestURL(topic,now=Date.now()){
  const args=new URLSearchParams({query:topic.query,tags:"comment",hitsPerPage:String(RESULTS_PER_QUERY),
    numericFilters:"created_at_i>"+Math.floor((now-DAYS*86400000)/1000)});
  return API+"?"+args;
}
async function pull(topic,now,fetcher=fetch){
  const stop=new AbortController(),timer=setTimeout(()=>stop.abort(),TIMEOUT);
  try{
    const response=await fetcher(requestURL(topic,now),{headers:{"user-agent":"seo-demand-collector/4.0 public HN"},signal:stop.signal});
    if(!response.ok)throw new Error("HN HTTP "+response.status);
    return extract(await response.json(),topic,now);
  }finally{clearTimeout(timer);}
}
function mergeEvidence(existing,next){
  const found=new Map();
  for(const row of [...(Array.isArray(existing)?existing:[]),...next]){
    if(typeof row?.url==="string"&&/^https?:\/\//.test(row.url))found.set(row.url,row);
  }
  return [...found.values()].sort((a,b)=>String(b.published_at||"").localeCompare(String(a.published_at||""))).slice(0,30);
}
export async function ingest(env,topic,evidence,now=Date.now()){
  if(!evidence.length)return 0;
  const normalized=key(topic.keyword),id=await sha(normalized);
  const before=await env.DB.prepare("SELECT record_json,stage,rubric_score FROM opportunities WHERE id=?").bind(id).first();
  let original={};try{original=JSON.parse(before?.record_json||"{}");}catch{}
  const merged=mergeEvidence(original.evidence,evidence);
  const origins=[...new Set([...(Array.isArray(original.origins)?original.origins:[]),"hn-topic-watchlist"])];
  const row={
    ...original,keyword:original.keyword||topic.keyword,kind:original.kind||"generic",
    origins,evidence:merged,independent_evidence_sites:[...new Set(merged.map(e=>{try{return new URL(e.url).hostname.replace(/^www\./,"")}catch{return""}}).filter(Boolean))],
    personas:Array.isArray(original.personas)?original.personas:[],
    scenes:Array.isArray(original.scenes)?original.scenes:[],
    actions:Array.isArray(original.actions)?original.actions:[],
    pains:Array.isArray(original.pains)?original.pains:[],
    constraints:Array.isArray(original.constraints)?original.constraints:[],
    stage:before?.stage||"needs-evidence",
    rubric_score:before?.rubric_score??15,
    monthly_searches:original.monthly_searches??null,
    research_provenance:"HN topic-matched comments are evidence of a user task, NOT validated Google search volume.",
    research_last_checked_at:new Date(now).toISOString(),
    source_queries:[...new Set([...(Array.isArray(original.source_queries)?original.source_queries:[]),topic.query])],
    screening:original.screening||{next_step:"validate-search",signals:["public-problem-comments"],
      blockers:["Validate target-country keyword wording and demand",
                "Inspect US Google top 10 and classify actual competitors",
                "Estimate MVP/API cost and monetization"]}
  };
  const sql="INSERT INTO opportunities (id,keyword,normalized_key,stage,rubric_score,origin_count,evidence_count,intent_signature,record_json,imported_at) "+
    "VALUES (?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET "+
    "stage=excluded.stage,rubric_score=excluded.rubric_score,origin_count=excluded.origin_count,"+
    "evidence_count=excluded.evidence_count,record_json=excluded.record_json,imported_at=datetime('now')";
  await env.DB.prepare(sql).bind(id,row.keyword,normalized,row.stage,row.rubric_score,origins.length,merged.length,
    String(original.intent_signature||""),JSON.stringify(row)).run();
  return evidence.length;
}
export async function collect(env,options={}){
  if(!env?.DB)throw new Error("D1 DB not configured");
  const now=options.now??Date.now(),fetcher=options.fetcher||fetch,topics=options.topics||TOPICS;
  // Defense in depth: even if Cloudflare unexpectedly fires an old Cron schedule
  // repeatedly, the scheduled task must not repeat external requests within 20h.
  if(options.skipIfRecent){
    const recent=await env.DB.prepare("SELECT started_at FROM collector_runs WHERE status IN ('completed','partial') ORDER BY started_at DESC LIMIT 1").first();
    if(recent && Number.isFinite(Date.parse(recent.started_at)) && now-Date.parse(recent.started_at)<20*3600*1000)
      return {status:"skipped",reason:"recent successful or partial scheduled scan",matched:0,total_topics:0,
              failures:[],sources:{hacker_news:0,stackexchange:0,stackexchange_status:"skipped"},topics:[]};
  }
  const stackTopics=options.stackTopics??(options.topics?[]:SE_TOPICS);
  const runId=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO collector_runs (id,started_at,status,total_topics,total_matches) VALUES (?,?,'running',?,0)")
    .bind(runId,new Date(now).toISOString(),topics.length+stackTopics.length).run();
  const failures=[],outputs=[];
  for(const topic of topics.slice(0,16)){
    try{
      const evidence=await pull(topic,now,fetcher);
      const n=await ingest(env,topic,evidence,now);
      outputs.push({topic:topic.keyword,matched:n});
    }catch(error){failures.push({topic:topic.keyword,reason:String(error?.message||error).slice(0,150)});}
  }
  let stack={results:[],errors:[],matched:0,backoff_seconds:0};
  let stackStatus=stackTopics.length?"not-attempted":"disabled";
  if(stackTopics.length){
    try{
      const previous=await env.DB.prepare("SELECT blocked_until FROM collector_provider_state WHERE provider=?").bind("stackexchange").first();
      if(previous && Date.parse(previous.blocked_until)>now)stackStatus="cooldown";
      else{
        const blocked=new Date(now+22*3600*1000).toISOString();
        await env.DB.prepare("INSERT INTO collector_provider_state (provider,last_attempted_at,blocked_until) VALUES (?,?,?) "+
           "ON CONFLICT(provider) DO UPDATE SET last_attempted_at=excluded.last_attempted_at,blocked_until=excluded.blocked_until")
          .bind("stackexchange",new Date(now).toISOString(),blocked).run();
        stack=await collectStack(stackTopics,now,options.stackFetcher||fetcher,
          (topic,questions)=>ingest(env,topic,questions,now));
        const wait=Math.max(22*3600,stack.backoff_seconds||0);
        await env.DB.prepare("UPDATE collector_provider_state SET blocked_until=?,last_error=? WHERE provider=?")
          .bind(new Date(now+wait*1000).toISOString(),stack.errors[0]?.reason||"","stackexchange").run();
        stackStatus=stack.backoff_seconds?"limited":stack.errors.length?"partial":"completed";
      }
    }catch(error){
      stackStatus="failed";
      failures.push({source:"stackexchange",reason:String(error?.message||error).slice(0,150)});
    }
  }
  for(const err of stack.errors)failures.push({...err,source:"stackexchange"});
  const matched=outputs.reduce((n,v)=>n+v.matched,0)+stack.matched;
  const count=topics.length+stackTopics.length;
  const successCount=outputs.length+stack.results.length;
  const status=successCount===0?"failed":failures.length?"partial":"completed";
  await env.DB.prepare("UPDATE collector_runs SET ended_at=?,status=?,total_matches=?,errors_json=?,source_counts_json=? WHERE id=?")
    .bind(new Date().toISOString(),status,matched,JSON.stringify(failures),JSON.stringify({hacker_news:outputs.reduce((n,v)=>n+v.matched,0),stackexchange:stack.matched,stackexchange_status:stackStatus}),runId).run();
  return {run_id:runId,status,total_topics:count,matched,failures,
    sources:{hacker_news:outputs.reduce((n,v)=>n+v.matched,0),stackexchange:stack.matched,stackexchange_status:stackStatus},
    rate_limit_backoff_seconds:stack.backoff_seconds,topics:[...outputs,...stack.results]};
}
export default {
  async scheduled(controller,env,ctx){ctx.waitUntil(collect(env,{skipIfRecent:true}).then(result=>{
    console.log("Public problem collection summary",JSON.stringify({status:result.status,topics:result.total_topics,matched:result.matched,failures:result.failures.length}));
  }).catch(error=>{console.error("HN collector error",String(error?.message||error).slice(0,180));}));},
  async fetch(request,env){
    const pathname=new URL(request.url).pathname;
    if(request.method!=="POST"||pathname!=="/internal/collect"||!env?.DB)
      return new Response("Not found",{status:404});
    // This Worker has no public route or workers.dev; the dashboard uses a private service binding.
    const latest=await env.DB.prepare("SELECT started_at,status FROM collector_runs ORDER BY started_at DESC LIMIT 1").first();
    if(latest&&Date.now()-Date.parse(latest.started_at)<10*60*1000)
      return new Response(JSON.stringify({started:false,message:"Recently checked; retry after 10 minutes"}),
        {status:429,headers:{"content-type":"application/json","cache-control":"no-store"}});
    const result=await collect(env);
    return new Response(JSON.stringify({status:result.status,topics:result.total_topics,matched:result.matched,
      failed_topics:result.failures.length,sources:result.sources,backoff_seconds:result.rate_limit_backoff_seconds}),{headers:{"content-type":"application/json","cache-control":"no-store"}});
  }
};
