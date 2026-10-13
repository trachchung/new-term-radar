/** Advisory topical similarity, NOT business/SEO competition fit. */
export const SITES=[
 {domain:"imagekb.net",label:"图片压缩工具",terms:["image","photo","picture","jpg","jpeg","png","webp","compress","resize"],exclusion:["epa 608","dreamstime","lewis structure"]},
 {domain:"soocly.com",label:"EPA 608 / HVAC 练习",terms:["epa 608","hvac","refrigerant","608 practice"],exclusion:["dreamstime"]},
 {domain:"dreamstimedownloader.com",label:"Dreamstime 图片视频下载",terms:["dreamstime"],exclusion:[]},
 {domain:"lewisstructuregenerator.org",label:"Lewis Structure 化学工具",terms:["lewis structure","chemical bonding","molecular structure"],exclusion:[]}
];
export function suggestSites(keyword){
 const term=String(keyword||"").normalize("NFKC").toLowerCase();
 return SITES.map(site=>{
  if(site.exclusion.some(x=>term.includes(x)))return null;
  const matching=site.terms.filter(x=>x.includes(" ")?term.includes(x):new RegExp("(^|[^a-z])"+x+"([^a-z]|$)").test(term));
  const meaningful=matching.some(x=>x.length>=7||x.includes(" "));
  if(!meaningful)return null;
  return {domain:site.domain,label:site.label,matched_terms:matching,
   fit_hint:matching.length>=2?"adjacent-topic":"weak-topic",
   disclaimer:"仅匹配主题表达；必须人工判断站点适配"};
 }).filter(Boolean).sort((a,b)=>b.matched_terms.length-a.matched_terms.length);
}
