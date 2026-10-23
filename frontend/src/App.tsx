import { navigationItems } from "./navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  ChevronDown,
  CloudRain,
  Compass,
  Database,
  FlaskConical,
  Layers,
  MapPin,
  Radio,
  RefreshCw,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Wifi,
  WifiOff,
  Wind,
  Zap,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Search,
  Menu,
  Pause,
  Play,
  StepForward,
  RotateCcw,
} from "lucide-react";
const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";
async function req(path: string, init?: RequestInit) {
  const r = await fetch(API + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!r.ok)
    throw new Error((await r.json()).detail || `Request failed ${r.status}`);
  return r.json();
}

type Item = {
  id: string;
  latitude?: number;
  longitude?: number;
  verification_status?: string;
  title?: string;
  name?: string;
  severity?: string;
  status?: string;
  location?: string;
  risk_score?: number;
  confidence?: string;
  source_type?: string;
  source_name?: string;
  normalized_claims?: string[];
  created_at?: string;
  simulation_flag?: boolean;
  message?: string;
  state?: string;
};
function App() {
  const [page, setPage] = useState(location.pathname),
    [showScope, setShowScope] = useState(true),
    [selected, setSelected] = useState<Item | null>(null),
    [menu, setMenu] = useState(false),
    [toast, setToast] = useState("");
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["status"],
    queryFn: () => req("/status"),
  });
  const stats = useQuery({
    queryKey: ["overview"],
    queryFn: () => req("/analytics/overview"),
  });
  const incidents = useQuery<Item[]>({
    queryKey: ["incidents"],
    queryFn: () => req("/incidents"),
  });
  const evidence = useQuery<Item[]>({
    queryKey: ["evidence"],
    queryFn: () => req("/evidence"),
  });
  const agents = useQuery<Item[]>({
    queryKey: ["agents"],
    queryFn: () => req("/agents"),
  });
  const sim = useQuery<any>({
    queryKey: ["sim"],
    queryFn: () => req("/simulation/status"),
  });
  const scenarios = useQuery<any[]>({
    queryKey: ["scenarios"],
    queryFn: () => req("/simulation/scenarios"),
  });
  useEffect(() => {
    const onpop = () => setPage(location.pathname);
    window.addEventListener("popstate", onpop);
    return () => window.removeEventListener("popstate", onpop);
  }, []);
  useEffect(() => {
    if (!sim.data?.running) return;
    const timer = window.setTimeout(
      async () => {
        try {
          await req("/simulation/step", { method: "POST" });
          await Promise.all([
            qc.invalidateQueries({ queryKey: ["sim"] }),
            qc.invalidateQueries({ queryKey: ["incidents"] }),
            qc.invalidateQueries({ queryKey: ["evidence"] }),
            qc.invalidateQueries({ queryKey: ["overview"] }),
          ]);
        } catch (e) {
          notify(e instanceof Error ? e.message : "Playback failed");
        }
      },
      Math.max(180, 1000 / (sim.data.speed || 1)),
    );
    return () => window.clearTimeout(timer);
  }, [sim.data?.running, sim.data?.index, sim.data?.speed, qc]);
  function navigate(path: string) {
    history.pushState({}, "", path);
    setPage(path);
    setMenu(false);
  }
  function notify(s: string) {
    setToast(s);
    setTimeout(() => setToast(""), 3200);
  }
  async function act(path: string, body?: unknown) {
    try {
      const result = await req(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      if (result?.success === false) {
        notify(result.message || "Provider test failed");
        return;
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["sim"] }),
        qc.invalidateQueries({ queryKey: ["incidents"] }),
        qc.invalidateQueries({ queryKey: ["evidence"] }),
        qc.invalidateQueries({ queryKey: ["overview"] }),
      ]);
      notify("Update saved · backend confirmed");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Action failed");
    }
  }
  const current =
    navigationItems.find((n) => n[1] === page)?.[0] || "Command Center";
  const isSim = status.data?.mode === "simulation";
  return (
    <div className="app">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-icon">
            <ShieldAlert size={22} />
          </div>
          <div>
            <b>PRALERT</b>
            <small>INTELLIGENCE SYSTEMS</small>
          </div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <button className="workspace">
          <span className="city-dot" />
          <span>
            {status.data?.city || "Connecting…"}
            <small>Urban flood monitor</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="nav-label">OPERATIONS</div>
        <nav>
          {navigationItems.map(([label, path, icon], idx) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`nav-item ${page === path ? "active" : ""}`}
            >
              <span className="nav-ico">
                {idx === 0 ? (
                  <Layers size={17} />
                ) : idx === 1 ? (
                  <ShieldAlert size={17} />
                ) : idx === 2 ? (
                  <Database size={17} />
                ) : idx === 3 ? (
                  <Activity size={17} />
                ) : idx === 4 ? (
                  <FlaskConical size={17} />
                ) : idx === 5 ? (
                  <Compass size={17} />
                ) : (
                  <SlidersHorizontal size={17} />
                )}
              </span>
              {label}
              {idx === 1 && incidents.data?.length ? (
                <span className="nav-count">{incidents.data.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mini-label">SYSTEM STATUS</div>
          <div className="system-card">
            <span className="live-dot" />
            <div>
              <b>
                {status.data?.connected ? "Backend connected" : "Connecting"}
              </b>
              <small>
                {isSim ? "Simulation environment" : "Live environment"}
              </small>
            </div>
            <Wifi size={15} />
          </div>
          <div className="user-row">
            <div className="avatar">OC</div>
            <div>
              <b>Operations Console</b>
              <small>Local workspace</small>
            </div>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="top-left">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={19} />
            </button>
            <span className="breadcrumb">Operations</span>
            <span className="slash">/</span>
            <b>{current}</b>
          </div>
          <div className="top-right">
            <div className={`mode-pill ${isSim ? "sim" : ""}`}>
              <span className="live-dot" />
              {isSim ? "SIMULATION MODE" : "LIVE MODE"}
            </div>
            <div className="connection">
              <span
                className={`conn-dot ${status.data?.connected ? "" : "off"}`}
              />
              {status.data?.connected ? "API connected" : "API offline"}
            </div>
            <span className="top-divider" />
            <button
              className="icon-button"
              title="Refresh data"
              onClick={() => qc.invalidateQueries()}
            >
              <RefreshCw size={16} />
            </button>
            <button className="icon-button notification" title="Activity">
              <Bell size={17} />
              <i />
            </button>
            <div className="avatar small-avatar">OC</div>
          </div>
        </header>
        <section className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" />
                NATIONAL CAPITAL REGION <span className="eyebrow-sep">
                  /
                </span>{" "}
                FLOOD INTELLIGENCE
              </div>
              <h1>{current}</h1>
              <p className="subtitle">
                {page === "/"
                  ? "Unified situational awareness for monitored flood conditions."
                  : page === "/simulation"
                    ? "Rehearse incident evolution with deterministic, auditable scenarios."
                    : page === "/incidents"
                      ? "Review, acknowledge, and manage correlated incidents."
                      : page === "/evidence"
                        ? "Inspect normalized source records and their provenance."
                        : page === "/agents"
                          ? "Monitor collection health and coordinator execution."
                          : page === "/analytics"
                            ? "Operational performance and scenario evaluation."
                            : "Configure monitoring behavior and provider connections."}
              </p>
            </div>
            <div className="heading-actions">
              <div className="updated">
                <Clock3 size={14} />
                <span>Refreshes every 5 seconds</span>
              </div>
              <button
                className="primary-button"
                onClick={() => navigate("/simulation")}
              >
                <Zap size={15} /> Open simulation lab
              </button>
            </div>
          </div>
          {status.isError ? (
            <div className="error-banner">
              <WifiOff size={18} />
              <div>
                <b>Backend unavailable</b>
                <span>
                  Start the FastAPI service at localhost:8000. Data shown here
                  will remain empty until it connects.
                </span>
              </div>
            </div>
          ) : null}
          {page === "/" ? (
            <>
              <div className="metrics">
                <Metric
                  label="ACTIVE INCIDENTS"
                  value={stats.data?.active_incidents ?? "—"}
                  icon={<ShieldAlert />}
                  tone="red"
                  note="Across monitored area"
                />
                <Metric
                  label="HIGHEST RISK"
                  value={stats.data?.highest_risk ?? "—"}
                  icon={<Activity />}
                  tone="amber"
                  note={
                    stats.data?.highest_risk
                      ? `Risk score · / 10`
                      : "Awaiting evidence"
                  }
                />
                <Metric
                  label="SOURCES READY"
                  value={`${stats.data?.sources_configured ?? 0} / 3`}
                  icon={<Radio />}
                  tone="teal"
                  note="Provider configuration"
                />
                <Metric
                  label="EVIDENCE RECORDS"
                  value={stats.data?.evidence_count ?? "—"}
                  icon={<Database />}
                  tone="blue"
                  note={`${stats.data?.simulation_count ?? 0} synthetic records`}
                />
              </div>
              <div className="workspace-grid">
                <section className="panel map-panel">
                  <div className="panel-head">
                    <div>
                      <div className="panel-kicker">GEOINT / 01</div>
                      <h2>Situational map</h2>
                    </div>
                    <div className="map-actions">
                      <span className="map-location">
                        <MapPin size={14} />
                        {status.data?.city || "Delhi NCR"}
                      </span>
                      <button
                        className="filter-button"
                        onClick={() => setShowScope(!showScope)}
                        aria-pressed={showScope}
                      >
                        <SlidersHorizontal size={14} />{" "}
                        {showScope ? "Scope on" : "Scope off"}
                      </button>
                    </div>
                  </div>
                  <MapView
                    incidents={incidents.data || []}
                    onSelect={setSelected}
                    showScope={showScope}
                  />
                  <div className="map-footer">
                    <div className="legend">
                      <span>
                        <i className="legend-dot low" />
                        Low
                      </span>
                      <span>
                        <i className="legend-dot elevated" />
                        Elevated
                      </span>
                      <span>
                        <i className="legend-dot critical" />
                        Critical
                      </span>
                      <span>
                        <i className="legend-ring" />
                        Monitored area
                      </span>
                    </div>
                    <div className="map-scale">
                      © OpenStreetMap contributors
                    </div>
                  </div>
                </section>
                <aside className="panel agent-panel">
                  <div className="panel-head">
                    <div>
                      <div className="panel-kicker">AUTONOMOUS SYSTEMS</div>
                      <h2>Agent health</h2>
                    </div>
                    <button
                      className="text-action"
                      onClick={() => navigate("/agents")}
                    >
                      View all <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <div className="agent-list">
                    {(agents.data || []).map((a) => (
                      <AgentRow key={a.id} a={a} />
                    ))}
                  </div>
                  <div className="agent-foot">
                    <span>
                      <i className="agent-foot-dot" />
                      Deterministic coordinator active
                    </span>
                    <span>04 / 04</span>
                  </div>
                </aside>
              </div>
              <div className="lower-grid">
                <section className="panel incidents-panel">
                  <div className="panel-head">
                    <div>
                      <div className="panel-kicker">CORRELATED SIGNALS</div>
                      <h2>
                        Active incidents{" "}
                        <span className="sub-count">
                          {incidents.data?.length || 0}
                        </span>
                      </h2>
                    </div>
                    <button
                      className="text-action"
                      onClick={() => navigate("/incidents")}
                    >
                      Incident intelligence <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {incidents.isLoading ? (
                    <div className="loading">Loading incidents…</div>
                  ) : incidents.data?.length ? (
                    <div className="incident-list">
                      {incidents.data
                        .filter((i) => i.status !== "RESOLVED")
                        .slice(0, 4)
                        .map((i) => (
                          <IncidentRow
                            key={i.id}
                            i={i}
                            onClick={() => setSelected(i)}
                          />
                        ))}
                    </div>
                  ) : (
                    <Empty
                      icon={<Shield />}
                      title="No active incidents"
                      text="New correlated incidents will appear as evidence is processed."
                    />
                  )}
                </section>
                <section className="panel activity-panel">
                  <div className="panel-head">
                    <div>
                      <div className="panel-kicker">SYSTEM LOG</div>
                      <h2>Recent activity</h2>
                    </div>
                    <span className="activity-live">
                      <i />
                      UPDATING
                    </span>
                  </div>
                  {evidence.data?.length ? (
                    <div className="activity-list">
                      {evidence.data.slice(0, 5).map((e, idx) => (
                        <div className="activity-row" key={e.id}>
                          <div className={`activity-icon ${e.source_type}`}>
                            <Activity size={14} />
                          </div>
                          <div className="activity-copy">
                            <b>
                              {e.source_name || e.source_type}{" "}
                              <span>
                                {e.simulation_flag ? "· SYNTHETIC" : ""}
                              </span>
                            </b>
                            <small>
                              {e.normalized_claims?.[0] || "Evidence received"}
                            </small>
                          </div>
                          <time>{idx === 0 ? "now" : `${idx * 3}m`}</time>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      icon={<Clock3 />}
                      title="Awaiting activity"
                      text="Evidence and risk changes are recorded here."
                    />
                  )}
                </section>
              </div>
            </>
          ) : page === "/incidents" ? (
            <IncidentsPage
              data={incidents.data || []}
              onSelect={setSelected}
              onAction={act}
            />
          ) : page === "/evidence" ? (
            <EvidencePage data={evidence.data || []} onSelect={setSelected} />
          ) : page === "/agents" ? (
            <AgentsPage agents={agents.data || []} onAction={act} />
          ) : page === "/simulation" ? (
            <SimulationPage
              sim={sim.data}
              scenarios={scenarios.data || []}
              onAction={act}
            />
          ) : page === "/analytics" ? (
            <AnalyticsPage stats={stats.data} sim={sim.data} />
          ) : (
            <SettingsPage onAction={act} />
          )}
        </section>
      </main>
      {selected ? (
        <div className="drawer-scrim" onClick={() => setSelected(null)}>
          <aside className="detail-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <div className="panel-kicker">RECORD DETAIL</div>
                <h2>
                  {selected.title ||
                    selected.name ||
                    selected.source_name ||
                    selected.source_type}
                </h2>
              </div>
              <button className="icon-button" onClick={() => setSelected(null)}>
                ×
              </button>
            </div>
            <div className="drawer-body">
              <Detail item={selected} />
            </div>
            <button className="drawer-close" onClick={() => setSelected(null)}>
              Close details
            </button>
          </aside>
        </div>
      ) : null}
      {toast ? (
        <div className="toast">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      ) : null}
    </div>
  );
}
function Metric({ label, value, icon, tone, note }: any) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{label}</span>
        <i className={`metric-icon ${tone}`}>{icon}</i>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">
        <span className="metric-note-dot" />
        {note}
      </div>
    </div>
  );
}
function Empty({ icon, title, text }: any) {
  return (
    <div className="empty">
      <span>{icon}</span>
      <b>{title}</b>
      <small>{text}</small>
    </div>
  );
}
function AgentRow({ a }: any) {
  const color = a.state === "operational" ? "ok" : "wait";
  return (
    <div className="agent-row">
      <div className={`agent-glyph ${a.id}`}>
        <AgentIcon id={a.id} />
      </div>
      <div className="agent-info">
        <b>{a.name}</b>
        <small>{a.message}</small>
      </div>
      <span className={`state-pill ${color}`}>
        <i />
        {a.state === "operational" ? "READY" : "CONFIG"}
      </span>
    </div>
  );
}
function AgentIcon({ id }: any) {
  return id === "weather_sentinel" ? (
    <CloudRain size={17} />
  ) : id === "official_alert_monitor" ? (
    <Radio size={17} />
  ) : id === "community_signal_analyst" ? (
    <Search size={17} />
  ) : (
    <ShieldAlert size={17} />
  );
}
function IncidentRow({ i, onClick }: any) {
  return (
    <button className="incident-row" onClick={onClick}>
      <span className={`severity-mark ${(i.severity || "").toLowerCase()}`} />
      <span className="incident-main">
        <b>{i.title}</b>
        <small>
          <MapPin size={12} />
          {i.location} <span>·</span> {i.status}
        </small>
      </span>
      <span className="incident-risk">
        <b>{i.risk_score}</b>
        <small>RISK</small>
      </span>
      <span className="conf-chip">{i.confidence} confidence</span>
      <ArrowUpRight className="row-arrow" size={15} />
    </button>
  );
}
function MapView({ incidents, onSelect, showScope }: any) {
  return (
    <div className="map-wrap leaflet-wrap">
      <MapContainer
        center={[28.6139, 77.209]}
        zoom={10}
        zoomControl={false}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomControl position="bottomright" />
        {showScope ? (
          <Circle
            center={[28.6139, 77.209]}
            radius={25000}
            pathOptions={{
              color: "#43e0c1",
              fillColor: "#43e0c1",
              fillOpacity: 0.035,
              weight: 1,
              dashArray: "5 7",
            }}
          />
        ) : null}
        <Marker position={[28.6139, 77.209]}>
          <Popup>Delhi NCR monitoring center � configured area</Popup>
        </Marker>
        {incidents
          .filter((x: Item) => x.latitude && x.longitude)
          .map((x: Item) => (
            <Marker
              key={x.id}
              position={[Number(x.latitude), Number(x.longitude)]}
              eventHandlers={{ click: () => onSelect(x) }}
            >
              <Popup>
                {x.title} � {x.severity}
              </Popup>
            </Marker>
          ))}
      </MapContainer>
      <div className="map-attribution">
        OPENSTREETMAP � 25 KM MONITORING SCOPE
      </div>
    </div>
  );
}
function IncidentsPage({ data, onSelect, onAction }: any) {
  const [q, setQ] = useState(""),
    [filter, setFilter] = useState("ALL");
  const filtered = data.filter(
    (x: Item) =>
      (filter === "ALL" || x.severity === filter) &&
      (x.title || "").toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="page-layout">
      <div className="toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            placeholder="Search incidents"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option>ALL</option>
          {["CRITICAL", "HIGH", "ELEVATED", "GUARDED", "LOW"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      <div className="panel table-panel">
        <div className="panel-head">
          <div>
            <div className="panel-kicker">INCIDENT REGISTER</div>
            <h2>{filtered.length} correlated records</h2>
          </div>
        </div>
        {filtered.length ? (
          filtered.map((i: Item) => (
            <IncidentRow key={i.id} i={i} onClick={() => onSelect(i)} />
          ))
        ) : (
          <Empty
            icon={<Shield />}
            title="No incidents match"
            text="Try a different search or run a scenario in Simulation Lab."
          />
        )}
      </div>
      <p className="safety-note">
        <Shield size={14} />
        PRALERT is a decision-support prototype, not an official emergency
        authority.
      </p>
    </div>
  );
}
function EvidencePage({ data, onSelect }: any) {
  const [filter, setFilter] = useState("ALL"),
    [q, setQ] = useState("");
  const list = data.filter(
    (e: Item) =>
      (filter === "ALL" || e.source_type === filter) &&
      JSON.stringify(e).toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="page-layout">
      <div className="toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            placeholder="Search claims, sources, locations"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option>ALL</option>
          {["weather", "official", "community"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      <div className="evidence-grid">
        {list.map((e: Item) => (
          <button
            className="panel evidence-card"
            key={e.id}
            onClick={() => onSelect(e)}
          >
            <div className="evidence-card-head">
              <span className={`evidence-type ${e.source_type}`}>
                {e.source_type}
              </span>
              {e.simulation_flag ? (
                <span className="synthetic-tag">SYNTHETIC</span>
              ) : null}
            </div>
            <h3>{e.normalized_claims?.[0] || "Evidence record"}</h3>
            <div className="evidence-meta">
              <span>{e.source_name}</span>
              <time>
                {e.created_at ? new Date(e.created_at).toLocaleString() : ""}
              </time>
            </div>
            <div className="evidence-card-foot">
              <span>
                <MapPin size={13} />
                {e.location}
              </span>
              <span className="verify-tag">{e.verification_status}</span>
              <ArrowUpRight size={14} />
            </div>
          </button>
        ))}
        {!list.length ? (
          <div className="panel span-all">
            <Empty
              icon={<Database />}
              title="No evidence yet"
              text="Run a simulation or configure a source to begin collecting evidence."
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
function AgentsPage({ agents, onAction }: any) {
  return (
    <div className="agents-page">
      <div className="agent-large-grid">
        {agents.map((a: Item) => (
          <div className="panel agent-detail" key={a.id}>
            <AgentRow a={a} />
            <div className="agent-detail-body">
              <div className="detail-label">LATEST OUTPUT</div>
              <p>{a.message}</p>
              <div className="agent-data-line">
                <span>Last successful run</span>
                <b>Not yet run</b>
              </div>
              <div className="agent-data-line">
                <span>Provider state</span>
                <b>
                  {a.state === "operational"
                    ? "Available"
                    : "Awaiting configuration"}
                </b>
              </div>
              <button
                className="secondary-button"
                onClick={() => onAction(`/agents/${a.id}/run`)}
              >
                Run collection now <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="panel trace-panel">
        <div className="panel-head">
          <div>
            <div className="panel-kicker">PROCESS TRACE</div>
            <h2>Evidence-to-advisory workflow</h2>
          </div>
        </div>
        <div className="trace-steps">
          {[
            "Collect",
            "Normalize",
            "Correlate",
            "Score",
            "Coordinate",
            "Advise",
          ].map((s, i) => (
            <div key={s}>
              <span>{`0${i + 1}`}</span>
              <b>{s}</b>
              {i < 5 ? <i /> : null}
            </div>
          ))}
        </div>
        <p className="muted">
          Coordinator decisions use deterministic policy and risk calculations.
          No private model reasoning is exposed.
        </p>
      </div>
    </div>
  );
}
function SimulationPage({ sim, scenarios, onAction }: any) {
  const [id, setId] = useState("escalating-flood");
  const [speed, setSpeed] = useState(1);
  return (
    <div className="simulation-layout">
      <div className="simulation-banner">
        <div className="sim-icon">
          <FlaskConical size={22} />
        </div>
        <div>
          <b>Deterministic scenario environment</b>
          <p>
            All injected records are labeled SYNTHETIC / SIMULATION and persist
            in the local database.
          </p>
        </div>
        <span className="synthetic-tag large">SYNTHETIC DATA</span>
      </div>
      <div className="simulation-grid">
        <div className="panel scenario-panel">
          <div className="panel-head">
            <div>
              <div className="panel-kicker">SCENARIO SELECT</div>
              <h2>Choose a scenario</h2>
            </div>
          </div>
          <div className="scenario-list">
            {scenarios.map((s: any) => (
              <button
                key={s.id}
                className={`scenario-option ${id === s.id ? "selected" : ""}`}
                onClick={() => setId(s.id)}
              >
                <span className="scenario-radio" />
                <span>
                  <b>{s.name}</b>
                  <small>{s.description}</small>
                </span>
                <span className="event-count">{s.event_count} EVENTS</span>
              </button>
            ))}
          </div>
          <div className="speed-row">
            <label>Playback speed</label>
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
          </div>
          <div className="sim-controls">
            <button
              className="primary-button"
              onClick={() =>
                onAction("/simulation/start", { scenario_id: id, speed })
              }
            >
              <Play size={15} />
              Start scenario
            </button>
            <button
              className="secondary-button"
              onClick={() => onAction("/simulation/step")}
            >
              <StepForward size={15} />
              Step
            </button>
            <button
              className="icon-button bordered"
              onClick={() => onAction("/simulation/pause")}
              title="Pause"
            >
              <Pause size={15} />
            </button>
            <button
              className="icon-button bordered"
              onClick={() => onAction("/simulation/reset")}
              title="Reset"
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </div>
        <div className="panel playback-panel">
          <div className="panel-head">
            <div>
              <div className="panel-kicker">RUN STATE</div>
              <h2>{sim?.scenario || "Ready to simulate"}</h2>
            </div>
            <span className={`state-pill ${sim?.running ? "ok" : "wait"}`}>
              <i />
              {sim?.running ? "RUNNING" : "PAUSED"}
            </span>
          </div>
          <div className="progress-block">
            <div className="progress-label">
              <span>Scenario progress</span>
              <b>
                {sim?.index || 0} / {sim?.event_count || 0} events
              </b>
            </div>
            <div className="progress-track">
              <i
                style={{
                  width: `${sim?.event_count ? (100 * sim.index) / sim.event_count : 0}%`,
                }}
              />
            </div>
          </div>
          <div className="event-stream">
            {(sim?.results || []).map((r: any, index: number) => (
              <div className="stream-row" key={r.evidence_id}>
                <span className="stream-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="stream-dot" />
                <div>
                  <b>{r.event.type.toUpperCase()} EVENT</b>
                  <small>
                    {r.event.payload.claim || r.event.payload.claims?.[0]}
                  </small>
                  <small className="stream-score">
                    Risk {r.risk.score}/10 · {r.risk.severity} ·{" "}
                    {r.risk.confidence} confidence
                  </small>
                </div>
                <span className="synthetic-tag">SIM</span>
              </div>
            ))}
            {!sim?.results?.length ? (
              <Empty
                icon={<Clock3 />}
                title="Timeline ready"
                text="Start or step through a deterministic scenario."
              />
            ) : null}
          </div>
        </div>
      </div>
      <div className="panel assertion-panel">
        <div className="panel-head">
          <div>
            <div className="panel-kicker">AUTOMATED EVALUATION</div>
            <h2>Observed behavior checks</h2>
          </div>
          <span className="synthetic-tag">SCENARIO ASSERTIONS</span>
        </div>
        {(sim?.assertions || []).length ? (
          <div className="assertions">
            {sim.assertions.map((x: any) => (
              <span key={x.name} className={x.passed ? "pass" : "fail"}>
                <CheckCircle2 size={15} />
                {x.name}
              </span>
            ))}
          </div>
        ) : (
          <div className="assertions muted">
            Assertions appear as scenario events are processed.
          </div>
        )}
      </div>
    </div>
  );
}
function AnalyticsPage({ stats, sim }: any) {
  return (
    <div className="analytics-grid">
      <div className="panel analytics-card">
        <div className="panel-kicker">CURRENT SNAPSHOT</div>
        <h2>Evidence and incident volume</h2>
        <div className="bar-chart">
          {[
            { l: "Incidents", v: stats?.active_incidents || 0, c: "red" },
            { l: "Evidence", v: stats?.evidence_count || 0, c: "teal" },
            { l: "Synthetic", v: stats?.simulation_count || 0, c: "blue" },
          ].map((x) => (
            <div key={x.l}>
              <span>{x.l}</span>
              <i>
                <b
                  className={x.c}
                  style={{
                    width: `${Math.min(100, Math.max(x.v ? 12 : 0, x.v * 14))}%`,
                  }}
                />
              </i>
              <strong>{x.v}</strong>
            </div>
          ))}
        </div>
        <small className="muted">
          Counts reflect persisted records, not fabricated historical series.
        </small>
      </div>
      <div className="panel analytics-card">
        <div className="panel-kicker">SCENARIO EVALUATION</div>
        <h2>Last scenario checks</h2>
        {sim?.assertions?.length ? (
          <div className="assertions">
            {sim.assertions.map((a: any) => (
              <span className={a.passed ? "pass" : "fail"} key={a.name}>
                <CheckCircle2 size={15} />
                {a.name}
              </span>
            ))}
          </div>
        ) : (
          <Empty
            icon={<Activity />}
            title="No evaluation run"
            text="Run a simulation to produce deterministic checks."
          />
        )}
      </div>
    </div>
  );
}
function SettingsPage({ onAction }: any) {
  const [s, setS] = useState<any>(null),
    [integrations, setIntegrations] = useState<any[]>([]),
    [message, setMessage] = useState("");
  useEffect(() => {
    req("/settings")
      .then(setS)
      .catch(() => {});
    req("/integrations")
      .then(setIntegrations)
      .catch(() => {});
  }, []);
  async function save() {
    try {
      const v = await req("/settings", {
        method: "PATCH",
        body: JSON.stringify(s),
      });
      setS(v);
      setMessage("Settings saved by backend.");
    } catch {
      setMessage("Unable to save settings.");
    }
  }
  return (
    <div className="settings-layout">
      <div className="panel settings-panel">
        <div className="panel-head">
          <div>
            <div className="panel-kicker">MONITORING CONFIGURATION</div>
            <h2>Area and thresholds</h2>
          </div>
        </div>
        {s ? (
          <div className="settings-form">
            <label>
              Monitored city
              <input
                value={s.city}
                onChange={(e) => setS({ ...s, city: e.target.value })}
              />
            </label>
            <label>
              Geographic scope (km)
              <input
                type="number"
                value={s.scope_km}
                onChange={(e) =>
                  setS({ ...s, scope_km: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Rainfall threshold (mm)
              <input
                type="number"
                value={s.rainfall_threshold_mm}
                onChange={(e) =>
                  setS({ ...s, rainfall_threshold_mm: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Wind threshold (km/h)
              <input
                type="number"
                value={s.wind_threshold_kmh}
                onChange={(e) =>
                  setS({ ...s, wind_threshold_kmh: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Polling interval (minutes)
              <input
                type="number"
                value={s.polling_minutes}
                onChange={(e) =>
                  setS({ ...s, polling_minutes: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Official RSS/Atom feeds (one URL per line)
              <textarea
                rows={3}
                value={(s.official_feed_urls || []).join("\n")}
                onChange={(e) =>
                  setS({
                    ...s,
                    official_feed_urls: e.target.value
                      .split("\n")
                      .map((x: string) => x.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <label>
              Community discovery query
              <input
                value={s.community_query || ""}
                onChange={(e) =>
                  setS({ ...s, community_query: e.target.value })
                }
              />
            </label>
            <label>
              Data mode
              <select
                value={s.mode}
                onChange={(e) => setS({ ...s, mode: e.target.value })}
              >
                <option value="simulation">Simulation</option>
                <option value="live">Live integrations</option>
              </select>
            </label>
            <div className="settings-save">
              <button className="primary-button" onClick={save}>
                Save configuration
              </button>
              <span>{message}</span>
            </div>
          </div>
        ) : (
          <div className="loading">Loading configuration…</div>
        )}
      </div>
      <div className="panel settings-panel">
        <div className="panel-head">
          <div>
            <div className="panel-kicker">PROVIDER HEALTH</div>
            <h2>Integrations</h2>
          </div>
        </div>
        <div className="integrations">
          {integrations.map((i) => (
            <div className="integration-row" key={i.name}>
              <span className="integration-glyph">
                <Radio size={17} />
              </span>
              <span>
                <b>{i.name}</b>
                <small>{i.status}</small>
              </span>
              <span className={`state-pill ${i.configured ? "ok" : "wait"}`}>
                <i />
                {i.configured ? "READY" : "NOT SET"}
              </span>
              <button
                className="text-action"
                onClick={() => onAction(`/integrations/${i.name}/test`)}
              >
                Test
              </button>
            </div>
          ))}
        </div>
        <p className="safety-note">
          <Shield size={14} />
          Secrets stay server-side. No keys are exposed to this browser.
        </p>
      </div>
    </div>
  );
}
export default App;
function Detail({ item }: any) {
  return (
    <>
      <div className="detail-badges">
        <span className="synthetic-tag">
          {item.simulation_flag
            ? "SYNTHETIC · SIMULATION"
            : item.source_type || item.status}
        </span>
        {item.severity ? (
          <span className="severity-tag">{item.severity}</span>
        ) : null}
      </div>
      <div className="detail-field">
        <label>Record identifier</label>
        <code>{item.id}</code>
      </div>
      <div className="detail-field">
        <label>Location</label>
        <b>{item.location || "Not specified"}</b>
      </div>
      <div className="detail-field">
        <label>Status / verification</label>
        <b>{item.status || item.verification_status || "Unverified"}</b>
      </div>
      {item.risk ? (
        <div className="detail-field">
          <label>Risk explanation · {item.risk.score}/10</label>
          <b>{item.risk.change_reason}</b>
          <pre>{JSON.stringify(item.risk.components, null, 2)}</pre>
        </div>
      ) : null}
      <div className="detail-field">
        <label>Evidence claims</label>
        {(item.normalized_claims || []).map((x: string) => (
          <p key={x}>{x}</p>
        ))}
      </div>
      <div className="detail-field">
        <label>Confidence</label>
        <b>{item.confidence || "Not assessed"}</b>
      </div>
      <div className="detail-field">
        <label>Created / updated</label>
        <b>{item.created_at || item.updated_at || "—"}</b>
      </div>
      {item.source_url ? (
        <a
          href={item.source_url}
          target="_blank"
          rel="noreferrer"
          className="source-link"
        >
          <ExternalLink size={14} />
          Open original source
        </a>
      ) : null}
      {item.status && item.id ? (
        <div className="detail-buttons">
          <button
            className="secondary-button"
            onClick={() =>
              req(`/incidents/${item.id}/acknowledge`, { method: "POST" })
            }
          >
            Acknowledge
          </button>
          <button
            className="secondary-button"
            onClick={() =>
              req(`/incidents/${item.id}/resolve`, { method: "POST" })
            }
          >
            Resolve
          </button>
          <button
            className="secondary-button"
            onClick={() =>
              req(`/incidents/${item.id}/reopen`, { method: "POST" })
            }
          >
            Reopen
          </button>
        </div>
      ) : null}
      <p className="safety-note">
        <Shield size={14} />
        Decision-support information only. Follow verified official
        instructions.
      </p>
    </>
  );
}
import "leaflet/dist/leaflet.css";
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  Popup,
  ZoomControl,
} from "react-leaflet";
