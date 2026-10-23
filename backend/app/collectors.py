from __future__ import annotations
from datetime import datetime, timezone
import os, re, hashlib, xml.etree.ElementTree as ET
import httpx
from .main import settings, EvidenceIn

async def collect_weather() -> list[EvidenceIn]:
    key=os.getenv('OPENWEATHER_API_KEY')
    if not key: return []
    async with httpx.AsyncClient(timeout=8) as client:
        r=await client.get('https://api.openweathermap.org/data/2.5/weather',params={'q':settings['city'],'appid':key,'units':'metric'}); r.raise_for_status(); data=r.json()
    rain=(data.get('rain') or {}).get('1h')
    evidence=[]
    if rain is not None:
        evidence.append(EvidenceIn(source_type='weather',source_name='OpenWeatherMap',source_url='https://openweathermap.org/',hazard_type='flood',location=settings['city'],observed_at=datetime.fromtimestamp(data['dt'],timezone.utc),measurement_values={'rainfall_1h_mm':float(rain)},source_reliability=.75,verification_status='measured'))
    return evidence

async def collect_official(feeds:list[str]) -> list[EvidenceIn]:
    found=[]
    async with httpx.AsyncClient(timeout=8,follow_redirects=True) as client:
        for url in feeds:
            if not url.startswith(('https://','http://')): continue
            try:
                response=await client.get(url); response.raise_for_status(); root=ET.fromstring(response.text)
                for item in root.findall('.//item')+root.findall('.//{*}entry'):
                    title=item.findtext('title') or ''; link=item.findtext('link') or ''
                    if not link:
                        node=item.find('{*}link'); link=node.attrib.get('href','') if node is not None else ''
                    desc=item.findtext('description') or item.findtext('{*}summary') or ''
                    published=item.findtext('pubDate') or item.findtext('{*}published')
                    parsed=None
                    if published:
                        try: parsed=datetime.fromisoformat(published.replace('Z','+00:00'))
                        except ValueError: pass
                    if re.search(r' flood|rain|inundat|waterlog',title+' '+desc,re.I):
                        found.append(EvidenceIn(source_type='official',source_name='Configured official feed',source_url=link or url,published_at=parsed,hazard_type='flood',location=settings['city'],normalized_claims=[title, re.sub('<[^>]+>',' ',desc)[:500]],source_reliability=.9,verification_status='unverified'))
            except (httpx.HTTPError,ET.ParseError): continue
    return found

async def collect_community(query:str|None=None) -> list[EvidenceIn]:
    key=os.getenv('TAVILY_API_KEY')
    if not key: return []
    q=query or f'urban flooding heavy rain reports {settings["city"]}'
    async with httpx.AsyncClient(timeout=10) as client:
        response=await client.post('https://api.tavily.com/search',json={'api_key':key,'query':q,'topic':'news','time_range':'week','max_results':8}); response.raise_for_status(); data=response.json()
    out=[]
    for result in data.get('results',[]):
        title=result.get('title',''); url=result.get('url','')
        cluster=hashlib.sha256(re.sub(r'\W+',' ',title.lower()).encode()).hexdigest()[:16]
        out.append(EvidenceIn(source_type='community',source_name=result.get('source') or 'Public web search',source_url=url,published_at=None,hazard_type='flood',location=settings['city'],normalized_claims=[title,result.get('content','')[:500]],source_reliability=.35,verification_status='unverified',duplicate_cluster_id=cluster))
    return out
