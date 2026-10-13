"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { User } from "@supabase/supabase-js";
import { ArrowUpRight, Bookmark, BriefcaseBusiness, CheckCircle2, Clock3, ExternalLink, MapPin, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

type Job = { id: string; title: string; company: string; location: string; url: string; source: string; score: number; note: string; description: string; published?: string };
type Status = "saved" | "applied" | "interview" | "rejected";
type TrackedRow = { job_id: string; status: Status };
const STORE = "jobpilot-tracker-v1";
const statuses: Status[] = ["saved", "applied", "interview", "rejected"];

function loadLocalTracking() {
  try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; }
}

function trackingFromRows(rows: TrackedRow[]) {
  return rows.reduce<Record<string, Status>>((result, row) => { result[row.job_id] = row.status; return result; }, {});
}

export default function JobPilotDashboard() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const supabaseConfigured = Boolean(supabase);
  const [jobs, setJobs] = useState<Job[]>([]), [tracking, setTracking] = useState<Record<string, Status>>({}), [user, setUser] = useState<User | null>(null), [query, setQuery] = useState(""), [tab, setTab] = useState("discover"), [busy, setBusy] = useState(false), [trackingBusy, setTrackingBusy] = useState(false), [error, setError] = useState(""), [updated, setUpdated] = useState(""), [checked, setChecked] = useState(0), [authOpen, setAuthOpen] = useState(false), [authMode, setAuthMode] = useState<"signin" | "signup">("signin"), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [authBusy, setAuthBusy] = useState(false), [authMessage, setAuthMessage] = useState("");

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!supabase) {
      setTracking(loadLocalTracking());
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data }) => { if (!active) return; setUser(data.session?.user ?? null); if (data.session?.user) void loadRemoteTracking(data.session.user.id); else setTracking(loadLocalTracking()); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); if (session?.user) void loadRemoteTracking(session.user.id); else setTracking(loadLocalTracking()); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [supabase]);

  async function loadRemoteTracking(userId: string) {
    if (!supabase) return;
    setTrackingBusy(true);
    const { data, error: loadError } = await supabase.from("tracked_applications").select("job_id,status").eq("user_id", userId);
    setTrackingBusy(false);
    if (loadError) { setError("Your account is signed in, but tracked jobs could not be loaded. Run the Supabase migration first."); return; }
    setTracking(trackingFromRows((data || []) as TrackedRow[]));
  }

  async function refresh() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/jobs", { cache: "no-store" });
      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();
      setJobs(data.jobs || []); setChecked(data.checked || 0); setUpdated(new Date(data.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      if (data.errors?.length) setError("Some sources were unavailable: " + data.errors.join(", "));
    } catch { setError("Could not load live jobs. Check your internet connection and try again."); } finally { setBusy(false); }
  }

  async function mark(id: string, status: Status | "remove") {
    const job = jobs.find((item) => item.id === id); if (!job) return;
    if (!supabase || !user) {
      setTracking((previous) => { const next = { ...previous }; if (status === "remove") delete next[id]; else next[id] = status; localStorage.setItem(STORE, JSON.stringify(next)); return next; });
      if (supabaseConfigured && !user) setError("Sign in to sync your tracked jobs across devices.");
      return;
    }
    const previous = tracking[id];
    setTracking((current) => { const next = { ...current }; if (status === "remove") delete next[id]; else next[id] = status; return next; });
    setTrackingBusy(true);
    const result = status === "remove"
      ? await supabase.from("tracked_applications").delete().eq("user_id", user.id).eq("job_id", id)
      : await supabase.from("tracked_applications").upsert({ user_id: user.id, job_id: job.id, title: job.title, company: job.company, location: job.location || null, url: job.url, source: job.source, status, job_published: job.published || null }, { onConflict: "user_id,job_id" });
    setTrackingBusy(false);
    if (result.error) { setTracking((current) => { const next = { ...current }; if (previous) next[id] = previous; else delete next[id]; return next; }); setError("Could not save that update. Check that the Supabase migration has been run."); }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return; setAuthBusy(true); setAuthMessage("");
    const result = authMode === "signin" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    setAuthBusy(false);
    if (result.error) { setAuthMessage(result.error.message); return; }
    if (authMode === "signup" && !result.data.session) { setAuthMessage("Account created. Check your email to confirm it, then sign in."); return; }
    setAuthMessage(""); setPassword(""); setAuthOpen(false);
  }

  async function signOut() { if (supabase) await supabase.auth.signOut(); setUser(null); setTracking({}); }
  const visible = useMemo(() => jobs.filter((job) => (tab === "discover" ? !tracking[job.id] : tab === "all" ? true : tracking[job.id] === tab)).filter((job) => (job.title + " " + job.company + " " + job.location).toLowerCase().includes(query.toLowerCase())), [jobs, tracking, query, tab]);
  const counts = { saved: Object.values(tracking).filter((status) => status === "saved").length, applied: Object.values(tracking).filter((status) => status === "applied").length, interview: Object.values(tracking).filter((status) => status === "interview").length };

  return <div className="shell"><aside className="sidebar"><div className="brand"><span className="brandicon"><BriefcaseBusiness size={21} /></span><span>jobpilot<span className="branddot">.</span></span></div><div className="sidecap">WORKSPACE</div><nav>{[["discover", "Discover jobs"], ["saved", "Saved jobs"], ["applied", "Applications"], ["interview", "Interviews"], ["all", "All jobs"]].map(([id, label]) => <button key={id} className={"navitem " + (tab === id ? "active" : "")} onClick={() => setTab(id)}><span>{id === "discover" ? <Search size={17} /> : id === "saved" ? <Bookmark size={17} /> : id === "interview" ? <CheckCircle2 size={17} /> : <BriefcaseBusiness size={17} />}</span>{label}{id === "saved" && counts.saved > 0 ? <small>{counts.saved}</small> : null}</button>)}</nav><div className="sidebottom"><div className="avatar">GO</div><div><strong>George Okochar</strong><small>Product Designer</small></div></div></aside>
    <main className="main"><header className="topbar"><span>Overview <span className="crumb">/ Job search</span></span><div className="account">{user ? <><span className="account-email">{user.email}</span><button className="account-button" onClick={signOut}>Sign out</button></> : supabaseConfigured ? <button className="account-button" onClick={() => { setAuthOpen(true); setAuthMessage(""); }}>Sign in to sync</button> : <span className="badge"><span className="pulse" /> Local tracking mode</span>}</div></header>
      <section className="content"><div className="eyebrow">YOUR CAREER, ON AUTOPILOT (ALMOST)</div><div className="headingrow"><div><h1>Find your next big thing<span className="purple">.</span></h1><p className="subtitle">Good opportunities, less endless scrolling. Made for your design career.</p></div><button className="refresh" onClick={refresh} disabled={busy}><RefreshCw size={16} className={busy ? "spin" : ""} />{busy ? "Searching..." : "Refresh jobs"}</button></div>
        {authOpen && !user ? <div className="authpanel"><div><div className="auth-title">{authMode === "signin" ? "Sign in to JobPilot" : "Create your JobPilot account"}</div><p className="auth-copy">Your tracked jobs will sync securely across devices.</p></div><button className="icon-button" aria-label="Close sign in" onClick={() => setAuthOpen(false)}><X size={17} /></button><form onSubmit={submitAuth}><input type="email" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} required /><input type="password" placeholder="Password (6+ characters)" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required /><button className="auth-submit" disabled={authBusy}>{authBusy ? "Working..." : authMode === "signin" ? "Sign in" : "Create account"}</button></form>{authMessage ? <p className="auth-message">{authMessage}</p> : null}<button className="auth-switch" onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setAuthMessage(""); }}>{authMode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}</button></div> : null}
        <div className="stats"><div className="stat"><div className="statlabel">Live matches <Search size={17} /></div><strong>{jobs.length}</strong><small>Across public job boards</small></div><div className="stat"><div className="statlabel">Saved for later <Bookmark size={17} /></div><strong>{counts.saved}</strong><small>Worth another look</small></div><div className="stat"><div className="statlabel">Applications <ArrowUpRight size={17} /></div><strong>{counts.applied}</strong><small>Marked as submitted</small></div><div className="stat"><div className="statlabel">Interviews <CheckCircle2 size={17} /></div><strong>{counts.interview}</strong><small>Keep the momentum</small></div></div>
        <div className="sectionhead"><div><h2>{tab === "discover" ? "Recommended for you" : tab === "all" ? "All matching jobs" : tab === "saved" ? "Your saved jobs" : tab === "applied" ? "Your applications" : "Your interviews"}</h2><p>Product design · UI/UX · Web design <span className="divider">·</span> Updated {updated || "when refreshed"}</p></div><span className="resultcount">{visible.length} results</span></div>
        <div className="filterbar"><div className="searchbox"><Search size={18} /><input placeholder="Search role, company, or location..." value={query} onChange={(event) => setQuery(event.target.value)} /></div><span className="filterhint"><SlidersHorizontal size={16} /> Relevance first</span></div>
        {error && <div className="notice">{error}</div>}
        <div className="joblist">{busy && jobs.length === 0 ? <div className="empty"><RefreshCw className="spin" size={26} /><h3>Finding opportunities...</h3><p>Checking public job boards.</p></div> : visible.length === 0 ? <div className="empty"><BriefcaseBusiness size={30} /><h3>No jobs here yet</h3><p>Try a different search or refresh the listings.</p></div> : visible.map((job) => <article className="job" key={job.id}><div className="companyicon">{job.company.slice(0, 1).toUpperCase()}</div><div className="jobbody"><div className="jobtop"><h3>{job.title}</h3><span className="score">{job.score}% match*</span></div><div className="company">{job.company} <span>·</span> {job.source}</div><div className="tags"><span><MapPin size={13} />{job.location || "Location unspecified"}</span><span><Clock3 size={13} />{job.published ? new Date(job.published).toLocaleDateString() : "Date unknown"}</span></div><p className="jobnote">{job.note} · Match score is a keyword estimate, not a hiring prediction.</p></div><div className="actions"><a href={job.url} target="_blank" rel="noopener noreferrer" className="apply">View job <ExternalLink size={14} /></a><select aria-label={"Track " + job.title} value={tracking[job.id] || ""} onChange={(event) => void mark(job.id, event.target.value ? event.target.value as Status : "remove")} disabled={trackingBusy}><option value="">Not tracked</option>{statuses.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></div></article>)}</div>
        <div className="footnote">{user ? "Your tracked jobs are synced to your Supabase account." : supabaseConfigured ? "Sign in to sync tracked jobs across devices. Until then, changes stay in this browser." : "Supabase is not configured, so tracking is stored in this browser only."} JobPilot finds public listings and does not submit applications, confirm eligibility, or access your Gmail. {checked > 0 ? `${checked} listings checked in the latest search.` : ""}</div>
      </section></main></div>;
}
