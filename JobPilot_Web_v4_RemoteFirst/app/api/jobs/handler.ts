import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  source: string;
  published?: string;
  score: number;
  note: string;
  remote: boolean;
};

type RawJob = Omit<Job, "score" | "note" | "remote">;

const targetRoles = [
  "product designer", "ux designer", "ui designer", "ui/ux", "ui ux",
  "web designer", "product design", "visual designer", "interaction designer",
  "experience designer", "design intern", "ux researcher", "user researcher",
];
const excludedTitles = ["senior", "staff", "principal", "director", "head of", "vp of", "vice president", "lead designer"];
const skillKeywords = ["figma", "prototype", "research", "design system", "interface", "react", "user experience", "usability", "wireframe", "design thinking"];
const nigeriaSignals = ["nigeria", "africa", "emea"];

function clean(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&[a-z0-9#]+;/gi, " ").replace(/\s+/g, " ").trim();
}

function asDate(value: unknown) {
  if (!value) return undefined;
  const date = typeof value === "number" ? new Date(value < 10_000_000_000 ? value * 1000 : value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function score(raw: RawJob): Job | null {
  const title = raw.title.toLowerCase();
  const description = raw.description.toLowerCase();
  const location = raw.location.toLowerCase();
  const body = `${title} ${description}`;
  if (!targetRoles.some((role) => title.includes(role))) return null;
  if (excludedTitles.some((term) => title.includes(term))) return null;

  const restricted = /(us only|usa only|united states only|canada only|uk only|must be based in the us|not available in africa)/i.test(`${location} ${description.slice(0, 1800)}`);
  if (restricted) return null;

  const remote = /remote|worldwide|anywhere|global/.test(`${location} ${description.slice(0, 900)}`);
  const nigeria = nigeriaSignals.some((term) => body.includes(term));
  const matchedSkills = skillKeywords.filter((skill) => body.includes(skill));
  const rolePoints = title.includes("product") ? 14 : 10;
  const entryLevelPoints = /junior|entry|intern|graduate|associate/.test(title) ? 8 : 0;
  const scoreValue = Math.min(98, 42 + rolePoints + entryLevelPoints + matchedSkills.length * 3 + (remote ? 10 : 0) + (nigeria ? 10 : 0));
  const note = nigeria ? "Nigeria-friendly signal found; verify the exact eligibility" : remote ? "Remote signal found; verify country eligibility" : "Verify location eligibility";
  return { ...raw, score: scoreValue, note, remote };
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { Accept: "application/json", "User-Agent": "JobPilot personal job discovery" }, cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
}

async function getText(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { Accept: "application/rss+xml, application/xml, text/xml" }, cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.text();
}

function xmlValue(item: string, tag: string) {
  const match = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() : "";
}

function parseRss(xml: string) {
  return Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)).map((match) => {
    const item = match[1];
    return { title: xmlValue(item, "title"), url: xmlValue(item, "link"), description: xmlValue(item, "description"), published: xmlValue(item, "pubDate") };
  });
}

const greenhouseBoards = [
  { token: "figma", company: "Figma" },
  { token: "gitlab", company: "GitLab" },
  { token: "asana", company: "Asana" },
  { token: "stripe", company: "Stripe" },
];

function diversify(jobs: Job[]) {
  const groups = new Map<string, Job[]>();
  for (const job of jobs) {
    const key = job.company.trim().toLowerCase();
    const group = groups.get(key) || [];
    if (group.length < 6) group.push(job);
    groups.set(key, group);
  }

  const result: Job[] = [];
  for (let index = 0; ; index += 1) {
    let added = false;
    for (const group of groups.values()) {
      if (group[index]) {
        result.push(group[index]);
        added = true;
      }
    }
    if (!added) break;
  }
  return result;
}

export async function GET() {
  const errors: string[] = [];
  const raw: RawJob[] = [];
  const requests = [
    { name: "Remotive", promise: getJson("https://remotive.com/api/remote-jobs?search=designer&limit=100") },
    { name: "Arbeitnow", promise: getJson("https://www.arbeitnow.com/api/job-board-api") },
    { name: "Himalayas", promise: getJson("https://himalayas.app/jobs/api/search?q=designer&page=1") },
    { name: "Jobicy", promise: getJson("https://jobicy.com/api/v2/remote-jobs?count=100&tag=designer") },
    { name: "Remote OK", promise: getJson("https://remoteok.com/api") },
    { name: "We Work Remotely", promise: getText("https://weworkremotely.com/categories/remote-design-jobs.rss") },
    ...greenhouseBoards.map((board) => ({ name: `Greenhouse · ${board.company}`, promise: getJson(`https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=true`).then((value) => ({ ...value, __company: board.company })) })),
  ];
  const results = await Promise.allSettled(requests.map((request) => request.promise));

  results.forEach((result, index) => {
    const name = requests[index].name;
    if (result.status === "rejected") { errors.push(`${name} unavailable`); return; }
    try {
      const value = result.value;
      if (name === "Remotive") for (const job of value.jobs || []) raw.push({ id: `remotive-${job.id}`, title: job.title || "", company: job.company_name || "", location: job.candidate_required_location || "Remote", url: job.url || "", description: clean(job.description || ""), source: name, published: asDate(job.publication_date) });
      if (name === "Arbeitnow") for (const job of value.data || []) raw.push({ id: `arbeit-${job.slug}`, title: job.title || "", company: job.company_name || "", location: job.location || "", url: job.url || "", description: clean(job.description || ""), source: name, published: asDate(job.created_at) });
      if (name === "Himalayas") for (const job of value.jobs || []) raw.push({ id: `himalayas-${job.guid || job.applicationLink}`, title: job.title || "", company: job.companyName || "", location: (job.locationRestrictions || []).map((item: any) => typeof item === "string" ? item : item.name).join(", ") || "Remote", url: job.applicationLink || job.guid || "", description: clean(job.description || job.excerpt || ""), source: name, published: asDate(job.pubDate) });
      if (name === "Jobicy") for (const job of value.jobs || []) raw.push({ id: `jobicy-${job.id}`, title: job.jobTitle || "", company: job.companyName || "", location: job.jobGeo || "Remote", url: job.url || "", description: clean(job.jobDescription || job.jobExcerpt || ""), source: name, published: asDate(job.pubDate) });
      if (name === "Remote OK") for (const job of (value || []).filter((item: any) => item.position && item.url)) raw.push({ id: `remoteok-${job.id || job.url}`, title: job.position || "", company: job.company || "", location: job.location || "Remote", url: job.apply_url || job.url || "", description: clean(job.description || (job.tags || []).join(" ")), source: name, published: asDate(job.date || job.epoch) });
      if (name === "We Work Remotely") for (const job of parseRss(value)) {
        const parts = job.title.split(/\s+(?:at|[-|])\s+/i);
        raw.push({ id: `wwr-${job.url}`, title: parts[0] || job.title, company: parts[1] || "We Work Remotely listing", location: "Remote", url: job.url, description: clean(job.description), source: name, published: asDate(job.published) });
      }
      if (name.startsWith("Greenhouse")) for (const job of value.jobs || []) raw.push({ id: `greenhouse-${value.__company}-${job.id}`, title: job.title || "", company: value.__company, location: job.location?.name || "", url: job.absolute_url || "", description: clean(job.content || ""), source: "Greenhouse", published: asDate(job.updated_at) });
    } catch { errors.push(`${name} could not be parsed`); }
  });

  const seen = new Set<string>();
  const jobs = raw.map(score).filter((job): job is Job => Boolean(job && job.url.startsWith("https://"))).filter((job) => { if (seen.has(job.url)) return false; seen.add(job.url); return true; }).sort((a, b) => Number(b.remote) - Number(a.remote) || b.score - a.score || (b.published || "").localeCompare(a.published || ""));
  return NextResponse.json({ jobs: diversify(jobs), errors, checked: raw.length, fetchedAt: new Date().toISOString(), sourceCounts: requests.map((request) => request.name) });
}
