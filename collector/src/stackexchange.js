/** A second independent source of task questions via the official Stack Exchange API.
 * These are public questions with attribution, NOT validated Google search keywords.
 */
export const SE_TOPICS=[
  {keyword:"bulk image compressor",query:"batch image compress",site:"superuser",require:[["image","photo","picture"],["compress","reduce","size"]]},
  {keyword:"PDF size reducer",query:"compress pdf",site:"superuser",require:[["pdf"],["compress","reduce","smaller","size"]]},
  {keyword:"CSV duplicate row remover",query:"remove duplicate csv",site:"stackoverflow",require:[["csv"],["duplicat","deduplicat","repeat"]]},
  {keyword:"bulk file renamer",query:"batch rename files",site:"superuser",require:[["rename","renaming"],["file","photo","image","batch","bulk"]]},
  {keyword:"Shopify product image editor",query:"shopify resize images",site:"webapps",require:[["shopify"],["image","photo","picture","resize"]]},
  {keyword:"full page website screenshot",query:"full page screenshot",site:"superuser",require:[["screenshot","capture"],["web","browser","page"]]},
  {keyword:"avatar image format converter",query:"avatar image format",site:"superuser",require:[["avatar","profile","icon"],["image","picture","webp","format","convert"]]}
];
const BASE="https://api.stackexchange.com/2.3/search/advanced";
const VALID_SITES=new Set(["superuser","stackoverflow","webapps"]);
const DAYS=365,MAX_PER_TOPIC=4;
function compact(x){return String(x??"").replace(/\s+/g," ").trim()}
function htmlText(v){return compact(String(v??"").replace(/<[^>]+>/g," ").replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi,m=>({"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'","&nbsp;":" "}[m.toLowerCase()]||" ")))}
function redacted(t){return t.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[email redacted]").replace(/\+?\d[\d\s().-]{9,}\d/g,"[phone redacted]")}
export function searchURL(topic,now=Date.now()){
  if(!VALID_SITES.has(topic.site))throw Error("Unsupported Stack Exchange site");
  return BASE+"?"+new URLSearchParams({site:topic.site,q:topic.query,sort:"relevance",order:"desc",pagesize:"15",filter:"withbody"});
}
function questionMatches(title,body,topic){
  // Questions explicitly ask for help; require task/object near each other.
  const haystack=(title+" "+body.slice(0,750)).toLowerCase();
  const starts=/^(how|what|why|can|is there|where|best way|how to|how can|how do)\b/i.test(title);
  if(!starts && !/[?]/.test(title))return false;
  return topic.require.every(group=>group.some(part=>haystack.includes(part.toLowerCase())));
}
export function extractQuestions(data,topic,now=Date.now()){
  const rows=Array.isArray(data?.items)?data.items:[],oldest=now-DAYS*86400000,out=[],seen=new Set();
  for(const row of rows){
    if(!row||!Number.isInteger(row.question_id)||seen.has(row.question_id))continue;
    const published=Number(row.creation_date)*1000;
    if(!Number.isFinite(published)||published<oldest||published>now+86400000)continue;
    const title=htmlText(row.title),body=htmlText(row.body);
    if(!questionMatches(title,body,topic))continue;
    let address;
    try{address=new URL(row.link)}catch{continue}
    if(address.protocol!=="https:"||!/(^|\.)stackexchange\.com$|^stackoverflow\.com$|^superuser\.com$/.test(address.hostname))continue;
    seen.add(row.question_id);
    // Retain a short title only, not scraped body text or user identifiers.
    out.push({url:address.href,type:"stackexchange-question",note:redacted(title).slice(0,260),
      published_at:new Date(published).toISOString(),collected_at:new Date(now).toISOString(),
      source:"stackexchange-api-v2.3",source_query:topic.query,
      attribution:"Question on Stack Exchange (CC BY-SA 4.0); follow URL for author and full discussion",
      verified:false});
    if(out.length>=MAX_PER_TOPIC)break;
  }
  return out;
}
export async function collectStack(topics,now,fetcher,save){
  const results=[],errors=[];
  let backoff=0;
  for(const topic of topics.slice(0,8)){
    if(backoff)break;
    try{
      const resp=await fetcher(searchURL(topic,now),{headers:{"user-agent":"seo-opportunity-radar/5.0 public Q&A discovery"}});
      if(!resp.ok){
        let hint="";
        try{hint=String(await resp.text()).slice(0,120)}catch{}
        const err=Error("Stack Exchange HTTP "+resp.status+" "+hint.replace(/\s+/g," "));
        err.halt=true;
        err.backoff=resp.status===429?24*3600:12*3600;
        throw err;
      }
      const data=await resp.json();
      if(data.error_id){const err=Error("Stack Exchange API "+data.error_name);err.halt=true;err.backoff=12*3600;throw err;}
      backoff=Number.isFinite(data.backoff)&&data.backoff>0?data.backoff:0;
      const questions=extractQuestions(data,topic,now);
      const imported=questions.length?await save(topic,questions):0;
      results.push({topic:topic.keyword,matched:questions.length,imported});
    }catch(e){errors.push({topic:topic.keyword,reason:String(e?.message||e).slice(0,150)});if(e?.halt){backoff=e.backoff||12*3600;break;}}
  }
  return {results,errors,backoff_seconds:backoff,matched:results.reduce((n,r)=>n+r.matched,0)};
}
