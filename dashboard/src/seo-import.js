/** Merge opt-in provider snapshots into existing opportunities. Never destroy user work. */
const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
function usableVolume(row){
 const n=row.monthly_searches;
 return typeof n==="number"&&Number.isFinite(n)&&n>=0&&typeof row.monthly_searches_source==="string"
 &&row.monthly_searches_source.length>10;
}
function validSnapshot(v){
 return object(v)&&Array.isArray(v.organic)&&v.organic.length<=10&&
 typeof v.reviewed_at==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v.reviewed_at)&&
 v.organic.every(x=>object(x)&&Number.isInteger(x.rank_group)&&x.rank_group>=1&&x.rank_group<=10
 &&typeof x.url==="string"&&/^https?:\/\//.test(x.url));
}
export async function importSeoReview(db,payload){
 if(!object(payload)||!Array.isArray(payload.reviews)||payload.reviews.length<1||payload.reviews.length>50)
  throw Error("Invalid SEO import: reviews must contain 1–50 items");
 const batch=[],unmatched=[],updated=[];
 const used=new Set();
 for(const review of payload.reviews){
  if(!object(review)||typeof review.keyword!=="string"||review.keyword.trim().length<2)throw Error("Invalid keyword");
  const key=review.keyword.trim().normalize("NFKC").toLowerCase();
  if(used.has(key))continue;used.add(key);
  const row=await db.prepare("SELECT id,record_json,stage,keyword FROM opportunities WHERE normalized_key=?").bind(key).first();
  if(!row){unmatched.push(review.keyword);continue}
  let old={};try{old=JSON.parse(row.record_json)}catch{}
  const before=JSON.stringify(old);
  if(usableVolume(review)&&(old.monthly_searches===null||old.monthly_searches===undefined)){
    old.monthly_searches=review.monthly_searches;old.monthly_searches_source=review.monthly_searches_source;
  }
  for(const k of ["ads_cpc_usd","ads_competition_index","provider_keyword_difficulty","provider_kd_note"]){
   if((old[k]===undefined||old[k]===null)&&review[k]!==undefined&&review[k]!==null)old[k]=review[k];
  }
  if(validSnapshot(review.serp_snapshot)&&
    (!validSnapshot(old.serp_snapshot)||review.serp_snapshot.reviewed_at>=old.serp_snapshot.reviewed_at)){
    old.serp_snapshot=review.serp_snapshot;
  }
  if(review.keyword_idea_seed && typeof review.keyword_idea_seed==="string"){
   old.keyword_idea_seed=review.keyword_idea_seed.slice(0,120);
  }
  if(old.monthly_searches!==null&&old.monthly_searches!==undefined || old.serp_snapshot){
   old.import_note="Search estimates and URLs supplied by account owner via import; not independently rechecked.";
  }
  if(JSON.stringify(old)===before)continue;
  const stage=row.stage==="hypothesis"?"needs-evidence":row.stage;
  batch.push(db.prepare("UPDATE opportunities SET record_json=?,stage=?,imported_at=datetime('now') WHERE id=?")
    .bind(JSON.stringify(old),stage,row.id));
  updated.push(row.keyword);
 }
 if(batch.length)await db.batch(batch);
 return {updated:updated.length,updated_keywords:updated,unmatched,notice:"Existing user annotations and review decisions were not overwritten"};
}
