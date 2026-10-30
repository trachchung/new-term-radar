/** Advisory topical similarity, NOT business/SEO competition fit. */
export const SITES=[
 {domain:"imagekb.net",label:"Image compression tool",terms:["image","photo","picture","jpg","jpeg","png","webp","compress","resize"],exclusion:["epa 608","dreamstime","lewis structure"]},
 {domain:"soocly.com",label:"EPA 608 / HVAC practice",terms:["epa 608","hvac","refrigerant","608 practice"],exclusion:["dreamstime"]},
 {domain:"dreamstimedownloader.com",label:"Dreamstime image and video downloader",terms:["dreamstime"],exclusion:[]},
 {domain:"lewisstructuregenerator.org",label:"Lewis Structure chemistry tool",terms:["lewis structure","chemical bonding","molecular structure"],exclusion:[]}
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
   disclaimer:"Matches topic wording only; judge site fit by hand"};
 }).filter(Boolean).sort((a,b)=>b.matched_terms.length-a.matched_terms.length);
}
