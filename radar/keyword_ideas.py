"""Opt-in, billed DataForSEO keyword suggestions; never automatic."""
from __future__ import annotations
import argparse, json
from datetime import datetime,timezone
from pathlib import Path
from . import seo_verify
ENDPOINT="dataforseo_labs/google/keyword_suggestions/live"

def seeds(payload,limit=2):
    if not isinstance(payload,dict):raise ValueError("Input is not object")
    raw=payload.get("opportunities",payload.get("keywords"))
    if not isinstance(raw,list):raise ValueError("Expected opportunities or keywords array")
    result=[]
    for row in raw:
        phrase=" ".join(str((row.get("keyword") if isinstance(row,dict) else row) or "").split())
        if len(phrase)>=3 and phrase.casefold() not in [s.casefold() for s in result]:
            result.append(phrase)
        if len(result)>=limit:break
    return result

def parse_response(response,seed,location=2840,language="en",max_items=20):
    tasks=seo_verify.task_result(response)
    rows=(tasks[0].get("items") or []) if tasks else []
    out=[];seen=set();today=datetime.now(timezone.utc).date().isoformat()
    for item in rows[:max_items]:
        if not isinstance(item,dict):continue
        phrase=" ".join(str(item.get("keyword") or "").split()).lower()
        if len(phrase)<3 or phrase in seen:continue
        seen.add(phrase)
        info=item.get("keyword_info") or {}
        info=info if isinstance(info,dict) else {}
        volume,cpc=info.get("search_volume"),info.get("cpc")
        properties=item.get("keyword_properties") or {}
        kd=properties.get("keyword_difficulty") if isinstance(properties,dict) else None
        record={"keyword":phrase,"keyword_idea_seed":seed,"keyword_idea_source":"DataForSEO Labs Google Keyword Suggestions",
                "keyword_idea_country":location,"keyword_idea_language":language,"keyword_idea_checked_at":today}
        if isinstance(volume,(int,float)) and not isinstance(volume,bool) and volume>=0:
            record["monthly_searches"]=int(volume)
            record["monthly_searches_source"]=f"dataforseo-labs-google-{location}-{language}-{today}"
        if isinstance(cpc,(int,float)) and not isinstance(cpc,bool) and cpc>=0:
            record["ads_cpc_usd"]=float(cpc)
        if isinstance(kd,int) and 0<=kd<=100:
            record["provider_keyword_difficulty"]=kd
            record["provider_kd_note"]="DataForSEO proprietary estimate; not a Google rank probability"
        out.append(record)
    return out

def ideas(terms,provider=None,location=2840,language="en",per_seed=20):
    provider=provider or seo_verify.request
    reviews=[];errors=[];spent=0.
    for term in terms:
        try:
            response=provider(ENDPOINT,{"keyword":term,"location_code":location,"language_code":language,
                "limit":per_seed,"ignore_synonyms":True,"include_serp_info":False,
                "include_clickstream_data":False})
            reviews+=parse_response(response,term,location,language,per_seed)
            cost=response.get("cost")
            if isinstance(cost,(int,float)) and cost>=0:spent+=float(cost)
        except (OSError,ValueError,KeyError,TypeError) as e:
            errors.append({"seed":term,"error":str(e)[:160]})
    unique={r["keyword"]:r for r in reviews}
    return {"generated_at":datetime.now(timezone.utc).isoformat(),
      "source":"DataForSEO Labs Google Keyword Suggestions","region":location,"language":language,
      "attempted_calls":len(terms),"reported_api_cost_usd":round(spent,5),
      "notice":"Search volume is an estimate. Keyword suggestions do not prove user problems or SEO rankability.",
      "reviews":list(unique.values()),"errors":errors}

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input",default="opportunities.json");p.add_argument("--out",default="research.ideas.json")
    p.add_argument("--limit-seeds",type=int,default=2);p.add_argument("--results-per-seed",type=int,default=20)
    p.add_argument("--location",type=int,default=2840);p.add_argument("--language",default="en")
    p.add_argument("--paid",action="store_true");p.add_argument("--fixture")
    args=p.parse_args(argv)
    if not 1<=args.limit_seeds<=3 or not 1<=args.results_per_seed<=30:
        p.error("Limit 1..3 seeds and 1..30 suggested words per seed")
    if not args.paid and not args.fixture:p.error("Choose --paid explicitly or use --fixture for offline testing")
    try:
        payload=json.loads(Path(args.input).read_text(encoding="utf-8"))
        terms=seeds(payload,args.limit_seeds)
        if args.fixture:
            samples=json.loads(Path(args.fixture).read_text(encoding="utf-8"))
            provider=lambda endpoint,body:samples[body["keyword"]]
        else:provider=seo_verify.request
        output=ideas(terms,provider,args.location,args.language,args.results_per_seed)
        Path(args.out).write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding="utf-8")
    except (OSError,ValueError,TypeError,KeyError) as exc:p.error(str(exc))
    print(f"Suggestions: {len(output['reviews'])}; requests attempted: {output['attempted_calls']}; provider cost USD {output['reported_api_cost_usd']}.")
    return 0
if __name__=="__main__":raise SystemExit(main())
