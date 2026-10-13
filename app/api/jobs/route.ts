
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
type Job = {id:string;title:string;company:string;location:string;url:string;description:string;source:string;published?:string;score:number;note:string};
const roles = ["product designer","ux designer","ui designer","ui/ux","ui ux","web designer","product design","visual designer","design intern"];
const banned = ["senior","staff","principal","director","head of","vp of"];
function clean(s:string){return s.replace(/<[^>]+>/g," ").replace(/&[a-z]+;/g," ").replace(/\s+/g," ").trim();}
function score(j:Omit<Job,"score"|"note">):Job|null {
 const t=j.title.toLowerCase(), d=j.description.toLowerCase(), loc=j.location.toLowerCase();
 if(!roles.some(x=>t.includes(x))||banned.some(x=>t.includes(x)))return null;
 const restricted=/(us only|usa only|united states only|canada only|uk only|must be based in the us)/i.test(loc+" "+d.slice(0,1500));
 if(restricted)return null;
 const remote=/remote|worldwide|anywhere|global/.test(loc+" "+d.slice(0,500));
 const nigeria=/nigeria|africa|emea/.test(loc+" "+d.slice(0,500));
 const skills=["figma","prototype","research","design system","interface","react","user experience"];
 const s=Math.min(98,45+skills.filter(k=>d.includes(k)).length*5+(remote?12:0)+(nigeria?8:0));
 return {...j,score:s,note:nigeria?"Verify Nigeria eligibility":remote?"Verify remote location eligibility":"Verify location eligibility"};
}
async function getJson(url:string):Promise<any>{
 const res=await fetch(url,{signal:AbortSignal.timeout(11000),headers:{"Accept":"application/json","User-Agent":"JobPilot personal job discovery"},cache:"no-store"});
 if(!res.ok)throw new Error(`${res.status}`);return res.json();
}
export async function GET(){
 const errors:string[]=[];const raw:Omit<Job,"score"|"note">[]=[];
 const sources=await Promise.allSettled([
   getJson("https://remotive.com/api/remote-jobs?search=designer&limit=100"),
   getJson("https://www.arbeitnow.com/api/job-board-api"),
   getJson("https://boards-api.greenhouse.io/v1/boards/figma/jobs?content=true"),
   getJson("https://boards-api.greenhouse.io/v1/boards/notion/jobs?content=true"),
   getJson("https://api.lever.co/v0/postings/netlify?mode=json")
 ]);
 sources.forEach((r,i)=>{
   if(r.status==="rejected"){errors.push(["Remotive","Arbeitnow","Figma","Notion","Netlify"][i]+" unavailable");return;}
   const v=r.value;
   try{
    if(i===0)for(const x of v.jobs||[])raw.push({id:"remotive-"+x.id,title:x.title||"",company:x.company_name||"",location:x.candidate_required_location||"Remote",url:x.url||"",description:clean(x.description||""),source:"Remotive",published:x.publication_date});
    if(i===1)for(const x of v.data||[])raw.push({id:"arbeit-"+x.slug,title:x.title||"",company:x.company_name||"",location:x.location||"",url:x.url||"",description:clean(x.description||""),source:"Arbeitnow",published:x.created_at?new Date(x.created_at*1000).toISOString():undefined});
    if(i===2||i===3)for(const x of v.jobs||[])raw.push({id:"gh-"+x.id,title:x.title||"",company:i===2?"Figma":"Notion",location:x.location?.name||"",url:x.absolute_url||"",description:clean(x.content||""),source:"Greenhouse",published:x.updated_at});
    if(i===4)for(const x of v||[])raw.push({id:"lever-"+x.id,title:x.text||"",company:"Netlify",location:x.categories?.location||"",url:x.hostedUrl||"",description:clean(x.descriptionPlain||x.description||""),source:"Lever"});
   }catch{errors.push("Could not parse "+i);}
 });
 const seen=new Set<string>();
 const jobs=raw.map(score).filter((j):j is Job=>!!j&&j.url.startsWith("https://")).filter(j=>{if(seen.has(j.url))return false;seen.add(j.url);return true}).sort((a,b)=>b.score-a.score);
 return NextResponse.json({jobs,errors,checked:raw.length,fetchedAt:new Date().toISOString()});
}
