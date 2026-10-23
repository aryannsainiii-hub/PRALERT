from fastapi.testclient import TestClient
from app.main import app

def test_health():
    assert TestClient(app).get('/api/v1/health').json()['status']=='ok'
def test_settings_validation():
    assert TestClient(app).patch('/api/v1/settings',json={'rainfall_threshold_mm':-1}).status_code==422
def test_scenarios_are_explicit():
    assert len(TestClient(app).get('/api/v1/simulation/scenarios').json())==3
def test_simulation_step_provenance():
    c=TestClient(app); c.post('/api/v1/simulation/reset'); c.post('/api/v1/simulation/start',json={'scenario_id':'unconfirmed-rumor'})
    state=c.post('/api/v1/simulation/step').json()
    assert state['results'][0]['simulation_flag'] is True
    assert state['results'][0]['risk']['confidence']=='LOW'
def test_missing_weather_key_degrades_honestly():
    assert TestClient(app).get('/api/v1/weather/current').json()['observation'] is None
def test_evidence_validation():
    from pydantic import ValidationError
    from app.main import EvidenceIn
    try: EvidenceIn(source_type='community',source_name='x',source_reliability=1.5)
    except ValidationError: return
    assert False
from datetime import datetime, timezone, timedelta
from app.main import calculate_risk

def test_risk_suppresses_duplicate_cluster():
    ts=datetime.now(timezone.utc).isoformat()
    base={'source_type':'community','verification_status':'unverified','observed_at':ts,'measurement_values':{},'source_name':'Reporter A','source_reliability':.5,'duplicate_cluster_id':'same'}
    result=calculate_risk([{**base,'id':'a'},{**base,'id':'b','source_name':'Reporter B'}])
    assert result['evidence_ids']==['a']
    assert result['excluded'][0]['reason']=='duplicate cluster suppressed'

def test_risk_discards_stale_evidence():
    ts=(datetime.now(timezone.utc)-timedelta(days=2)).isoformat()
    result=calculate_risk([{'id':'old','source_type':'official','verification_status':'verified','observed_at':ts,'measurement_values':{},'source_name':'Feed'}])
    assert result['score']==0
    assert result['excluded'][0]['reason']=='stale evidence'

def test_missing_data_is_not_safe():
    result=calculate_risk([])
    assert result['score']==0
    assert result['stale_or_missing']
    assert 'not a safe condition' in result['stale_or_missing'][0]

def test_rainfall_threshold_adds_hazard_intensity():
    ts=datetime.now(timezone.utc).isoformat()
    result=calculate_risk([{'id':'rain','source_type':'weather','verification_status':'measured','observed_at':ts,'measurement_values':{'rainfall_1h_mm':60},'source_name':'Weather'}])
    assert result['components']['hazard_intensity']==3

def run_fixture(client,scenario_id):
    client.post('/api/v1/simulation/reset')
    client.post('/api/v1/simulation/start',json={'scenario_id':scenario_id,'speed':1})
    state=None
    count=next(x['event_count'] for x in client.get('/api/v1/simulation/scenarios').json() if x['id']==scenario_id)
    for _ in range(count): state=client.post('/api/v1/simulation/step').json()
    return state

def test_escalating_flood_scenario_outcome():
    from fastapi.testclient import TestClient
    state=run_fixture(TestClient(app),'escalating-flood')
    assert state['index']==5
    assert any(x['name']=='configured rainfall threshold represented' and x['passed'] for x in state['assertions'])
    assert state['results'][-1]['risk']['score']>=8

def test_rumor_scenario_remains_unconfirmed():
    from fastapi.testclient import TestClient
    state=run_fixture(TestClient(app),'unconfirmed-rumor')
    assert state['results'][0]['risk']['confidence']=='LOW'
    assert state['results'][0]['incident'] is None
    assert any(x['name']=='unsupported rumor stays unconfirmed' and x['passed'] for x in state['assertions'])

def test_stale_conflict_does_not_create_incident():
    from fastapi.testclient import TestClient
    state=run_fixture(TestClient(app),'stale-conflict')
    assert state['results'][0]['risk']['score']==0
    assert any(x['name']=='stale warning discounted' and x['passed'] for x in state['assertions'])
