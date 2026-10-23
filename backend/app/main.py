from __future__ import annotations
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import create_engine, String, Float, DateTime, JSON, Boolean, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
import os, uuid
from pathlib import Path

def load_local_env(path:Path=Path(".env")):
    if not path.exists(): return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line=raw.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        key,value=line.split("=",1); key=key.strip(); value=value.strip().strip("\"'")
        if key and key.replace("_", "").isalnum(): os.environ.setdefault(key,value)

load_local_env()
DB_URL=os.getenv("DATABASE_URL", "sqlite:///./pralert.db")
engine=create_engine(DB_URL, connect_args={"check_same_thread":False} if DB_URL.startswith("sqlite") else {})
Session=sessionmaker(engine, expire_on_commit=False)
class Base(DeclarativeBase): pass
class Record(Base):
    __tablename__="records"
    id: Mapped[str]=mapped_column(String, primary_key=True)
    kind: Mapped[str]=mapped_column(String, index=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), index=True)
    payload: Mapped[dict]=mapped_column(JSON)
Base.metadata.create_all(engine)

class EvidenceIn(BaseModel):
    source_type:str; source_name:str; hazard_type:str="flood"; source_url:str|None=None
    published_at:datetime|None=None; observed_at:datetime|None=None
    location:str="Delhi NCR"; geographic_scope:str="Delhi NCR"
    normalized_claims:list[str]=[]; measurement_values:dict[str,float]={}
    source_reliability:float=Field(default=.5, ge=0, le=1)
    verification_status:str="unverified"; duplicate_cluster_id:str|None=None
    simulation_flag:bool=False
class SettingsPatch(BaseModel):
    official_feed_urls:list[str]|None=None
    @field_validator("official_feed_urls")
    @classmethod
    def validate_feed_urls(cls,value):
        if value is not None and any(not u.startswith(("https://","http://")) for u in value):
            raise ValueError("Feed URLs must use http or https")
        return value
    community_query:str|None=None
    city:str|None=None; scope_km:int|None=Field(default=None, ge=1, le=500)
    rainfall_threshold_mm:float|None=Field(default=None, ge=0, le=1000)
    wind_threshold_kmh:float|None=Field(default=None, ge=0, le=500)
    polling_minutes:int|None=Field(default=None, ge=1, le=1440)
    mode:str|None=None

app=FastAPI(title="PRALERT API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS","http://localhost:5173").split(","), allow_methods=["*"], allow_headers=["*"])
settings={"city":"Delhi NCR","scope_km":25,"rainfall_threshold_mm":50,"wind_threshold_kmh":80,"polling_minutes":15,"official_feed_urls":[],"community_query":"urban flooding heavy rain","mode":os.getenv("APP_MODE","simulation"),"timezone":"Asia/Kolkata"}
with Session() as _db:
    _stored=_db.get(Record,"app-settings")
    if _stored: settings.update(_stored.payload)
agent_specs=[("weather_sentinel","Weather Sentinel","OpenWeatherMap configuration required"),("official_alert_monitor","Official Alert Monitor","RSS/Atom feeds not configured"),("community_signal_analyst","Community Signal Analyst","Tavily key not configured"),("incident_coordinator","Incident Coordinator","Deterministic coordinator active")]
def now(): return datetime.now(timezone.utc)
def rows(kind):
    with Session() as s: return [{**r.payload, "id":r.id, "created_at":r.created_at.isoformat()} for r in s.scalars(select(Record).where(Record.kind==kind).order_by(Record.created_at.desc()))]
def save(kind,payload,ident=None):
    ident=ident or str(uuid.uuid4())
    with Session() as s:
        existing=s.get(Record,ident)
        if existing:
            existing.kind=kind; existing.payload=payload
        else:
            s.add(Record(id=ident,kind=kind,created_at=now(),payload=payload))
        s.commit()
    return {"id":ident,"created_at":now().isoformat(),**payload}

def severity_name(n): return ["LOW","GUARDED","ELEVATED","HIGH","CRITICAL"][max(0,min(4,(n-1)//2))]
def calculate_risk(evidence:list[dict], previous:int|None=None):
    used=[]; excluded=[]; unique=[]; seen=set(); t=now()
    for e in evidence:
        if e.get("duplicate_cluster_id") and e["duplicate_cluster_id"] in seen:
            excluded.append({"id":e["id"],"reason":"duplicate cluster suppressed"}); continue
        if e.get("duplicate_cluster_id"): seen.add(e["duplicate_cluster_id"])
        obs=e.get("observed_at") or e.get("published_at")
        age=9999
        if obs:
            try: age=(t-datetime.fromisoformat(obs.replace("Z","+00:00")).astimezone(timezone.utc)).total_seconds()/3600
            except Exception: pass
        freshness=1 if age<=3 else .5 if age<=12 else 0
        if freshness==0: excluded.append({"id":e["id"],"reason":"stale evidence"}); continue
        unique.append((e,freshness)); used.append(e["id"])
    rain=max([x[0].get("measurement_values",{}).get("rainfall_1h_mm",0) for x in unique] or [0])
    intensity=3 if rain>=settings["rainfall_threshold_mm"] else 2 if rain>=25 else 1 if rain>0 else 0
    official= min(2,sum(1 for e,_ in unique if e["source_type"]=="official" and e.get("verification_status")=="verified"))
    community=min(2,len({e.get("source_name") for e,f in unique if e["source_type"]=="community" and e.get("verification_status")!="verified"}))
    components={"hazard_intensity":intensity,"official_confirmation":official,"community_corroboration":community,"geographic_relevance":2 if unique else 0,"freshness":1 if unique else 0}
    score=sum(components.values()); confidence="LOW" if len(unique)<2 else "MEDIUM" if len(unique)<4 else "HIGH"
    return {"score":score,"severity":severity_name(score),"confidence":confidence,"components":components,"evidence_ids":used,"excluded":excluded,"stale_or_missing":[] if unique else ["No fresh evidence; missing data is not a safe condition"],"change_reason":f"score {previous if previous is not None else '—'} → {score}; based on {len(used)} fresh independent records"}

SCENARIOS={
"escalating-flood":{"name":"Escalating urban flood","description":"Rainfall threshold, official warning, independent community observations.","events":[
 {"at":0,"expected":"Log the observation without opening an incident.","type":"weather","payload":{"rainfall_1h_mm":18,"claims":["Heavy rain observed"]}},
 {"at":5,"expected":"Cross the configured rainfall threshold and elevate risk.","type":"weather","payload":{"rainfall_1h_mm":58,"claims":["Rainfall threshold exceeded"]}},
 {"at":10,"expected":"Add verified official confirmation and revise the advisory.","type":"official","payload":{"claim":"Official flood watch for Delhi NCR","verified":True}},
 {"at":15,"expected":"Add one unverified, independent local report.","type":"community","payload":{"claim":"Water accumulating near local underpass","source":"Resident report A"}},
 {"at":20,"expected":"Corroborate with another source and increase confidence.","type":"community","payload":{"claim":"Street water observed in monitored area","source":"Resident report B"}}]},
"unconfirmed-rumor":{"name":"Unconfirmed rumor","description":"A dramatic claim arrives without independent corroboration.","events":[{"at":0,"expected":"Keep the claim unverified and do not escalate to a confirmed emergency.","type":"community","payload":{"claim":"Major flood across the whole city","source":"Unverified post"}}]},
"stale-conflict":{"name":"Conflicting or stale evidence","description":"An old alert is contradicted while current weather is unavailable.","events":[{"at":0,"expected":"Discount the stale warning instead of treating it as active.","type":"official","payload":{"claim":"Flood warning from yesterday","verified":True,"stale":True}},{"at":5,"expected":"Keep conflicting observation unverified; missing current measurements stay missing.","type":"community","payload":{"claim":"No flooding observed at monitored location","source":"Current observer"}}]}}
simulation={"running":False,"scenario_id":None,"index":0,"started_at":None,"speed":1,"results":[],"assertions":[]}

def inject(event, scenario_id):
    typ=event["type"]; p=event["payload"]; stale=p.get("stale",False)
    e=EvidenceIn(source_type=typ,source_name=p.get("source","Weather feed" if typ=="weather" else typ.title()+" source"),hazard_type="flood",location=settings["city"],normalized_claims=p.get("claims",[p.get("claim","")]),measurement_values={k:v for k,v in p.items() if isinstance(v,(int,float))},source_reliability=.9 if typ=="official" else .55,verification_status="verified" if typ=="official" and p.get("verified") else "unverified",duplicate_cluster_id=p.get("duplicate"),simulation_flag=True,observed_at=now()-timedelta(days=1) if stale else now())
    ev=e.model_dump(mode="json"); ev["scenario_id"]=scenario_id; result=save("evidence",ev)
    fresh=[x for x in rows("evidence") if x.get("scenario_id")==scenario_id]; risk=calculate_risk(fresh)
    incs=rows("incidents"); inc=next((i for i in incs if i.get("simulation_flag") and i.get("scenario_id")==scenario_id),None)
    if risk["score"]>=5 or (inc and risk["score"]>0):
        status="ESCALATED" if risk["score"]>=8 else "INVESTIGATING"
        if inc:
            inc.update(risk_score=risk["score"],severity=risk["severity"],confidence=risk["confidence"],status=status,updated_at=now().isoformat(),risk=risk,evidence_count=len([x for x in fresh if x.get("simulation_flag")]))
            inc=save("incidents",inc,inc["id"])
        else:
            inc={"title":"Flood conditions under assessment","hazard":"flood","location":settings["city"],"status":status,"risk_score":risk["score"],"severity":risk["severity"],"confidence":risk["confidence"],"simulation_flag":True,"scenario_id":scenario_id,"created_at":now().isoformat(),"updated_at":now().isoformat(),"risk":risk,"evidence_count":1}
            inc=save("incidents",inc)
        if risk["score"]>=5:
            save("advisories",{"incident_id":inc["id"],"revision":len(rows("advisories"))+1,"what":"Evidence indicates conditions requiring assessment.","where":settings["city"]+" monitored area; precise affected locations are unknown.","action":"Follow verified official guidance. Avoid entering moving or standing floodwater.","confidence":risk["confidence"],"severity":risk["severity"],"simulation_flag":True,"sources":risk["evidence_ids"]})
    out={"event":event,"evidence_id":result["id"],"risk":risk,"simulation_flag":True,"incident":inc if risk["score"]>=3 else None}
    save("activity",{"kind":"simulation_event","message":p.get("claim") or ", ".join(p.get("claims",[])),"simulation_flag":True})
    return out

@app.get("/api/v1/health")
def health(): return {"status":"ok","database":"connected","mode":settings["mode"],"timestamp":now().isoformat()}
@app.get("/api/v1/status")
def status(): return {"mode":settings["mode"],"connected":True,"city":settings["city"],"last_refresh":now().isoformat(),"simulation":simulation["running"]}
@app.get("/api/v1/agents")
def agents():
    history=rows("runs")
    output=[]
    for ident,name,message in agent_specs:
        latest=next((r for r in history if r.get("agent")==ident),None)
        state="operational" if ident=="incident_coordinator" else latest.get("status","awaiting_configuration") if latest else "awaiting_configuration"
        output.append({"id":ident,"name":name,"state":state,"message":latest.get("message") if latest else message,"last_run":latest.get("started_at") if latest else None,"duration_ms":latest.get("duration_ms") if latest else None})
    return output
@app.get("/api/v1/agents/runs")
def runs(): return rows("runs")
@app.post("/api/v1/agents/{agent_name}/run")
async def run_agent(agent_name:str):
    if agent_name not in [a[0] for a in agent_specs]: raise HTTPException(404,"Unknown agent")
    started=now().isoformat(); produced=[]
    try:
        from .collectors import collect_weather, collect_official, collect_community
        if agent_name=="weather_sentinel": produced=await collect_weather()
        elif agent_name=="official_alert_monitor": produced=await collect_official(settings.get("official_feed_urls",[]))
        elif agent_name=="community_signal_analyst": produced=await collect_community(settings.get("community_query"))
        else:
            assessment=calculate_risk(rows("evidence")); result=save("runs",{"agent":agent_name,"status":"operational","message":assessment["change_reason"],"started_at":started,"evidence_count":0}); return result
        for item in produced: save("evidence",item.model_dump(mode="json"))
        configured=bool(produced) or (agent_name=="official_alert_monitor" and bool(settings.get("official_feed_urls")))
        result=save("runs",{"agent":agent_name,"status":"operational" if configured else "degraded","message":f"Collected {len(produced)} evidence records" if produced else "No records collected; provider may be unconfigured or no matching records were available","started_at":started,"evidence_count":len(produced)})
        return result
    except Exception as exc:
        return save("runs",{"agent":agent_name,"status":"degraded","message":f"Collection failed: {type(exc).__name__}","started_at":started,"evidence_count":0})
@app.get("/api/v1/weather/current")
async def weather():
    if not os.getenv("OPENWEATHER_API_KEY"):
        return {"configured":False,"status":"awaiting_configuration","observation":None,"message":"Configure OPENWEATHER_API_KEY to collect live weather; missing data is not interpreted as safe."}
    try:
        from .collectors import collect_weather
        observed=await collect_weather()
        return {"configured":True,"status":"operational" if observed else "no_measurement","observation":observed[0].model_dump(mode="json") if observed else None}
    except Exception as exc:
        return {"configured":True,"status":"degraded","observation":None,"message":f"Provider request failed: {type(exc).__name__}"}
@app.get("/api/v1/evidence")
def evidence(): return rows("evidence")
@app.get("/api/v1/evidence/{evidence_id}")
def evidence_one(evidence_id:str):
    e=next((x for x in rows("evidence") if x["id"]==evidence_id),None)
    if not e: raise HTTPException(404,"Evidence not found")
    return e
@app.get("/api/v1/incidents")
def incidents(): return rows("incidents")
@app.get("/api/v1/incidents/{incident_id}")
def incident(incident_id:str):
    i=next((x for x in rows("incidents") if x["id"]==incident_id),None)
    if not i: raise HTTPException(404,"Incident not found")
    return i
@app.get("/api/v1/incidents/{incident_id}/timeline")
def timeline(incident_id:str):
    if not any(x["id"]==incident_id for x in rows("incidents")): raise HTTPException(404,"Incident not found")
    return rows("activity")
@app.get("/api/v1/incidents/{incident_id}/evidence")
def incident_evidence(incident_id:str): return [e for e in rows("evidence") if e.get("simulation_flag")]
@app.get("/api/v1/incidents/{incident_id}/advisories")
def incident_advisories(incident_id:str): return [a for a in rows("advisories") if a.get("incident_id")==incident_id]
@app.post("/api/v1/incidents/{incident_id}/acknowledge")
def acknowledge(incident_id:str): return transition(incident_id,"acknowledged")
@app.post("/api/v1/incidents/{incident_id}/resolve")
def resolve(incident_id:str): return transition(incident_id,"RESOLVED")
@app.post("/api/v1/incidents/{incident_id}/reopen")
def reopen(incident_id:str): return transition(incident_id,"INVESTIGATING")
def transition(iid,state):
    inc=next((x for x in rows("incidents") if x["id"]==iid),None)
    if not inc: raise HTTPException(404,"Incident not found")
    inc["status"]=state; inc["updated_at"]=now().isoformat(); save("incidents",inc,iid); save("activity",{"kind":"lifecycle","message":f"Incident {state}","incident_id":iid}); return inc
@app.get("/api/v1/analytics/overview")
def analytics():
    inc=rows("incidents"); ev=rows("evidence")
    return {"active_incidents":sum(i.get("status")!="RESOLVED" for i in inc),"highest_risk":max([i.get("risk_score",0) for i in inc] or [0]),"evidence_count":len(ev),"sources_configured":sum(bool(os.getenv(k)) for k in ["OPENWEATHER_API_KEY","TAVILY_API_KEY"]),"source_total":3,"simulation_count":sum(e.get("simulation_flag",False) for e in ev)}
@app.get("/api/v1/analytics/evaluation")
def evaluation(): return {"results":simulation["results"],"assertions":simulation["assertions"],"synthetic":True}
@app.get("/api/v1/settings")
def get_settings(): return settings
@app.patch("/api/v1/settings")
def patch_settings(p:SettingsPatch):
    for k,v in p.model_dump(exclude_none=True).items(): settings[k]=v
    save("settings",settings,"app-settings")
    return settings
@app.get("/api/v1/integrations")
def integrations(): return [{"name":n,"configured":bool(os.getenv(env)),"status":"configured" if os.getenv(env) else "awaiting_configuration","secret_sent_to_client":False} for n,env in [("openweathermap","OPENWEATHER_API_KEY"),("tavily","TAVILY_API_KEY"),("anthropic","ANTHROPIC_API_KEY"),("twilio","TWILIO_ACCOUNT_SID")]]+[{"name":"official_feeds","configured":False,"status":"no feed URLs configured"}]
@app.post("/api/v1/integrations/{integration_name}/test")
def test_integration(integration_name:str): return {"name":integration_name,"success":False,"message":"No credentials or feed configured; no live request was made."}
@app.get("/api/v1/simulation/scenarios")
def scenarios(): return [{"id":k,"name":v["name"],"description":v["description"],"event_count":len(v["events"])} for k,v in SCENARIOS.items()]
@app.post("/api/v1/simulation/start")
def start(body:dict):
    sid=body.get("scenario_id")
    if sid not in SCENARIOS: raise HTTPException(422,"Unknown scenario")
    simulation.update(running=True,scenario_id=sid,index=0,started_at=now().isoformat(),speed=max(.25,min(8,float(body.get("speed",1)))),results=[],assertions=[])
    return simulation_status()
@app.post("/api/v1/simulation/pause")
def pause(): simulation["running"]=False; return simulation_status()
@app.post("/api/v1/simulation/resume")
def resume():
    if simulation["scenario_id"] is None: raise HTTPException(409,"No simulation is active")
    simulation["running"]=True; return simulation_status()
@app.post("/api/v1/simulation/step")
def step():
    sid=simulation["scenario_id"]
    if not sid: raise HTTPException(409,"Start a scenario first")
    events=SCENARIOS[sid]["events"]
    if simulation["index"]>=len(events): simulation["running"]=False; return simulation_status()
    event=events[simulation["index"]]; simulation["index"]+=1
    result=inject(event,sid); simulation["results"].append(result)
    scenario=SCENARIOS[sid]
    assertions=[{"name":"event persisted","passed":any(x.get("id")==result["evidence_id"] for x in rows("evidence"))},{"name":"simulation provenance preserved","passed":result["simulation_flag"]},{"name":"duplicate suppression","passed":len(result["risk"]["evidence_ids"])<=len(rows("evidence"))}]
    if sid=="unconfirmed-rumor": assertions.append({"name":"unsupported rumor stays unconfirmed","passed":result["risk"]["confidence"]=="LOW" and not (result.get("incident") and result["incident"].get("status")=="ESCALATED")})
    if sid=="escalating-flood" and event["type"]=="weather" and event["payload"].get("rainfall_1h_mm",0)>=settings["rainfall_threshold_mm"]: assertions.append({"name":"configured rainfall threshold represented","passed":result["risk"]["components"]["hazard_intensity"]==3})
    if sid=="stale-conflict" and event["payload"].get("stale"): assertions.append({"name":"stale warning discounted","passed":result["risk"]["score"]==0 and bool(result["risk"]["excluded"])})
    simulation["assertions"].extend(assertions)
    if simulation["index"]>=len(events): simulation["running"]=False
    return simulation_status()
@app.post("/api/v1/simulation/reset")
def reset():
    simulation.update(running=False,scenario_id=None,index=0,started_at=None,results=[],assertions=[])
    with Session() as s:
        for r in list(s.scalars(select(Record).where(Record.kind.in_(["evidence","incidents","advisories","activity"])))):
            if r.payload.get("simulation_flag"):
                s.delete(r)
        s.commit()
    return simulation_status()
@app.get("/api/v1/simulation/status")
def simulation_status():
    sid=simulation["scenario_id"]; events=SCENARIOS[sid]["events"] if sid else []
    return {**simulation,"scenario":SCENARIOS[sid]["name"] if sid else None,"event_count":len(events),"next_event":events[simulation["index"]] if simulation["index"]<len(events) else None}
@app.get("/api/v1/simulation/events")
def simulation_events(): return [e for e in rows("activity") if e.get("simulation_flag")]



