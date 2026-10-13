/** Human SERP review stored separately from crawled/source records. */
import {suggestSites} from "./site-match.js";
const TYPES=new Set(["unknown","direct-tool","major-platform","guide-answer","irrelevant"]);
const INTENTS=new Set(["unknown","aligned","mixed","mismatch"]);
const QUALITY=new Set(["unrated","strong","mixed","weak"]);
const PLACEMENT=new Set(["research","extend-site","new-tool","reject"]);
const obj=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const clean=(v,n)=>String(v??"").trim().slice(0,n);
function safeUrl(link){
 try{const u=new URL(String(link));return ["http:","https:"].includes(u.protocol)&&!u.username&&!u.password?u.href:null}catch{return null}
}
function json(raw,def){try{return JSON.parse(raw)}catch{return def}}
export function validate(data){
 if(!obj(data)||!INTENTS.has(data.intent_fit)||!QUALITY.has(data.evidence_quality)||!PLACEMENT.has(data.placement))
  throw Error("Invalid assessment fields");
 for(const [name,limit] of [["target_site",200],["review_notes",3000],["monetization",100]]){
  if(typeof data[name]!=="string"||data[name].length>limit)throw Error("Invalid "+name);
 }
 const days=data.build_days;
 if(days!==null&&days!==""&&days!==undefined&&(!Number.isFinite(Number(days))||Number(days)<0||Number(days)>180))
  throw Error("Build days must be 0–180");
 const list=Array.isArray(data.snapshot?.organic)?data.snapshot.organic:[];
 if(list.length>10)throw Error("Only 10 SERP results allowed");
 const seen=new Set(),organic=[];
 for(const hit of list){
  const rank=Number(hit?.rank_group),url=safeUrl(hit?.url);
  if(!Number.isInteger(rank)||rank<1||rank>10||seen.has(rank)||!url)throw Error("Invalid SERP rank / URL");
  seen.add(rank);
  organic.push({rank_group:rank,url,title:clean(hit.title,250),domain:new URL(url).hostname});
 }
 organic.sort((a,b)=>a.rank_group-b.rank_group);
 const urlByRank=new Map(organic.map(h=>[h.rank_group,h.url]));
 if(!Array.isArray(data.labels)||data.labels.length>10)throw Error("Invalid SERP classification list");
 const labels=[],classified=new Set();
 for(const label of data.labels){
  const rank=Number(label?.rank),url=safeUrl(label?.url);
  if(!Number.isInteger(rank)||!TYPES.has(label.type)||url!==urlByRank.get(rank)||classified.has(rank))
   throw Error("Classification must match a unique rank and source URL");
  labels.push({rank,url,type:label.type});classified.add(rank);
 }
 const source=data.snapshot?.provider;
 const snapshot={organic,reviewed_at:new Date().toISOString().slice(0,10),
  provider:source==="dataforseo-google-organic-live-advanced"?"dataforseo-imported":"human-entered",
  location_code:2840,language_code:"en",
  disclaimer:"SERP URLs were imported or supplied by a user, not independently verified here"};
 return {intent_fit:data.intent_fit,evidence_quality:data.evidence_quality,placement:data.placement,
  target_site:data.target_site.trim(),monetization:data.monetization.trim(),review_notes:data.review_notes.trim(),
  build_days:days===null||days===""||days===undefined?null:Number(days),
  snapshot,labels};
}
function shape(record,keyword,fallback){
 let snapshot=json(record?.snapshot_json||"{}",{organic:[]});
 let labels=json(record?.labels_json||"[]",[]);
 if(!record&&obj(fallback)&&Array.isArray(fallback.organic))snapshot=fallback;
 const counts={direct_tool:0,major_platform:0,guide_answer:0,irrelevant:0};
 let classified=0;
 for(const label of labels){
  if(label.type!=="unknown"){classified++;if(label.type==="direct-tool")counts.direct_tool++;
   if(label.type==="major-platform")counts.major_platform++;
   if(label.type==="guide-answer")counts.guide_answer++;
   if(label.type==="irrelevant")counts.irrelevant++;}
 }
 return {keyword,available:!!record,intent_fit:record?.intent_fit||"unknown",
  evidence_quality:record?.evidence_quality||"unrated",placement:record?.placement||"research",
  target_site:record?.target_site||"",monetization:record?.monetization||"",
  review_notes:record?.review_notes||"",build_days:record?.build_days??null,
  snapshot,labels,evaluated_at:record?.evaluated_at||null,classification_count:classified,
  serp_review_complete:(snapshot?.organic?.length||0)>=5&&classified>=5,
  counts,site_suggestions:suggestSites(keyword),
  warning:"Human labels are subjective. A reviewed SERP is not proof of ranking potential."};
}
export async function readAssessment(db,id){
 const item=await db.prepare("SELECT keyword,record_json FROM opportunities WHERE id=?").bind(id).first();
 if(!item)return null;
 const record=await db.prepare("SELECT * FROM opportunity_assessments WHERE opportunity_id=?").bind(id).first();
 const payload=json(item.record_json,{});
 return shape(record,item.keyword,payload.serp_snapshot);
}
export async function saveAssessment(db,id,data){
 const item=await db.prepare("SELECT keyword FROM opportunities WHERE id=?").bind(id).first();
 if(!item)return null;
 const r=validate(data);
 const sql="INSERT INTO opportunity_assessments (opportunity_id,intent_fit,evidence_quality,placement,target_site,build_days,"+
 "monetization,review_notes,snapshot_json,labels_json,evaluated_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now')) "+
 "ON CONFLICT(opportunity_id) DO UPDATE SET intent_fit=excluded.intent_fit,evidence_quality=excluded.evidence_quality,"+
 "placement=excluded.placement,target_site=excluded.target_site,build_days=excluded.build_days,"+
 "monetization=excluded.monetization,review_notes=excluded.review_notes,snapshot_json=excluded.snapshot_json,"+
 "labels_json=excluded.labels_json,evaluated_at=datetime('now')";
 await db.prepare(sql).bind(id,r.intent_fit,r.evidence_quality,r.placement,r.target_site,r.build_days,
    r.monetization,r.review_notes,JSON.stringify(r.snapshot),JSON.stringify(r.labels)).run();
 return readAssessment(db,id);
}
export const testHooks={safeUrl,shape};
