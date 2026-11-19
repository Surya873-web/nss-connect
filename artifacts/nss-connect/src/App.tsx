import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation } from 'wouter';
import {
  Activity, ArrowDownToLine, ArrowRight, Bell, BookOpenCheck, CalendarDays, Check,
  ChevronRight, CircleAlert, ClipboardCheck, Clock3, Compass, FileText, HeartHandshake,
  Home, LogOut, Plus, QrCode, Search, ShieldCheck, Sparkles, Users, X,
} from 'lucide-react';
import { BrowserQRCodeReader } from '@zxing/browser';
import QRCode from 'qrcode';
import {
  getGetEventQueryKey, getGetStaffDashboardQueryKey, getGetSessionQueryKey, getGetStudentDashboardQueryKey,
  getListStaffAccountsQueryKey,
  getGetStudentProfileQueryKey, getListAnnouncementsQueryKey, getListEventsQueryKey,
  getListEventRegistrationsQueryKey, getListManageAnnouncementsQueryKey, getListStudentAttendanceQueryKey,
  useCancelEvent, useCancelEventRegistration, useChangeStudentPassword,
  useCreateAnnouncement, useCreateEvent, useDeleteAnnouncement, useDownloadVolunteerHoursReport,
  useGetEvent, useGetStaffDashboard, useGetPublicOverview, useGetSession, useGetStudentDashboard,
  useGetStudentProfile, useHealthCheck, useListAnnouncements, useListEvents, useListEventRegistrations,
  useListManageAnnouncements, useListStudentAttendance, useListStudents, useLogin, useLogout,
  useListStaffAccounts, useCreateStaffAccount, useDeleteStaffAccount,
  useResetStaffPassword,
  useMarkAnnouncementRead, usePublishEvent, useRecordAttendance, useRegisterForEvent,
  useRegisterStudent, useUpdateAnnouncement, useUpdateEvent, useUpdateStudentProfile,
  useCreateAttendanceQr, useRevokeAttendanceQr, useSubmitQrAttendance,
  useApproveVolunteerCertificate, useListStaffCertificates, useListStudentCertificates,
  useRejectVolunteerCertificate, useRequestVolunteerCertificate, useVerifyVolunteerCertificate,
  downloadVolunteerCertificate, getVerifyVolunteerCertificateQueryKey,
} from '@workspace/api-client-react';
import type { Announcement, AttendanceQrToken, AttendanceRecord, Event, EventInput, EventRegistration, StaffAccount, StaffVolunteerCertificate, StudentProfile, VolunteerCertificate } from '@workspace/api-client-react';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
const invalid = (...keys: readonly (readonly unknown[])[]) => keys.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey }));
const date = (v?: string) => v ? new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v)) : 'Date to be confirmed';
const time = (v?: string) => v ? new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(v)) : '';
const initials = (s = 'NSS') => s.split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase();
const msgError = (err: unknown) => err instanceof Error ? err.message : 'Something went wrong. Please try again.';

function Loading({ label = 'Loading your workspace' }: {label?: string}) {
  return <div className="page-enter" style={{display:'grid',gap:14,padding:'20px 0'}} aria-label={label}>
    <div className="skeleton" style={{height:32,width:'35%'}}/><div className="skeleton" style={{height:100,width:'100%'}}/><div className="skeleton" style={{height:210,width:'100%'}}/>
  </div>;
}
function Problem({ error, retry }: {error?: unknown; retry?:()=>void}) {
  return <div className="card" style={{padding:24,display:'flex',gap:14,alignItems:'center',marginTop:20}}>
    <CircleAlert size={22} color="hsl(var(--destructive))"/><div style={{flex:1}}><b>We couldn’t load this just now</b><div style={{color:'hsl(var(--muted-foreground))',fontSize:14,marginTop:4}}>{msgError(error)}</div></div>
    {retry&&<button className="btn outline small" onClick={retry} data-testid="button-retry">Try again</button>}
  </div>;
}
function Empty({title,body,action}:{title:string;body:string;action?:ReactNode}) {
  return <div className="card" style={{padding:'42px 24px',textAlign:'center',marginTop:18}}>
    <div style={{width:48,height:48,borderRadius:15,display:'grid',placeItems:'center',margin:'0 auto 15px',background:'hsl(var(--secondary))',color:'hsl(var(--primary))'}}><Sparkles size={22}/></div>
    <h3 style={{fontFamily:'var(--app-font-serif)',fontSize:20,margin:'0 0 6px'}}>{title}</h3><p style={{color:'hsl(var(--muted-foreground))',margin:'0 auto 18px',maxWidth:430,lineHeight:1.6}}>{body}</p>{action}
  </div>;
}
function Header({title,subtitle,action}:{title:string;subtitle?:string;action?:React.ReactNode}) {
  return <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:16,flexWrap:'wrap',marginBottom:25}}>
    <div><div className="eyebrow" style={{marginBottom:8}}>NSS Connect / {title}</div><h1 style={{fontFamily:'var(--app-font-serif)',fontSize:'clamp(1.8rem,3vw,2.45rem)',letterSpacing:'-.045em',lineHeight:1.1,margin:0}}>{title}</h1>{subtitle&&<p style={{color:'hsl(var(--muted-foreground))',margin:'9px 0 0',fontSize:15}}>{subtitle}</p>}</div>{action}
  </div>;
}
function Pill({children,tone='blue'}:{children:React.ReactNode;tone?:'blue'|'green'|'amber'|'red'|'gray'}) {
  const c={blue:['hsl(210 70% 94%)','hsl(211 77% 35%)'],green:['hsl(154 47% 91%)','hsl(155 48% 29%)'],amber:['hsl(40 85% 92%)','hsl(34 80% 33%)'],red:['hsl(0 70% 94%)','hsl(0 66% 42%)'],gray:['hsl(var(--muted))','hsl(var(--muted-foreground))']}[tone];
  return <span style={{display:'inline-flex',alignItems:'center',borderRadius:99,padding:'5px 9px',fontSize:11,fontWeight:700,letterSpacing:'.035em',background:c[0],color:c[1],textTransform:'capitalize'}}>{children}</span>;
}

const studentNav = [
  {href:'/student',label:'Overview',icon:Home},{href:'/student/events',label:'Find activities',icon:Compass},
  {href:'/student/attendance',label:'My service record',icon:ClipboardCheck},{href:'/student/certificates',label:'Certificates',icon:FileText},{href:'/student/announcements',label:'Notices',icon:Bell},
  {href:'/student/profile',label:'My profile',icon:Users},
];
const staffNav = [
  {href:'/staff/dashboard',label:'Staff dashboard',icon:Home},{href:'/staff/programs',label:'NSS programs',icon:CalendarDays},
  {href:'/staff/students',label:'Students',icon:Users},{href:'/staff/accounts',label:'Staff accounts',icon:ShieldCheck},{href:'/staff/certificates',label:'Certificates',icon:FileText},{href:'/staff/notices',label:'Notices',icon:Bell},
];
function Shell({children,role}:{children:ReactNode;role:'student'|'staff'}) {
  const [loc,setLoc]=useLocation(); const [mobile,setMobile]=useState(false);
  const session=useGetSession(); const logout=useLogout(); const nav=role==='student'?studentNav:staffNav;
  const user=session.data?.user;
  return <div className="grain" style={{minHeight:'100dvh',display:'flex',background:'hsl(var(--background))'}}>
    <aside className="desktop-only" style={{width:248,background:'hsl(var(--sidebar))',color:'hsl(var(--sidebar-foreground))',padding:'25px 16px 18px',display:'flex',flexDirection:'column',position:'fixed',inset:'0 auto 0 0',zIndex:10}}>
      <Link href="/" className="brand-word" style={{fontSize:26,display:'flex',alignItems:'center',gap:10,padding:'0 10px 30px',color:'white'}}><span style={{width:36,height:36,borderRadius:11,display:'grid',placeItems:'center',background:'hsl(var(--sidebar-primary))',color:'hsl(var(--sidebar-primary-foreground))'}}><HeartHandshake size={20}/></span>NSS Connect</Link>
      <div className="eyebrow" style={{color:'hsl(210 22% 65%)',padding:'0 12px 12px'}}>{role==='student'?'Volunteer space':'NSS staff workspace'}</div>
      <nav style={{display:'grid',gap:5}}>{nav.map(item=><Link key={item.href} href={item.href} onClick={()=>setMobile(false)} className="side-link" style={{display:'flex',alignItems:'center',gap:12,padding:'11px 12px',borderRadius:9,color:'inherit',fontSize:14,fontWeight:600,background:loc===item.href?'hsl(var(--sidebar-accent))':'transparent'}}><item.icon size={18}/>{item.label}{item.label==='Notices'&&role==='student'&&<span style={{marginLeft:'auto',width:7,height:7,background:'hsl(var(--sidebar-primary))',borderRadius:9}}/>}</Link>)}</nav>
      <div style={{marginTop:'auto',padding:'16px 10px',borderTop:'1px solid hsl(var(--sidebar-border))'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}><div style={{width:36,height:36,display:'grid',placeItems:'center',borderRadius:50,background:'hsl(var(--sidebar-primary)/.2)',color:'hsl(var(--sidebar-primary))',fontWeight:800,fontSize:12}}>{initials(user?.name)}</div><div style={{minWidth:0}}><div style={{fontSize:13,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.name||'NSS volunteer'}</div><div style={{fontSize:11,color:'hsl(210 22% 70%)'}}>{role==='student'?'Student volunteer':'Authorized NSS staff'}</div></div></div>
        <button className="side-link" onClick={()=>logout.mutate(undefined,{onSuccess:()=>{queryClient.setQueryData(getGetSessionQueryKey(),{authenticated:false,user:null,csrfToken:null});invalid(getGetSessionQueryKey());setLoc('/')}})} style={{display:'flex',gap:11,alignItems:'center;width:100%',border:0,background:'transparent',color:'inherit',padding:'8px 10px',cursor:'pointer',fontWeight:600}}><LogOut size={17}/> Sign out</button>
      </div>
    </aside>
    <div className="app-content" style={{flex:1,minWidth:0,marginLeft:248}}>
      <header style={{height:68,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 clamp(18px,4vw,48px)',background:'hsl(var(--card)/.86)',borderBottom:'1px solid hsl(var(--border))',position:'sticky',top:0,zIndex:8,backdropFilter:'blur(14px)'}}>
        <Link href="/" className="brand-word mobile-brand" style={{display:'none',fontSize:21,color:'hsl(var(--primary))'}}>NSS Connect</Link>
        <div style={{fontSize:13,color:'hsl(var(--muted-foreground))'}}>{role==='student'?'Volunteer portal':'NSS staff workspace'}</div>
        <div style={{display:'flex',alignItems:'center',gap:12}}><div style={{width:8,height:8,borderRadius:9,background:'hsl(154 48% 42%)'}}/><span style={{fontSize:12,color:'hsl(var(--muted-foreground))'}}>Secure session</span><div style={{width:34,height:34,display:'grid',placeItems:'center',borderRadius:50,background:'hsl(var(--secondary))',color:'hsl(var(--primary))',fontSize:11,fontWeight:800}}>{initials(user?.name)}</div></div>
      </header>
      <main className="page-enter" style={{maxWidth:1440,margin:'0 auto',padding:'clamp(22px,4vw,42px) clamp(18px,4vw,48px) 60px'}}>{children}</main>
    </div>
    <style>{`@media(max-width:767px){.desktop-only{display:none!important}.mobile-brand{display:block!important}main{padding-bottom:92px!important}.mobile-dock{display:flex!important}}`}</style>
    <nav className="mobile-dock" style={{display:'none',position:'fixed',bottom:0,left:0,right:0,zIndex:15,justifyContent:'space-around',padding:'9px 5px calc(9px + env(safe-area-inset-bottom))',background:'hsl(var(--card)/.96)',borderTop:'1px solid hsl(var(--border))',backdropFilter:'blur(16px)'}}>
      {nav.map(item=><Link key={item.href} href={item.href} style={{flex:'1 1 0',minWidth:0,display:'grid',justifyItems:'center',gap:3,fontSize:10,fontWeight:700,color:loc===item.href?'hsl(var(--primary))':'hsl(var(--muted-foreground))'}}><item.icon size={19}/><span style={{maxWidth:'100%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.label.split(' ')[0]}</span></Link>)}
    </nav>
  </div>;
}
function RequireRole({role,children}:{role:'student'|'staff';children:ReactNode}) {
  const session=useGetSession();const [,setLoc]=useLocation();
  useEffect(()=>{if(session.error||(session.data&&!session.data.authenticated))setLoc(role==='staff'?'/staff/login':'/login');else if(session.data?.authenticated&&session.data.user&&session.data.user.role!==role)setLoc(session.data.user.role==='staff'?'/staff/dashboard':'/student');},[session.error,session.data,role,setLoc]);
  if(session.isLoading)return <div style={{minHeight:'100dvh',padding:'10vh 9vw'}}><Loading label="Checking secure session"/></div>;
  if(session.error||!session.data?.authenticated||!session.data.user)return <AuthRedirect/>;
  if(session.data.user.role!==role)return <AuthRedirect/>;
  return <Shell role={role}>{children}</Shell>;
}
function AuthRedirect(){return <div style={{minHeight:'100dvh',display:'grid',placeItems:'center',color:'hsl(var(--muted-foreground))'}}>Taking you to secure sign in…</div>}
function AuthLayout({children,caption}:{children:ReactNode;caption:string}) {
  return <div className="grain auth-layout" style={{minHeight:'100dvh',display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(320px,520px)',background:'hsl(var(--background))'}}>
    <section className="auth-art" style={{background:'hsl(213 64% 24%)',color:'white',padding:'clamp(28px,7vw,92px)',display:'flex',flexDirection:'column',justifyContent:'space-between',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',right:-140,bottom:-140,width:460,height:460,border:'1px solid hsl(195 75% 62%/.22)',borderRadius:'50%',boxShadow:'0 0 0 48px hsl(195 75% 62%/.05),0 0 0 100px hsl(195 75% 62%/.035)'}}/>
      <Link href="/" className="brand-word" style={{fontSize:26,display:'flex',alignItems:'center',gap:10,position:'relative'}}><HeartHandshake color="hsl(195 75% 62%)"/> NSS Connect</Link>
      <div style={{position:'relative',maxWidth:520}}><div className="eyebrow" style={{color:'hsl(195 75% 70%)'}}>Service begins here</div><h1 style={{fontFamily:'var(--app-font-serif)',fontSize:'clamp(2.7rem,5.7vw,5.5rem)',letterSpacing:'-.065em',lineHeight:.98,margin:'18px 0 22px'}}>Show up.<br/>Make it count.</h1><p style={{fontSize:17,lineHeight:1.7,color:'hsl(210 35% 84%)',maxWidth:420}}>{caption}</p></div>
      <div style={{position:'relative',fontSize:12,color:'hsl(210 28% 76%)'}}>A trusted space for student service and verified impact.</div>
    </section>
    <section style={{display:'grid',placeItems:'center',padding:'32px 23px'}}>{children}</section>
    <style>{`@media(max-width:800px){.auth-art{display:none!important}}`}</style>
  </div>;
}
function Landing(){
  const overview=useGetPublicOverview();const health=useHealthCheck();
  return <div className="grain" style={{minHeight:'100dvh',background:'hsl(var(--background))'}}>
    <header style={{height:76,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 clamp(20px,7vw,100px)',borderBottom:'1px solid hsl(var(--border))',background:'hsl(var(--card))'}}>
      <Link href="/" className="brand-word" style={{fontSize:24,color:'hsl(var(--primary))',display:'flex',alignItems:'center',gap:9}}><span style={{display:'grid',placeItems:'center',width:34,height:34,borderRadius:10,background:'hsl(var(--primary))',color:'white'}}><HeartHandshake size={19}/></span>NSS Connect</Link>
      <div style={{display:'flex',alignItems:'center',gap:22,fontSize:14,fontWeight:600}} className="desktop-only"><a href="#activities">Activities</a><a href="#impact">Our purpose</a><Link href="/staff/login" className="link" data-testid="link-staff-login">Staff login</Link><Link href="/login" className="btn small">Volunteer sign in <ArrowRight size={15}/></Link></div>
      <div className="mobile-cta" style={{display:'none',alignItems:'center',gap:7}}><Link href="/staff/login" className="btn outline small" data-testid="link-staff-login-mobile">Staff</Link><Link href="/login" className="btn small">Sign in</Link></div>
    </header>
    <main>
      <section style={{padding:'clamp(52px,9vw,128px) clamp(22px,9vw,130px) 86px',position:'relative',overflow:'hidden',background:'linear-gradient(115deg,hsl(210 52% 96%),hsl(195 58% 92%))'}}>
        <div style={{position:'absolute',right:'9%',top:'13%',width:'clamp(150px,28vw,360px)',aspectRatio:'1',borderRadius:'48% 52% 58% 42%',border:'1px solid hsl(211 77% 35%/.14)',transform:'rotate(-22deg)'}}/><div style={{position:'absolute',right:'15%',top:'20%',width:'clamp(95px,18vw,225px)',aspectRatio:'1',borderRadius:'50%',background:'hsl(195 75% 62%/.13)'}}/>
        <div style={{maxWidth:680,position:'relative'}}><div className="eyebrow" style={{color:'hsl(var(--primary))',display:'flex',gap:8,alignItems:'center'}}><span style={{width:22,height:1,background:'currentColor'}}/> National Service Scheme · Campus community</div>
          <h1 style={{fontFamily:'var(--app-font-serif)',fontSize:'clamp(3rem,7vw,6.65rem)',letterSpacing:'-.075em',lineHeight:.94,margin:'24px 0 24px',color:'hsl(215 45% 18%)'}}>A little time.<br/><span style={{color:'hsl(var(--primary))'}}>A lasting mark.</span></h1>
          <p style={{maxWidth:560,fontSize:'clamp(1rem,1.6vw,1.2rem)',lineHeight:1.75,color:'hsl(213 18% 42%)',margin:'0 0 29px'}}>Find meaningful service on campus, keep your work in one place, and see every hour of impact verified.</p>
          <div style={{display:'flex',gap:11,flexWrap:'wrap'}}><Link href="/signup" className="btn">Join the volunteer community <ArrowRight size={17}/></Link><Link href="/login" className="btn outline">Volunteer sign in</Link><Link href="/staff/login" className="btn outline" data-testid="link-staff-portal">NSS staff login</Link></div>
          <div style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginTop:20,display:'flex',alignItems:'center',gap:7}}><ShieldCheck size={15}/> Student accounts are verified through your institution</div>
        </div>
      </section>
      <section id="impact" style={{padding:'68px clamp(22px,9vw,130px)',background:'hsl(var(--primary))',color:'white'}}>
        <div style={{maxWidth:1170,margin:'auto',display:'grid',gridTemplateColumns:'minmax(200px,1.1fr) 2fr',gap:45,alignItems:'center'}}>
          <div><div className="eyebrow" style={{color:'hsl(195 75% 75%)'}}>A clearer picture of service</div><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:'clamp(2rem,4vw,3.3rem)',letterSpacing:'-.055em',lineHeight:1.05,margin:'14px 0'}}>From showing up<br/>to showing impact.</h2></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:18}}>{[['01','Discover','Find activities that need your hands.'],['02','Take part','Register and coordinate with your NSS team.'],['03','Get verified','Your attendance and service hours stay on record.']].map(([n,t,d])=><div key={n} style={{borderTop:'1px solid hsl(0 0% 100%/.27)',paddingTop:17}}><div style={{fontFamily:'var(--app-font-mono)',fontSize:12,color:'hsl(195 75% 71%)'}}>{n}</div><h3 style={{fontFamily:'var(--app-font-serif)',fontSize:20,margin:'13px 0 6px'}}>{t}</h3><p style={{margin:0,fontSize:13,lineHeight:1.6,color:'hsl(210 35% 84%)'}}>{d}</p></div>)}</div>
        </div>
      </section>
      <section id="activities" style={{maxWidth:1250,margin:'0 auto',padding:'76px clamp(20px,6vw,70px) 92px'}}>
        <Header title="Open service opportunities" subtitle="Published activities from your NSS program." action={<Link href="/login" className="link" style={{display:'flex',alignItems:'center',gap:7}}>All activities <ArrowRight size={16}/></Link>}/>
        {overview.isLoading?<Loading label="Loading public activities"/>:overview.error?<Problem error={overview.error} retry={()=>void overview.refetch()}/>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,290px),1fr))',gap:16}}>
          {(overview.data?.events||[]).slice(0,3).map((event,i)=><EventCard key={event.id} event={event} onRegister={()=>{}} publicMode index={i}/>)}
          {!overview.data?.events?.length&&<Empty title="New opportunities are on the way" body="Check back soon for published service activities from your NSS unit."/>}
        </div>}
        {overview.data?.announcement&&<div className="card" style={{marginTop:30,padding:'20px 24px',display:'flex',gap:15,alignItems:'flex-start',background:'hsl(var(--secondary)/.55)'}}><Bell size={20} color="hsl(var(--primary))"/><div><div className="eyebrow" style={{color:'hsl(var(--primary))'}}>Latest notice</div><b style={{display:'block',margin:'5px 0'}}>{overview.data.announcement.title}</b><div style={{fontSize:14,color:'hsl(var(--muted-foreground))',lineHeight:1.6}}>{overview.data.announcement.body}</div></div></div>}
      </section>
    </main>
    <footer style={{borderTop:'1px solid hsl(var(--border))',padding:'25px clamp(20px,7vw,100px)',display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap',fontSize:12,color:'hsl(var(--muted-foreground))'}}><span className="brand-word" style={{fontSize:16,color:'hsl(var(--primary))'}}>NSS Connect</span><span>National Service Scheme · {health.data?.status==='ok'?'Service portal online':'Student service, made visible'}</span></footer>
    <style>{`@media(max-width:767px){.mobile-cta{display:inline-flex!important}#impact>div{grid-template-columns:1fr!important}#impact>div>div:last-child{grid-template-columns:1fr!important}}`}</style>
  </div>;
}
function EventCard({event,onRegister,registered=false,busy=false,publicMode=false,viewOnly=false,onCancel,index=0}:{event:Event;onRegister:()=>void;registered?:boolean;busy?:boolean;publicMode?:boolean;viewOnly?:boolean;onCancel?:()=>void;index?:number}) {
  const palettes=[['hsl(194 70% 93%)','hsl(197 65% 39%)'],['hsl(40 83% 93%)','hsl(33 78% 42%)'],['hsl(158 44% 92%)','hsl(157 45% 35%)']];
  const paint=palettes[index%3];
  return <article className="card" style={{padding:21,display:'flex',flexDirection:'column',minHeight:247,transition:'transform .2s,box-shadow .2s'}} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-3px)';e.currentTarget.style.boxShadow='var(--shadow)'}} onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow=''}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center'}}><span style={{display:'inline-flex',alignItems:'center',gap:7,fontSize:11,fontWeight:700,color:paint[1],background:paint[0],borderRadius:50,padding:'7px 10px'}}><CalendarDays size={14}/>{date(event.startsAt)}</span>{event.status!=='published'&&<Pill tone={event.status==='cancelled'?'red':'gray'}>{event.status}</Pill>}</div>
    <h3 style={{fontFamily:'var(--app-font-serif)',fontSize:21,letterSpacing:'-.035em',margin:'17px 0 7px',lineHeight:1.18}}>{event.title}</h3>
    <p style={{fontSize:13,color:'hsl(var(--muted-foreground))',lineHeight:1.6,margin:'0 0 17px',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{event.description}</p>
    <div style={{display:'flex',gap:14,flexWrap:'wrap',fontSize:12,color:'hsl(var(--muted-foreground))',marginTop:'auto',paddingBottom:17}}><span style={{display:'flex',alignItems:'center',gap:5}}><Clock3 size={14}/>{time(event.startsAt)}</span><span style={{display:'flex',alignItems:'center',gap:5}}><Activity size={14}/>{event.volunteerHours} verified hrs</span><span style={{display:'flex',alignItems:'center',gap:5}}><Users size={14}/>{event.registrationCount} registered</span></div>
    <div style={{borderTop:'1px solid hsl(var(--border))',paddingTop:13,display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}><span style={{fontSize:12,color:'hsl(var(--muted-foreground))',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>At {event.venue}</span>{publicMode?<Link href="/login" className="link" style={{fontSize:12,whiteSpace:'nowrap'}}>Sign in to join <ChevronRight size={14} style={{verticalAlign:'middle'}}/></Link>:event.myRegistrationStatus==='attended'?<Pill tone="green">Attended</Pill>:viewOnly&&registered?<Pill tone="blue">Registered</Pill>:registered?<button className="btn outline small" disabled={busy} onClick={onCancel} data-testid={`button-cancel-registration-${event.id}`}>Cancel spot</button>:<button className="btn small" disabled={busy||event.status!=='published'} onClick={onRegister} data-testid={`button-register-${event.id}`}>Register <ArrowRight size={14}/></button>}</div>
  </article>;
}

function Login({staff=false}:{staff?:boolean}){
  const login=useLogin();const [,setLoc]=useLocation();const [error,setError]=useState('');
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setError('');const d=new FormData(e.currentTarget);login.mutate({data:{identifier:String(d.get('identifier')).trim(),password:String(d.get('password')), ...(staff?{role:'staff' as const}:{})}},{onSuccess:s=>{queryClient.setQueryData(getGetSessionQueryKey(),s);invalid(getGetSessionQueryKey());setLoc(s.user?.role==='staff'?'/staff/dashboard':'/student')},onError:e=>setError(msgError(e))});};
  return <AuthLayout caption={staff?'View NSS activities, coordinate student volunteers, record attendance, and create programs from one secure staff workspace.':'Your service activities, verified hours and NSS notices — all in one secure student portal.'}><div style={{width:'min(100%,390px)'}}><div className="eyebrow">{staff?'NSS staff portal':'Volunteer portal'}</div><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:32,letterSpacing:'-.05em',margin:'8px 0 7px'}}>{staff?'Staff login':'Volunteer sign in'}</h2><p style={{margin:'0 0 27px',color:'hsl(var(--muted-foreground))',fontSize:14,lineHeight:1.6}}>{staff?'Use the authorized staff email assigned by the site and your personal staff password.':'Use your registered email or student ID. Access is determined by your account.'}</p>
    <form onSubmit={submit} style={{display:'grid',gap:16}}><label className="field">{staff?'Staff email':'Email or student ID'}<input className="input" name="identifier" autoComplete="username" required data-testid="input-login-identifier" placeholder={staff?'Authorized staff email':'you@college.edu'}/></label><label className="field">Password<input className="input" type="password" name="password" autoComplete="current-password" required data-testid="input-login-password" placeholder="Your password"/></label>{error&&<div role="alert" style={{color:'hsl(var(--destructive))',fontSize:13}}>{error}</div>}<button className="btn" disabled={login.isPending} data-testid="button-login">{login.isPending?'Signing in…':staff?'Staff sign in securely':'Sign in securely'} <ArrowRight size={16}/></button></form>
    {staff?<p style={{textAlign:'center',fontSize:13,color:'hsl(var(--muted-foreground))',marginTop:22}}>Forgot your password? <Link className="link" href="/staff/reset-password">Reset staff password</Link><br/>Staff accounts are created by NSS administrators.<br/>Student volunteer? <Link className="link" href="/login">Volunteer sign in</Link></p>:<p style={{textAlign:'center',fontSize:13,color:'hsl(var(--muted-foreground))',marginTop:22}}>New to your NSS unit? <Link className="link" href="/signup">Create a student account</Link><br/>NSS staff? <Link className="link" href="/staff/login">Staff login</Link></p>}<Link href="/" style={{display:'block',textAlign:'center',marginTop:22,fontSize:12,color:'hsl(var(--muted-foreground))'}}>← Back to public activities</Link>
  </div></AuthLayout>;
}
function StaffSignup(){
  return <AuthLayout caption="NSS staff accounts are managed by authorized members of your NSS team."><div style={{width:'min(100%,390px)',padding:'8px 4px'}}>
    <div className="eyebrow">NSS staff portal</div>
    <h2 style={{fontFamily:'var(--app-font-serif)',fontSize:32,letterSpacing:'-.05em',margin:'8px 0 7px'}}>Staff accounts are managed securely</h2>
    <p style={{margin:'0 0 20px',color:'hsl(var(--muted-foreground))',fontSize:14,lineHeight:1.6}}>Public staff registration is disabled. Ask an authorized staff member to create your account.</p>
    <Link className="btn" href="/staff/login">Go to staff sign in <ArrowRight size={16}/></Link>
  </div></AuthLayout>;
}
function StaffPasswordReset(){
  const reset=useResetStaffPassword();const [error,setError]=useState('');const [complete,setComplete]=useState(false);
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setError('');const d=new FormData(e.currentTarget);const invitationPassword=String(d.get('invitationPassword'));const newPassword=String(d.get('newPassword'));if(newPassword!==String(d.get('confirmPassword'))){setError('The new passwords do not match.');return;}reset.mutate({data:{invitationPassword,newPassword}},{onSuccess:()=>setComplete(true),onError:e=>setError(e.status===401?'Incorrect staff-entry password.':e.status===404?'No staff login exists yet. Create one first.':e.status===429?'Too many attempts. Please wait 15 minutes.':msgError(e))});};
  return <AuthLayout caption="Verify the staff-entry password to choose a new password for the existing staff account."><div style={{width:'min(100%,390px)'}}><div className="eyebrow">NSS staff portal</div><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:32,letterSpacing:'-.05em',margin:'8px 0 7px'}}>Reset staff password</h2>{complete?<><p role="status" style={{color:'hsl(var(--muted-foreground))',fontSize:14,lineHeight:1.6}}>Password updated. Existing staff sessions were signed out. Sign in with the authorized staff email and your new password.</p><Link className="btn" href="/staff/login">Go to staff login</Link></>:<><p style={{margin:'0 0 20px',color:'hsl(var(--muted-foreground))',fontSize:14,lineHeight:1.6}}>Use the shared staff-entry password, then set a new personal password. Anyone with the staff-entry password can reset this account.</p><form onSubmit={submit} style={{display:'grid',gap:14}}><label className="field">Staff entry password<input className="input" type="password" name="invitationPassword" required minLength={15} maxLength={128} autoComplete="off" data-testid="input-staff-reset-invitation-password"/></label><label className="field">New staff password<input className="input" type="password" name="newPassword" required minLength={12} maxLength={128} autoComplete="new-password" data-testid="input-staff-reset-password"/></label><label className="field">Confirm new password<input className="input" type="password" name="confirmPassword" required minLength={12} maxLength={128} autoComplete="new-password" data-testid="input-staff-reset-confirm-password"/></label>{error&&<div role="alert" style={{color:'hsl(var(--destructive))',fontSize:13}}>{error}</div>}<button className="btn" disabled={reset.isPending} data-testid="button-staff-reset">{reset.isPending?'Updating password…':'Reset staff password'} <ArrowRight size={16}/></button></form></>}<p style={{textAlign:'center',fontSize:13,color:'hsl(var(--muted-foreground))',marginTop:22}}>Remembered it? <Link className="link" href="/staff/login">Staff sign in</Link></p><Link href="/" style={{display:'block',textAlign:'center',marginTop:18,fontSize:12,color:'hsl(var(--muted-foreground))'}}>← Back to public activities</Link></div></AuthLayout>;
}
function Signup(){
  const signup=useRegisterStudent();const [,setLoc]=useLocation();const [error,setError]=useState('');
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setError('');const d=new FormData(e.currentTarget);signup.mutate({data:{name:String(d.get('name')).trim(),email:String(d.get('email')).trim(),studentId:String(d.get('studentId')).trim(),department:String(d.get('department')).trim(),year:Number(d.get('year')),phone:String(d.get('phone')||'').trim(),password:String(d.get('password'))}},{onSuccess:s=>{queryClient.setQueryData(getGetSessionQueryKey(),s);invalid(getGetSessionQueryKey());setLoc(s.user?.role==='staff'?'/staff':'/student')},onError:e=>setError(msgError(e))});};
  return <AuthLayout caption="Start with a verified student profile. Your NSS staff can coordinate activities and validate your service record."><div style={{width:'min(100%,430px)',maxHeight:'94dvh',overflowY:'auto',padding:'8px 4px'}}><div className="eyebrow">Join the program</div><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:31,letterSpacing:'-.05em',margin:'8px 0 6px'}}>Create your account</h2><p style={{margin:'0 0 20px',color:'hsl(var(--muted-foreground))',fontSize:13}}>Student volunteer registration · role access is assigned securely.</p>
    <form onSubmit={submit} style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}><label className="field" style={{gridColumn:'1/-1'}}>Full name<input className="input" name="name" required minLength={2} maxLength={120} data-testid="input-signup-name"/></label><label className="field">Email<input className="input" type="email" name="email" required data-testid="input-signup-email"/></label><label className="field">Student ID<input className="input" name="studentId" required maxLength={60} data-testid="input-signup-student-id"/></label><label className="field">Department<input className="input" name="department" required data-testid="input-signup-department"/></label><label className="field">Year of study<select className="select" name="year" defaultValue="1" data-testid="select-signup-year">{Array.from({length:8},(_,i)=><option key={i} value={i+1}>{i+1}{i===0?'st':i===1?'nd':i===2?'rd':'th'} year</option>)}</select></label><label className="field">Phone <span style={{fontWeight:400,color:'hsl(var(--muted-foreground))'}}>optional</span><input className="input" type="tel" name="phone" maxLength={40} data-testid="input-signup-phone"/></label><label className="field">Password<input className="input" type="password" name="password" required minLength={10} autoComplete="new-password" data-testid="input-signup-password"/></label>{error&&<div role="alert" style={{gridColumn:'1/-1',color:'hsl(var(--destructive))',fontSize:13}}>{error}</div>}<button className="btn" disabled={signup.isPending} style={{gridColumn:'1/-1'}} data-testid="button-signup">{signup.isPending?'Creating account…':'Create student account'} <ArrowRight size={16}/></button></form>
    <p style={{textAlign:'center',fontSize:13,color:'hsl(var(--muted-foreground))',marginTop:17}}>Already registered? <Link className="link" href="/login">Sign in</Link></p>
  </div></AuthLayout>;
}

function StudentHome(){
  const dash=useGetStudentDashboard();const announcements=useListAnnouncements();const profile=useGetStudentProfile();
  if(dash.isLoading)return <Loading/>;if(dash.error)return <Problem error={dash.error} retry={()=>void dash.refetch()}/>;
  const d=dash.data!;
  return <><Header title={`Good day${profile.data?.name?`, ${profile.data.name.split(' ')[0]}`:''}`} subtitle="Every hour you give adds up. Here’s where your service stands." action={<Link href="/student/events" className="btn"><Compass size={17}/> Find an activity</Link>}/>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(165px,1fr))',gap:13,marginBottom:28}}>{[['Verified hours',d.verifiedHours,'Clock3','hsl(194 70% 93%)'],['Activities joined',d.registeredEvents,'CalendarDays','hsl(40 83% 93%)'],['Completed',d.completedActivities,'Check','hsl(158 44% 92%)'],['Notices to read',d.unreadAnnouncements,'Bell','hsl(218 55% 94%)']].map(([name,value,icon,bg])=>{const I=icon==='Clock3'?Clock3:icon==='CalendarDays'?CalendarDays:icon==='Check'?Check:Bell;return <div key={String(name)} className="card" style={{padding:18,display:'flex',alignItems:'center',gap:13}}><div style={{width:42,height:42,borderRadius:12,display:'grid',placeItems:'center',background:String(bg),color:'hsl(var(--primary))'}}><I size={19}/></div><div><div style={{fontSize:25,fontFamily:'var(--app-font-serif)',fontWeight:800,letterSpacing:'-.04em'}}>{value}</div><div style={{fontSize:11,color:'hsl(var(--muted-foreground))',fontWeight:600}}>{name}</div></div></div>})}</div>
    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.55fr) minmax(240px,.8fr)',gap:19,alignItems:'start'}}>
      <section><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}><div><div className="eyebrow">Coming up</div><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:23,margin:'5px 0'}}>Your next activities</h2></div><Link href="/student/events" className="link" style={{fontSize:13}}>Browse all <ArrowRight size={15} style={{verticalAlign:'middle'}}/></Link></div>
        <div style={{display:'grid',gap:12}}>{d.upcomingEvents?.length?d.upcomingEvents.slice(0,3).map((e,i)=><EventCard key={e.id} event={e} registered viewOnly onRegister={()=>{}} index={i}/>):<Empty title="Your next chapter is open" body="Browse published NSS activities and register for the service work that matters to you." action={<Link href="/student/events" className="btn small">Explore activities</Link>}/>}</div>
      </section>
      <section className="card" style={{padding:20}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div className="eyebrow">Bulletin</div><Bell size={17} color="hsl(var(--primary))"/></div><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:21,margin:'9px 0 13px'}}>Latest notices</h2>
        {announcements.isLoading?<div className="skeleton" style={{height:80}}/>:announcements.error?<Problem error={announcements.error} retry={()=>void announcements.refetch()}/>:announcements.data?.length?<div style={{display:'grid',gap:13}}>{announcements.data.slice(0,3).map(a=><div key={a.id} style={{borderTop:'1px solid hsl(var(--border))',paddingTop:12}}><div style={{display:'flex',justifyContent:'space-between',gap:10}}><b style={{fontSize:13}}>{a.title}</b>{!a.isRead&&<Pill tone="amber">New</Pill>}</div><div style={{fontSize:12,lineHeight:1.55,color:'hsl(var(--muted-foreground))',marginTop:5}}>{a.body}</div></div>)}</div>:<p style={{fontSize:13,color:'hsl(var(--muted-foreground))'}}>No notices at the moment.</p>}
        <Link href="/student/announcements" className="link" style={{fontSize:12,display:'inline-block',marginTop:15}}>View all notices <ChevronRight size={14} style={{verticalAlign:'middle'}}/></Link>
      </section>
    </div>
  </>;
}
function StudentEvents(){
  const [search,setSearch]=useState('');const [filter,setFilter]=useState<'upcoming'|'completed'|'all'>('upcoming');const [selected,setSelected]=useState<number|undefined>();
  const params=useMemo(()=>({status:filter,...(search?{search}:{})}),[filter,search]);const events=useListEvents(params);const detail=useGetEvent(selected||0,{query:{enabled:!!selected,queryKey:getGetEventQueryKey(selected||0)}});const register=useRegisterForEvent();const cancel=useCancelEventRegistration();const client=useQueryClient();
  const done=()=>{invalid(getListEventsQueryKey(),getGetStudentDashboardQueryKey());client.invalidateQueries({queryKey:['/api/events']});};
  const act=(e:Event)=>e.myRegistrationStatus==='registered'?cancel.mutate({eventId:e.id},{onSuccess:done}):register.mutate({eventId:e.id},{onSuccess:done});
  return <><Header title="Find an activity" subtitle="Choose a service opportunity and reserve your place."/>
    <div className="card" style={{display:'flex',gap:10,padding:12,marginBottom:18,flexWrap:'wrap'}}><label style={{flex:'1 1 250px',position:'relative'}}><Search size={16} style={{position:'absolute',left:12,top:13,color:'hsl(var(--muted-foreground))'}}/><input className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search activities or venues" style={{paddingLeft:37}} data-testid="input-event-search"/></label><select className="select" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)} style={{width:'auto',minWidth:150}} data-testid="select-event-filter"><option value="upcoming">Upcoming</option><option value="completed">Completed</option><option value="all">All activities</option></select></div>
    {events.isLoading?<Loading label="Loading activities"/>:events.error?<Problem error={events.error} retry={()=>void events.refetch()}/>:events.data?.length?<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,285px),1fr))',gap:15}}>{events.data.map((e,i)=><div key={e.id} onClick={ev=>{if(!(ev.target as HTMLElement).closest('button,a'))setSelected(e.id)}} style={{cursor:'pointer'}}><EventCard event={e} index={i} registered={e.myRegistrationStatus==='registered'} busy={register.isPending||cancel.isPending} onRegister={()=>act(e)} onCancel={()=>act(e)}/></div>)}</div>:<Empty title="No activities match just yet" body={search?'Try a different keyword or clear your search.':'Your NSS unit will publish new opportunities here.'} action={search?<button className="btn outline small" onClick={()=>setSearch('')}>Clear search</button>:undefined}/>}
    {detail.data&&<div role="dialog" aria-modal="true" onClick={()=>setSelected(undefined)} style={{position:'fixed',inset:0,background:'hsl(215 38% 17%/.35)',zIndex:25,display:'grid',placeItems:'center',padding:18}}><div className="card" onClick={e=>e.stopPropagation()} style={{width:'min(100%,520px)',padding:25,position:'relative'}}><button className="btn outline small" aria-label="Close details" onClick={()=>setSelected(undefined)} style={{position:'absolute',right:16,top:16}}><X size={15}/></button><div className="eyebrow">Activity details</div><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:28,margin:'10px 35px 8px 0'}}>{detail.data.title}</h2><p style={{color:'hsl(var(--muted-foreground))',lineHeight:1.7}}>{detail.data.description}</p><div style={{display:'grid',gap:8,fontSize:14,margin:'18px 0'}}><span>{date(detail.data.startsAt)} · {time(detail.data.startsAt)}–{time(detail.data.endsAt)}</span><span>Venue: {detail.data.venue}</span><span>Register by: {date(detail.data.registrationDeadline)}</span><span>{detail.data.volunteerHours} verified service hours</span></div><button className="btn" onClick={()=>act(detail.data!)} disabled={register.isPending||cancel.isPending}>{detail.data.myRegistrationStatus==='registered'?'Cancel registration':'Register for this activity'}</button></div></div>}
  </>;
}
function StudentAttendance(){
  const attendance=useListStudentAttendance();const dash=useGetStudentDashboard();
  return <><Header title="My service record" subtitle="A transparent history of attendance and verified service hours." action={<Link className="btn small" href="/student/attendance/scan"><QrCode size={16}/> Scan event QR</Link>}/>
    <div className="card" style={{padding:22,display:'flex',alignItems:'center',gap:18,marginBottom:22,background:'linear-gradient(110deg,hsl(var(--primary)),hsl(205 69% 43%))',color:'white'}}><div style={{width:54,height:54,borderRadius:16,display:'grid',placeItems:'center',background:'hsl(0 0% 100%/.15)'}}><ShieldCheck size={27}/></div><div><div className="eyebrow" style={{color:'hsl(195 75% 78%)'}}>Verified volunteer service</div><div style={{fontFamily:'var(--app-font-serif)',fontSize:32,fontWeight:800,letterSpacing:'-.05em',marginTop:3}}>{dash.data?.verifiedHours??'—'} <span style={{fontFamily:'var(--app-font-sans)',fontSize:14,fontWeight:600,letterSpacing:0}}>hours earned</span></div></div><div style={{marginLeft:'auto',textAlign:'right',fontSize:12,color:'hsl(210 35% 86%)'}}>Recorded by your<br/>NSS staff</div></div>
    <div className="card" style={{overflow:'hidden'}}><div style={{padding:'19px 22px',borderBottom:'1px solid hsl(var(--border))'}}><h2 style={{fontFamily:'var(--app-font-serif)',margin:0,fontSize:20}}>Attendance history</h2></div>
      {attendance.isLoading?<Loading/>:attendance.error?<Problem error={attendance.error} retry={()=>void attendance.refetch()}/>:attendance.data?.length?<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:700}}><thead><tr>{['Activity','Date','Venue','Attendance','Recorded at','Verified hours'].map(x=><th key={x} style={{textAlign:x==='Verified hours'?'right':'left',padding:'13px 20px',background:'hsl(var(--muted)/.55)',color:'hsl(var(--muted-foreground))',fontSize:11,textTransform:'uppercase',letterSpacing:'.08em'}}>{x}</th>)}</tr></thead><tbody>{attendance.data.map((a:AttendanceRecord)=><tr key={a.registrationId} style={{borderTop:'1px solid hsl(var(--border))'}}><td style={{padding:'15px 20px',fontWeight:700}}>{a.eventTitle}</td><td style={{padding:'15px 20px',color:'hsl(var(--muted-foreground))'}}>{date(a.eventDate)}</td><td style={{padding:'15px 20px',color:'hsl(var(--muted-foreground))'}}>{a.venue}</td><td style={{padding:'15px 20px'}}><Pill tone={a.status==='attended'?'green':'red'}>{a.status}</Pill></td><td style={{padding:'15px 20px',color:'hsl(var(--muted-foreground))'}}>{a.attendanceAt?new Date(a.attendanceAt).toLocaleString():'—'}</td><td style={{padding:'15px 20px',textAlign:'right',fontWeight:700}}>{a.verifiedHours} hrs</td></tr>)}</tbody></table></div>:<Empty title="Your verified record starts here" body="Once you attend an NSS activity and your staff records attendance, the verified hours will appear here."/>}</div>
  </>;
}

function StudentCertificates(){
  const certificates=useListStudentCertificates();
  const attendance=useListStudentAttendance();
  const request=useRequestVolunteerCertificate();
  const client=useQueryClient();
  const [error,setError]=useState('');
  const [downloading,setDownloading]=useState<string>();
  const items=certificates.data||[];
  const requestable=(attendance.data||[]).filter(record=>
    record.status==='attended'&&!items.some(item=>item.eventId===record.eventId),
  );
  const download=async(certificateId:string)=>{
    setError('');setDownloading(certificateId);
    try{
      const blob=await downloadVolunteerCertificate(certificateId);
      const url=URL.createObjectURL(blob);const link=document.createElement('a');
      link.href=url;link.download=`NSS-Certificate-${certificateId}.pdf`;link.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){setError(msgError(e));}
    finally{setDownloading(undefined);}
  };
  return <><Header title="My certificates" subtitle="Request certificates for verified service and download approved PDFs." action={<Link className="btn outline small" href="/certificates/verify">Verify a certificate</Link>}/>
    {error&&<div role="alert" style={{color:'hsl(var(--destructive))',fontSize:13,marginBottom:14}}>{error}</div>}
    <section className="card" style={{padding:20,marginBottom:18}}>
      <div className="eyebrow">Eligible service</div><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:21,margin:'7px 0 15px'}}>Request a certificate</h2>
      {attendance.isLoading?<Loading label="Checking verified attendance"/>:attendance.error?<Problem error={attendance.error} retry={()=>void attendance.refetch()}/>:requestable.length?<div style={{display:'grid',gap:10}}>{requestable.map(record=><div key={record.eventId} className="certificate-row"><div style={{minWidth:0}}><b>{record.eventTitle}</b><div style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginTop:4}}>{date(record.eventDate)} · {record.verifiedHours} verified hours</div></div><button className="btn small" disabled={request.isPending} onClick={()=>request.mutate({data:{eventId:record.eventId}},{onSuccess:()=>{setError('');void certificates.refetch();invalid(getListStudentAttendanceQueryKey())},onError:e=>setError(msgError(e))})}>{request.isPending?'Submitting…':'Request certificate'}</button></div>)}</div>:<p style={{margin:0,fontSize:13,lineHeight:1.6,color:'hsl(var(--muted-foreground))'}}>After staff verifies your attendance for a completed activity, it will appear here.</p>}
    </section>
    <section className="card" style={{padding:20}}>
      <div className="eyebrow">Request history</div><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:21,margin:'7px 0 15px'}}>Certificates</h2>
      {certificates.isLoading?<Loading label="Loading certificates"/>:certificates.error?<Problem error={certificates.error} retry={()=>void certificates.refetch()}/>:items.length?<div style={{display:'grid',gap:10}}>{items.map((item:VolunteerCertificate)=><article key={item.id} className="certificate-row"><div style={{minWidth:0,flex:1}}><div style={{display:'flex',gap:9,alignItems:'center',flexWrap:'wrap'}}><b>{item.eventTitle}</b><Pill tone={item.status==='approved'?'green':item.status==='rejected'?'red':'amber'}>{item.status}</Pill></div><div style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginTop:5}}>{item.volunteerHours} verified hours · Requested {date(item.requestedAt)}</div>{item.rejectionReason&&<p style={{margin:'8px 0 0',fontSize:13,color:'hsl(var(--destructive))'}}>Staff note: {item.rejectionReason}</p>}</div>{item.status==='approved'?<button className="btn small" disabled={downloading===item.certificateId} onClick={()=>void download(item.certificateId)}><ArrowDownToLine size={15}/>{downloading===item.certificateId?'Preparing…':'Download PDF'}</button>:item.status==='rejected'?<button className="btn outline small" disabled={request.isPending} onClick={()=>request.mutate({data:{eventId:item.eventId}},{onSuccess:()=>void certificates.refetch(),onError:e=>setError(msgError(e))})}>Request again</button>:<span style={{fontSize:12,color:'hsl(var(--muted-foreground))'}}>Awaiting staff review</span>}</article>)}</div>:<Empty title="No certificate requests yet" body="When staff verifies your completed service, you can request a certificate here."/>}
    </section>
  </>;
}

function VerifyCertificate(){
  const [certificateId,setCertificateId]=useState('');
  const [submitted,setSubmitted]=useState('');
  const verification=useVerifyVolunteerCertificate(submitted,{query:{queryKey:getVerifyVolunteerCertificateQueryKey(submitted),enabled:!!submitted,retry:false}});
  const search=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setSubmitted(certificateId.trim());};
  return <div className="grain" style={{minHeight:'100dvh',padding:'clamp(24px,6vw,72px) 18px',background:'hsl(var(--background))'}}>
    <div style={{maxWidth:680,margin:'0 auto'}}><Link href="/" className="brand-word" style={{fontSize:23,color:'hsl(var(--primary))'}}>NSS Connect</Link><section className="card" style={{padding:'clamp(18px,5vw,34px)',marginTop:28}}><div className="eyebrow">Public certificate verification</div><h1 style={{fontFamily:'var(--app-font-serif)',fontSize:'clamp(1.8rem,5vw,2.4rem)',margin:'8px 0'}}>Verify NSS service</h1><p style={{color:'hsl(var(--muted-foreground))',lineHeight:1.6}}>Enter the unique certificate ID to confirm it was issued by NSS Connect.</p><form onSubmit={search} style={{display:'flex',gap:9,flexWrap:'wrap'}}><input className="input" style={{flex:'1 1 220px'}} value={certificateId} onChange={e=>setCertificateId(e.target.value)} required maxLength={64} placeholder="e.g. NSS-…" aria-label="Certificate ID"/><button className="btn" disabled={verification.isFetching}>Verify ID</button></form>
      {submitted&&verification.isLoading&&<Loading label="Verifying certificate"/>}{submitted&&verification.error&&<div role="alert" style={{marginTop:18,padding:14,borderRadius:10,background:'hsl(0 70% 94%)',color:'hsl(0 66% 42%)'}}>No issued certificate was found for that ID.</div>}
      {verification.data&&<div role="status" style={{marginTop:20,padding:18,borderRadius:12,background:'hsl(154 47% 91%)',color:'hsl(155 48% 24%)'}}><div style={{display:'flex',gap:8,alignItems:'center',fontWeight:800}}><ShieldCheck size={18}/> Certificate verified</div><dl className="certificate-details">{[['Certificate ID',verification.data.certificateId],['Volunteer',verification.data.studentName],['College',verification.data.collegeName],['NSS unit',verification.data.unitName],['Activity',verification.data.eventTitle],['Verified hours',`${verification.data.volunteerHours} hours`],['Issued',date(verification.data.issuedAt)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>}
      <Link href="/" className="link" style={{display:'inline-block',marginTop:20}}>← NSS Connect home</Link></section></div>
  </div>;
}

function StudentQrScan(){
  const video=useRef<HTMLVideoElement>(null);const controls=useRef<{stop:()=>void}|null>(null);const submitting=useRef(false);
  const reader=useMemo(()=>new BrowserQRCodeReader(),[]);const submit=useSubmitQrAttendance();const [token,setToken]=useState('');const [error,setError]=useState('');const [complete,setComplete]=useState(false);
  const submitToken=useCallback((value:string)=>{
    if(submitting.current)return;
    submitting.current=true;setError('');
    submit.mutate({data:{token:value.trim()}},{onSuccess:()=>{setComplete(true);controls.current?.stop();invalid(getListStudentAttendanceQueryKey(),getGetStudentDashboardQueryKey())},onError:e=>{setError(msgError(e));submitting.current=false}});
  },[submit]);
  useEffect(()=>{
    if(!video.current)return;
    let disposed=false;
    void reader.decodeFromVideoDevice(undefined,video.current,(result)=>{
      if(result)submitToken(result.getText());
    }).then(scanner=>{if(disposed)scanner.stop();else controls.current=scanner}).catch(e=>setError(msgError(e)));
    return ()=>{disposed=true;controls.current?.stop();controls.current=null};
  },[reader,submitToken]);
  const manualSubmit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(token.trim())submitToken(token)};
  return <><Header title="Scan attendance QR" subtitle="Scan the current QR code shown by NSS staff, or enter its code manually."/>
    <div className="qr-scan-grid">
      <section className="card qr-scan-card"><div className="eyebrow">Camera scanner</div><div className="qr-video-frame"><video ref={video} aria-label="QR code camera preview" muted playsInline/></div><p style={{fontSize:13,color:'hsl(var(--muted-foreground))',lineHeight:1.55}}>Allow camera access to scan. Camera access requires HTTPS or localhost.</p></section>
      <section className="card qr-manual-card"><div className="eyebrow">Manual entry</div><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:21,margin:'8px 0 12px'}}>Enter the QR code</h2><form onSubmit={manualSubmit} style={{display:'grid',gap:12}}><label className="field">Attendance token<input className="input" value={token} onChange={e=>setToken(e.target.value)} minLength={32} maxLength={64} required autoComplete="off" data-testid="input-attendance-token"/></label><button className="btn" disabled={submit.isPending||complete}>{submit.isPending?'Verifying…':'Verify attendance'} <QrCode size={16}/></button></form>{error&&<div role="alert" style={{color:'hsl(var(--destructive))',fontSize:13,marginTop:12}}>{error}</div>}{complete&&<div role="status" style={{color:'hsl(155 48% 29%)',fontSize:14,marginTop:14}}>Attendance recorded successfully.</div>}<Link className="link" href="/student/attendance" style={{display:'inline-block',marginTop:20,fontSize:13}}>← Back to service record</Link></section>
    </div>
    <style>{`.qr-scan-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.qr-scan-card,.qr-manual-card{padding:clamp(16px,3vw,24px);min-width:0}.qr-video-frame{margin-top:14px;overflow:hidden;border-radius:12px;background:#101820;aspect-ratio:4/3}.qr-video-frame video{width:100%;height:100%;object-fit:cover}.qr-manual-card{align-self:start}@media(max-width:767px){.qr-scan-grid{grid-template-columns:1fr}}`}</style>
  </>;
}
function Announcements(){
  const items=useListAnnouncements();const mark=useMarkAnnouncementRead();
  return <><Header title="Notices" subtitle="Updates and important information from your NSS staff."/>
    {items.isLoading?<Loading label="Loading notices"/>:items.error?<Problem error={items.error} retry={()=>void items.refetch()}/>:items.data?.length?<div style={{display:'grid',gap:12}}>{items.data.map((a:Announcement)=><article className="card" key={a.id} style={{padding:'20px 22px',display:'flex',gap:16,alignItems:'flex-start',borderLeft:a.isRead?'1px solid hsl(var(--card-border))':'3px solid hsl(var(--primary))'}}><div style={{width:42,height:42,borderRadius:13,flexShrink:0,display:'grid',placeItems:'center',background:'hsl(var(--secondary))',color:'hsl(var(--primary))'}}><FileText size={19}/></div><div style={{flex:1}}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}><div><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:19,margin:'0 0 6px'}}>{a.title}</h2><div className="eyebrow">{date(a.createdAt)}{!a.isRead&&<span style={{marginLeft:9,color:'hsl(var(--primary))'}}>· New</span>}</div></div>{!a.isRead&&<button className="btn outline small" disabled={mark.isPending} onClick={()=>mark.mutate({announcementId:a.id},{onSuccess:()=>invalid(getListAnnouncementsQueryKey(),getGetStudentDashboardQueryKey())})} data-testid={`button-mark-read-${a.id}`}>Mark read <Check size={14}/></button>}</div><p style={{whiteSpace:'pre-wrap',lineHeight:1.7,fontSize:14,color:'hsl(var(--muted-foreground))',margin:'13px 0 0'}}>{a.body}</p></div></article>)}</div>:<Empty title="You’re all caught up" body="When your NSS unit shares a notice, you’ll find it here."/>}
  </>;
}
function Profile(){
  const profile=useGetStudentProfile();const update=useUpdateStudentProfile();const pass=useChangeStudentPassword();const [message,setMessage]=useState('');const [error,setError]=useState('');
  if(profile.isLoading)return <Loading/>;if(profile.error)return <Problem error={profile.error} retry={()=>void profile.refetch()}/>;
  const p=profile.data!;
  const save=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setMessage('');setError('');const f=new FormData(e.currentTarget);update.mutate({data:{department:String(f.get('department')),year:Number(f.get('year')),phone:String(f.get('phone'))}},{onSuccess:()=>{setMessage('Profile changes saved.');invalid(getGetStudentProfileQueryKey())},onError:e=>setError(msgError(e))});};
  const change=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setMessage('');setError('');const form=e.currentTarget;const f=new FormData(form);if(f.get('newPassword')!==f.get('confirm')){setError('The new passwords do not match.');return;}pass.mutate({data:{currentPassword:String(f.get('currentPassword')),newPassword:String(f.get('newPassword'))}},{onSuccess:()=>{setMessage('Password updated successfully.');form.reset()},onError:e=>setError(msgError(e))});};
  return <><Header title="My profile" subtitle="Keep your contact details current with your NSS unit."/>
    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.2fr) minmax(270px,.8fr)',gap:18,alignItems:'start'}}>
      <section className="card" style={{padding:24}}><div style={{display:'flex',gap:14,alignItems:'center',paddingBottom:20,borderBottom:'1px solid hsl(var(--border))',marginBottom:20}}><div style={{width:54,height:54,borderRadius:50,display:'grid',placeItems:'center',background:'hsl(var(--primary))',color:'white',fontSize:17,fontWeight:800}}>{initials(p.name)}</div><div><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:22,margin:0}}>{p.name}</h2><div style={{fontSize:13,color:'hsl(var(--muted-foreground))'}}>{p.studentId} · {p.role}</div></div><Pill tone="green">Verified</Pill></div>
        <form onSubmit={save} style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}><label className="field">Email address<input className="input" value={p.email} disabled/></label><label className="field">Student ID<input className="input" value={p.studentId} disabled/></label><label className="field">Department<input className="input" name="department" defaultValue={p.department} required maxLength={120} data-testid="input-profile-department"/></label><label className="field">Year<select className="select" name="year" defaultValue={p.year} data-testid="select-profile-year">{Array.from({length:8},(_,i)=><option key={i} value={i+1}>{i+1} year</option>)}</select></label><label className="field" style={{gridColumn:'1/-1'}}>Phone<input className="input" name="phone" defaultValue={p.phone||''} maxLength={40} data-testid="input-profile-phone"/></label>{message&&<div style={{gridColumn:'1/-1',color:'hsl(155 48% 29%)',fontSize:13}}>{message}</div>}{error&&<div style={{gridColumn:'1/-1',color:'hsl(var(--destructive))',fontSize:13}}>{error}</div>}<button className="btn" disabled={update.isPending} style={{gridColumn:'1/-1'}} data-testid="button-save-profile">{update.isPending?'Saving…':'Save profile'}</button></form>
      </section>
      <section className="card" style={{padding:23}}><div className="eyebrow">Account security</div><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:21,margin:'7px 0 17px'}}>Change password</h2><form onSubmit={change} style={{display:'grid',gap:12}}><label className="field">Current password<input className="input" name="currentPassword" type="password" required autoComplete="current-password"/></label><label className="field">New password<input className="input" name="newPassword" type="password" required minLength={10} autoComplete="new-password"/></label><label className="field">Confirm new password<input className="input" name="confirm" type="password" required minLength={10} autoComplete="new-password"/></label><button className="btn secondary" disabled={pass.isPending}>{pass.isPending?'Updating…':'Update password'}</button></form>
        <div style={{marginTop:22,padding:14,borderRadius:11,background:'hsl(var(--muted)/.65)',fontSize:12,lineHeight:1.55,color:'hsl(var(--muted-foreground))'}}><ShieldCheck size={15} style={{verticalAlign:'middle',marginRight:6}}/>Name, email and student ID are managed by your institution and cannot be edited here.</div>
      </section>
    </div>
  </>;
}

function StaffHome(){
  const query=useGetStaffDashboard();const report=useDownloadVolunteerHoursReport({query:{enabled:false,queryKey:['/api/staff/reports/volunteer-hours']}});
  const [reportError,setReportError]=useState('');
  const download=async()=>{setReportError('');try{const result=await report.refetch();if(result.data){const blob=result.data instanceof Blob?result.data:new Blob([result.data as unknown as BlobPart],{type:'text/csv'});const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download='nss-volunteer-hours.csv';a.click();URL.revokeObjectURL(href);}}catch(e){setReportError(msgError(e));}};
  if(query.isLoading)return <Loading label="Loading program overview"/>;if(query.error)return <Problem error={query.error} retry={()=>void query.refetch()}/>;
  const d=query.data!;
  return <><Header title="Staff dashboard" subtitle="Monitor NSS activities, registrations, attendance, and verified volunteer hours." action={<div style={{display:'flex',gap:9,flexWrap:'wrap'}}><Link href="/staff/programs" className="btn"><Plus size={16}/> Create NSS program</Link><button className="btn outline" onClick={download} disabled={report.isFetching} data-testid="button-download-report"><ArrowDownToLine size={17}/>{report.isFetching?'Preparing report…':'Download hours report'}</button></div>}/>
    {reportError&&<div role="alert" style={{color:'hsl(var(--destructive))',fontSize:13,marginBottom:14}}>{reportError}</div>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:13,marginBottom:26}}>{[{label:'Students',value:d.totalStudents,icon:Users},{label:'Upcoming activities',value:d.upcomingEvents,icon:CalendarDays},{label:'Completed',value:d.completedEvents,icon:Check},{label:'Registrations',value:d.totalRegistrations,icon:BookOpenCheck},{label:'Attended',value:d.attendedStudents,icon:ClipboardCheck},{label:'Verified hours',value:d.verifiedVolunteerHours,icon:Clock3}].map(({label,value,icon:Icon})=><div key={label} className="card" style={{padding:17}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',color:'hsl(var(--muted-foreground))',fontSize:11,fontWeight:700}}>{label}<Icon size={17} color="hsl(var(--primary))"/></div><div style={{fontFamily:'var(--app-font-serif)',fontWeight:800,fontSize:30,letterSpacing:'-.05em',marginTop:10}}>{value}</div></div>)}</div>
    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.3fr) minmax(260px,.8fr)',gap:18}}>
       <section className="card" style={{padding:21}}><div className="eyebrow">Operations</div><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:22,margin:'5px 0 17px'}}>Recent NSS activities</h2>{d.recentEvents?.length?<div style={{display:'grid',gap:11}}>{d.recentEvents.slice(0,5).map(e=><div key={e.id} style={{display:'flex',justifyContent:'space-between',gap:12,padding:'12px 0',borderTop:'1px solid hsl(var(--border))'}}><div><b style={{fontSize:14}}>{e.title}</b><div style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginTop:5}}>{date(e.startsAt)} · {e.registrationCount} registrations</div></div><Pill tone={e.status==='published'?'green':e.status==='draft'?'amber':'gray'}>{e.status}</Pill></div>)}</div>:<Empty title="Create your first NSS program" body="Create a service program, publish it, and invite student volunteers to take part." action={<Link className="btn small" href="/staff/programs">Create NSS program</Link>}/>}</section>
      <section className="card" style={{padding:21}}><div className="eyebrow">Latest registrations</div><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:22,margin:'5px 0 17px'}}>Volunteer activity</h2>{d.recentRegistrations?.length?<div style={{display:'grid',gap:12}}>{d.recentRegistrations.slice(0,6).map(r=><div key={r.id} style={{display:'flex',alignItems:'center',gap:10,borderTop:'1px solid hsl(var(--border))',paddingTop:11}}><div style={{width:34,height:34,borderRadius:50,display:'grid',placeItems:'center',background:'hsl(var(--secondary))',color:'hsl(var(--primary))',fontWeight:800,fontSize:11}}>{initials(r.studentName)}</div><div style={{flex:1,minWidth:0}}><b style={{fontSize:13,display:'block'}}>{r.studentName}</b><span style={{fontSize:11,color:'hsl(var(--muted-foreground))'}}>{r.eventTitle}</span></div><Pill tone={r.attendanceStatus==='attended'?'green':r.attendanceStatus==='absent'?'red':'amber'}>{r.attendanceStatus||'registered'}</Pill></div>)}</div>:<p style={{fontSize:13,color:'hsl(var(--muted-foreground))'}}>Student registrations will appear as they come in.</p>}</section>
    </div>
  </>;
}

function EventForm({event,onClose,onSaved}:{event?:Event;onClose:()=>void;onSaved:()=>void}){
  const create=useCreateEvent();const update=useUpdateEvent();const [error,setError]=useState('');
  const save=(ev:FormEvent<HTMLFormElement>)=>{ev.preventDefault();setError('');const f=new FormData(ev.currentTarget);const data:EventInput={title:String(f.get('title')),description:String(f.get('description')),startsAt:new Date(String(f.get('startsAt'))).toISOString(),endsAt:new Date(String(f.get('endsAt'))).toISOString(),venue:String(f.get('venue')),registrationDeadline:new Date(String(f.get('registrationDeadline'))).toISOString(),volunteerHours:Number(f.get('volunteerHours'))};
    const cb={onSuccess:()=>{invalid(getListEventsQueryKey(),getGetStaffDashboardQueryKey());onSaved();onClose()},onError:(e:unknown)=>setError(msgError(e))};
    if(event)update.mutate({eventId:event.id,data},{...cb});else create.mutate({data},{...cb});
  };
  const local=(v?:string)=>v?new Date(v).toISOString().slice(0,16):'';
  return <Modal title={event?'Edit NSS program':'Create an NSS program'} onClose={onClose}><form onSubmit={save} style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:13}}><label className="field" style={{gridColumn:'1/-1'}}>Program title<input className="input" name="title" defaultValue={event?.title} minLength={3} maxLength={180} required data-testid="input-event-title"/></label><label className="field" style={{gridColumn:'1/-1'}}>Program details<textarea className="textarea" name="description" defaultValue={event?.description} required data-testid="input-event-description"/></label><label className="field">Starts at<input className="input" name="startsAt" type="datetime-local" defaultValue={local(event?.startsAt)} required data-testid="input-event-start"/></label><label className="field">Ends at<input className="input" name="endsAt" type="datetime-local" defaultValue={local(event?.endsAt)} required data-testid="input-event-end"/></label><label className="field">Registration deadline<input className="input" name="registrationDeadline" type="datetime-local" defaultValue={local(event?.registrationDeadline)} required data-testid="input-event-deadline"/></label><label className="field">Verified service hours<input className="input" name="volunteerHours" type="number" min="0" max="24" step=".5" defaultValue={event?.volunteerHours??2} required data-testid="input-event-hours"/></label><label className="field" style={{gridColumn:'1/-1'}}>Venue<input className="input" name="venue" defaultValue={event?.venue} maxLength={180} required data-testid="input-event-venue"/></label>{error&&<div role="alert" style={{gridColumn:'1/-1',color:'hsl(var(--destructive))',fontSize:13}}>{error}</div>}<div style={{gridColumn:'1/-1',display:'flex',justifyContent:'flex-end',gap:9,marginTop:5}}><button type="button" className="btn outline" onClick={onClose}>Keep editing later</button><button className="btn" disabled={create.isPending||update.isPending}>{create.isPending||update.isPending?'Saving…':event?'Save changes':'Create program draft'}</button></div></form></Modal>;
}
function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){
  return <div role="dialog" aria-modal="true" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}} style={{position:'fixed',inset:0,zIndex:25,background:'hsl(215 38% 17%/.45)',display:'grid',placeItems:'center',padding:14}}><div className="card" style={{width:'min(100%,700px)',maxHeight:'92dvh',overflowY:'auto',padding:'23px clamp(16px,4vw,28px)',boxShadow:'var(--shadow-xl)'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:19}}><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:23,margin:0}}>{title}</h2><button type="button" className="btn outline small" aria-label="Close" onClick={onClose}><X size={16}/></button></div>{children}</div></div>;
}
function AttendanceQrModal({event,onClose}:{event:Event;onClose:()=>void}){
  const create=useCreateAttendanceQr();const revoke=useRevokeAttendanceQr();const [qr,setQr]=useState<AttendanceQrToken>();const [image,setImage]=useState('');const [error,setError]=useState('');const [now,setNow]=useState(Date.now());
  const remaining=qr?Math.max(0,Math.ceil((new Date(qr.expiresAt).getTime()-now)/1000)):0;
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer)},[]);
  useEffect(()=>{if(!qr)return;let cancelled=false;void QRCode.toDataURL(qr.token,{width:320,margin:2,errorCorrectionLevel:'M'}).then(data=>{if(!cancelled)setImage(data)}).catch(e=>{if(!cancelled)setError(msgError(e))});return()=>{cancelled=true}},[qr]);
  const createQr=()=>{setError('');setImage('');setQr(undefined);create.mutate({eventId:event.id,data:{expiresInSeconds:300}},{onSuccess:setQr,onError:e=>setError(msgError(e))})};
  const revokeQr=()=>{if(!qr)return;revoke.mutate({qrId:qr.id},{onSuccess:()=>{setQr(undefined);setImage('')},onError:e=>setError(msgError(e))})};
  return <Modal title={`Attendance QR · ${event.title}`} onClose={onClose}><div style={{display:'grid',justifyItems:'center',gap:13,textAlign:'center'}}>{qr&&remaining>0&&image?<><img src={image} alt="Short-lived event attendance QR code" width="320" height="320" style={{width:'min(100%,320px)',height:'auto',borderRadius:10,background:'white',padding:8}}/><b>Expires in {Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</b><p style={{margin:0,fontSize:13,color:'hsl(var(--muted-foreground))'}}>Only registered students can use this code. Each student can record attendance once.</p><button className="btn danger small" onClick={revokeQr} disabled={revoke.isPending}>{revoke.isPending?'Revoking…':'Expire this QR now'}</button></>:<><div style={{width:60,height:60,borderRadius:18,display:'grid',placeItems:'center',background:'hsl(var(--secondary))',color:'hsl(var(--primary))'}}><QrCode size={28}/></div><p style={{maxWidth:420,margin:'0 0 4px',fontSize:14,lineHeight:1.6,color:'hsl(var(--muted-foreground))'}}>Create an attendance window that expires after five minutes. Each registered student can use it once, and it can be revoked sooner at any time.</p><button className="btn" onClick={createQr} disabled={create.isPending}>{create.isPending?'Creating…':'Create attendance QR'} <QrCode size={16}/></button></>}{error&&<div role="alert" style={{color:'hsl(var(--destructive))',fontSize:13}}>{error}</div>}</div></Modal>;
}
function StaffEvents(){
  const [status,setStatus]=useState<'all'|'upcoming'|'completed'>('all');const [editing,setEditing]=useState<Event|undefined>();const [newOpen,setNewOpen]=useState(false);const [registrationsFor,setRegistrationsFor]=useState<number|undefined>();const [qrFor,setQrFor]=useState<Event>();
  const events=useListEvents({status});const regs=useListEventRegistrations(registrationsFor||0,{query:{enabled:!!registrationsFor,queryKey:getListEventRegistrationsQueryKey(registrationsFor||0)}});
  const publish=usePublishEvent();const cancel=useCancelEvent();const attendance=useRecordAttendance();
  const after=()=>invalid(getListEventsQueryKey(),getGetStaffDashboardQueryKey(),...(registrationsFor?[getListEventRegistrationsQueryKey(registrationsFor)]:[]));
  const [actionError,setActionError]=useState('');
  return <><Header title="NSS programs" subtitle="Create programs, monitor registrations, and record student attendance." action={<button className="btn" onClick={()=>{setEditing(undefined);setNewOpen(true)}} data-testid="button-create-nss-program"><Plus size={17}/> Create NSS program</button>}/>
    <div style={{display:'flex',gap:8,marginBottom:17,flexWrap:'wrap'}}>{(['all','upcoming','completed'] as const).map(s=><button key={s} className={`btn small ${status===s?'':'outline'}`} onClick={()=>setStatus(s)} style={{textTransform:'capitalize'}}>{s==='all'?'All activities':s}</button>)}</div>
    {actionError&&<div role="alert" style={{padding:12,marginBottom:12,borderRadius:9,background:'hsl(0 70% 94%)',color:'hsl(0 66% 42%)',fontSize:13}}>{actionError}</div>}
    {events.isLoading?<Loading/>:events.error?<Problem error={events.error} retry={()=>void events.refetch()}/>:events.data?.length?<div style={{display:'grid',gap:13}}>{events.data.map((e:Event)=> <article className="card" key={e.id} style={{padding:19,display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:16,alignItems:'center'}}>
      <div><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><Pill tone={e.status==='published'?'green':e.status==='draft'?'amber':e.status==='cancelled'?'red':'gray'}>{e.status}</Pill><span style={{fontSize:12,color:'hsl(var(--muted-foreground))'}}>{date(e.startsAt)} · {time(e.startsAt)}</span></div><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:20,margin:'9px 0 5px'}}>{e.title}</h2><div style={{fontSize:12,color:'hsl(var(--muted-foreground))'}}>{e.venue} · {e.registrationCount} registrations · {e.volunteerHours} service hours</div></div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:7,flexWrap:'wrap'}}><button className="btn outline small" onClick={()=>setRegistrationsFor(e.id)} data-testid={`button-registrations-${e.id}`}>Registrants</button>{e.status==='published'&&Date.now()>=new Date(e.startsAt).getTime()&&Date.now()<new Date(e.endsAt).getTime()&&<button className="btn secondary small" onClick={()=>setQrFor(e)} data-testid={`button-attendance-qr-${e.id}`}><QrCode size={14}/> Attendance QR</button>}{e.status==='draft'&&<button className="btn secondary small" disabled={publish.isPending} onClick={()=>publish.mutate({eventId:e.id},{onSuccess:after,onError:e=>setActionError(msgError(e))})} data-testid={`button-publish-event-${e.id}`}>Publish</button>}{e.status!=='cancelled'&&e.status!=='completed'&&<button className="btn outline small" onClick={()=>{setEditing(e);setNewOpen(true)}} data-testid={`button-edit-event-${e.id}`}>Edit</button>}{e.status==='published'&&<button className="btn danger small" disabled={cancel.isPending} onClick={()=>{if(confirm('Cancel this activity?'))cancel.mutate({eventId:e.id},{onSuccess:after,onError:e=>setActionError(msgError(e))})}} data-testid={`button-cancel-event-${e.id}`}>Cancel</button>}</div>
    </article>)}</div>:<Empty title="No NSS programs yet" body="Create a program draft, then publish it so student volunteers can register." action={<button className="btn small" onClick={()=>setNewOpen(true)}><Plus size={15}/> Create NSS program</button>}/>}
    {newOpen&&<EventForm event={editing} onClose={()=>{setNewOpen(false);setEditing(undefined)}} onSaved={()=>void events.refetch()}/>}
    {registrationsFor&&<Modal title="Activity registrants" onClose={()=>setRegistrationsFor(undefined)}>{regs.isLoading?<Loading/>:regs.error?<Problem error={regs.error} retry={()=>void regs.refetch()}/>:regs.data?.length?<div style={{display:'grid',gap:8}}>{regs.data.map((r:EventRegistration)=><div key={r.id} className="card" style={{padding:13,display:'grid',gridTemplateColumns:'minmax(130px,1fr) minmax(90px,.7fr) auto',gap:10,alignItems:'center'}}><div><b style={{fontSize:13}}>{r.studentName}</b><div style={{fontSize:11,color:'hsl(var(--muted-foreground))'}}>{r.studentCode} · {r.department}</div></div><Pill tone={r.attendanceStatus==='attended'?'green':r.attendanceStatus==='absent'?'red':'amber'}>{r.attendanceStatus||'pending'}</Pill><div style={{display:'flex',gap:6}}>{(['attended','absent'] as const).map(s=><button key={s} className={`btn small ${s==='absent'?'outline':'secondary'}`} disabled={attendance.isPending} onClick={()=>attendance.mutate({registrationId:r.id,data:{status:s}},{onSuccess:after,onError:e=>setActionError(msgError(e))})} data-testid={`button-attendance-${s}-${r.id}`}>{s==='attended'?'Present':'Absent'}</button>)}</div></div>)}</div>:<Empty title="No one has registered yet" body="Share this published activity with student volunteers to begin collecting registrations."/>}</Modal>}
    {qrFor&&<AttendanceQrModal event={qrFor} onClose={()=>setQrFor(undefined)}/>}
  </>;
}
function StaffAccounts(){
  const accounts=useListStaffAccounts();
  const create=useCreateStaffAccount();
  const remove=useDeleteStaffAccount();
  const [open,setOpen]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');

  const submit=(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    setError('');
    setSuccess('');
    const f=new FormData(e.currentTarget);
    const password=String(f.get('password'));
    const confirmPassword=String(f.get('confirmPassword'));
    if(password!==confirmPassword){
      setError('Password and Confirm Password must match.');
      return;
    }
    create.mutate({data:{
      name:String(f.get('name')).trim(),
      email:String(f.get('email')).trim(),
      password,
      confirmPassword,
    }},{onSuccess:()=>{
      setSuccess('Staff account created successfully.');
      setOpen(false);
      void accounts.refetch();
      invalid(getListStaffAccountsQueryKey());
    },onError:(e)=>setError(msgError(e))});
  };

  const total=accounts.data?.total ?? 0;
  const limit=accounts.data?.limit ?? 100;
  const atLimit=total>=limit;

  return <><Header title="Staff account management" subtitle="Create and manage authorized NSS staff accounts." action={
    <button className="btn" disabled={atLimit} onClick={()=>{setError('');setSuccess('');setOpen(true)}} data-testid="button-create-staff">
      <Plus size={16}/> Create staff
    </button>
  }/>
    <div className="card" style={{padding:'14px 18px',marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
      <b>Total Staff: {total}/{limit}</b>
      {atLimit&&<Pill tone="amber">Maximum staff limit reached</Pill>}
    </div>
    {success&&<div role="status" style={{color:'hsl(155 48% 29%)',fontSize:13,marginBottom:12}}>{success}</div>}
    {accounts.isLoading?<Loading/>:accounts.error?<Problem error={accounts.error} retry={()=>void accounts.refetch()}/>:accounts.data?.staff.length?
      <div className="card" style={{overflow:'hidden'}}><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:520,fontSize:13}}>
        <thead><tr>{['Staff name','Email address','Created','Action'].map(x=><th key={x} style={{padding:'14px 18px',textAlign:x==='Action'?'right':'left',background:'hsl(var(--muted)/.55)',fontSize:10,letterSpacing:'.08em',textTransform:'uppercase',color:'hsl(var(--muted-foreground))'}}>{x}</th>)}</tr></thead>
        <tbody>{accounts.data.staff.map((staff:StaffAccount)=><tr key={staff.id} style={{borderTop:'1px solid hsl(var(--border))'}}>
          <td style={{padding:'14px 18px'}}><div style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:34,height:34,borderRadius:50,display:'grid',placeItems:'center',background:'hsl(var(--secondary))',color:'hsl(var(--primary))',fontWeight:800,fontSize:11}}>{initials(staff.name)}</div><b>{staff.name}</b></div></td>
          <td style={{padding:'14px 18px',color:'hsl(var(--muted-foreground))'}}>{staff.email}</td>
          <td style={{padding:'14px 18px',fontSize:12,color:'hsl(var(--muted-foreground))'}}>{date(staff.createdAt)}</td>
          <td style={{padding:'14px 18px',textAlign:'right'}}><button className="btn danger small" disabled={remove.isPending} onClick={()=>{if(confirm(`Delete staff account ${staff.name}?`))remove.mutate({staffId:staff.id},{onSuccess:()=>{setSuccess('Staff account deleted successfully.');void accounts.refetch();invalid(getListStaffAccountsQueryKey())},onError:(e)=>setError(msgError(e))})}} data-testid={`button-delete-staff-${staff.id}`}>Delete</button></td>
        </tr>)}</tbody>
      </table></div></div>:<Empty title="No staff accounts yet" body="Create the first authorized staff account." action={<button className="btn small" disabled={atLimit} onClick={()=>setOpen(true)}>Create staff</button>}/>}
    {error&&<div role="alert" style={{color:'hsl(var(--destructive))',fontSize:13,marginTop:12}}>{error}</div>}
    {open&&<Modal title="Create staff account" onClose={()=>setOpen(false)}><form onSubmit={submit} style={{display:'grid',gap:14}}>
      <label className="field">Staff Full Name<input className="input" name="name" required minLength={2} maxLength={120} autoComplete="name" data-testid="input-staff-full-name"/></label>
      <label className="field">Staff Email Address<input className="input" type="email" name="email" required autoComplete="email" data-testid="input-staff-email"/></label>
      <label className="field">Password<input className="input" type="password" name="password" required minLength={12} maxLength={128} autoComplete="new-password" data-testid="input-staff-password"/></label>
      <label className="field">Confirm Password<input className="input" type="password" name="confirmPassword" required minLength={12} maxLength={128} autoComplete="new-password" data-testid="input-staff-confirm-password"/></label>
      {error&&<div role="alert" style={{color:'hsl(var(--destructive))',fontSize:13}}>{error}</div>}
      <div style={{display:'flex',justifyContent:'flex-end',gap:9}}><button type="button" className="btn outline" onClick={()=>setOpen(false)}>Cancel</button><button className="btn" disabled={create.isPending||atLimit} data-testid="button-submit-create-staff">{create.isPending?'Creating…':'Create Staff'}</button></div>
    </form></Modal>}
  </>;
}

function StaffStudents(){
  const [search,setSearch]=useState('');const params=useMemo(()=>search?{search}:undefined,[search]);const students=useListStudents(params);
  return <><Header title="Students" subtitle="Search your student volunteer roster and review verified service hours."/>
    <div className="card" style={{padding:12,marginBottom:16,position:'relative'}}><Search size={17} style={{position:'absolute',left:26,top:25,color:'hsl(var(--muted-foreground))'}}/><input className="input" placeholder="Search by name, student ID, department or email" value={search} onChange={e=>setSearch(e.target.value)} style={{paddingLeft:42}} data-testid="input-student-search"/></div>
    <div className="card" style={{overflow:'hidden'}}>{students.isLoading?<Loading/>:students.error?<Problem error={students.error} retry={()=>void students.refetch()}/>:students.data?.length?<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:650,fontSize:13}}><thead><tr>{['Student','Student ID','Department','Year','Phone','Verified hours'].map(x=><th key={x} style={{padding:'14px 18px',textAlign:x==='Verified hours'?'right':'left',background:'hsl(var(--muted)/.55)',fontSize:10,letterSpacing:'.08em',textTransform:'uppercase',color:'hsl(var(--muted-foreground))'}}>{x}</th>)}</tr></thead><tbody>{students.data.map((s:StudentProfile)=><tr key={s.id} style={{borderTop:'1px solid hsl(var(--border))'}}><td style={{padding:'14px 18px'}}><div style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:34,height:34,borderRadius:50,display:'grid',placeItems:'center',background:'hsl(var(--secondary))',color:'hsl(var(--primary))',fontWeight:800,fontSize:11}}>{initials(s.name)}</div><div><b>{s.name}</b><div style={{fontSize:11,color:'hsl(var(--muted-foreground))'}}>{s.email}</div></div></div></td><td style={{padding:'14px 18px',fontFamily:'var(--app-font-mono)',fontSize:12}}>{s.studentId}</td><td style={{padding:'14px 18px'}}>{s.department}</td><td style={{padding:'14px 18px'}}>{s.year}</td><td style={{padding:'14px 18px',color:'hsl(var(--muted-foreground))'}}>{s.phone||'—'}</td><td style={{padding:'14px 18px',textAlign:'right',fontWeight:800}}>{s.verifiedHours} hrs</td></tr>)}</tbody></table></div>:<Empty title={search?'No students match that search':'Your roster is ready to grow'} body={search?'Try a different name, student ID or department.':'Registered student volunteers will appear in this roster.'} action={search?<button className="btn outline small" onClick={()=>setSearch('')}>Clear search</button>:undefined}/>}</div>
  </>;
}
function StaffCertificates(){
  const [status,setStatus]=useState<'pending'|'approved'|'rejected'>('pending');
  const certificates=useListStaffCertificates({status});
  const approve=useApproveVolunteerCertificate();
  const reject=useRejectVolunteerCertificate();
  const [rejecting,setRejecting]=useState<StaffVolunteerCertificate>();
  const [error,setError]=useState('');
  const refresh=()=>{void certificates.refetch();invalid(certificates.queryKey);};
  const rejectRequest=(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(!rejecting)return;
    const form=new FormData(e.currentTarget);
    reject.mutate({certificateId:rejecting.certificateId,data:{reason:String(form.get('reason')).trim()}},{onSuccess:()=>{setRejecting(undefined);setError('');refresh()},onError:e=>setError(msgError(e))});
  };
  return <><Header title="Certificate review" subtitle="Review verified volunteer certificate requests before issuance."/>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>{(['pending','approved','rejected'] as const).map(value=><button key={value} className={`btn small ${status===value?'':'outline'}`} onClick={()=>setStatus(value)} style={{textTransform:'capitalize'}}>{value}</button>)}</div>
    {error&&<div role="alert" style={{color:'hsl(var(--destructive))',fontSize:13,marginBottom:12}}>{error}</div>}
    {certificates.isLoading?<Loading label="Loading certificate requests"/>:certificates.error?<Problem error={certificates.error} retry={()=>void certificates.refetch()}/>:certificates.data?.length?<div style={{display:'grid',gap:12}}>{certificates.data.map((item:StaffVolunteerCertificate)=><article key={item.id} className="card certificate-row"><div style={{minWidth:0,flex:1}}><div style={{display:'flex',gap:9,alignItems:'center',flexWrap:'wrap'}}><b>{item.eventTitle}</b><Pill tone={item.status==='approved'?'green':item.status==='rejected'?'red':'amber'}>{item.status}</Pill></div><div style={{fontSize:13,marginTop:8}}>{item.studentName} · {item.studentCode||item.studentEmail}</div><div style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginTop:4}}>{item.volunteerHours} verified hours · Requested {date(item.requestedAt)}</div>{item.rejectionReason&&<p style={{margin:'8px 0 0',fontSize:13,color:'hsl(var(--destructive))'}}>Reason: {item.rejectionReason}</p>}</div>{status==='pending'&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="btn small" disabled={approve.isPending} onClick={()=>{setError('');approve.mutate({certificateId:item.certificateId},{onSuccess:refresh,onError:e=>setError(msgError(e))})}}><Check size={15}/>{approve.isPending?'Issuing…':'Approve & issue'}</button><button className="btn danger small" onClick={()=>{setError('');setRejecting(item)}}>Reject</button></div>}</article>)}</div>:<Empty title={`No ${status} certificates`} body={status==='pending'?'New requests appear here after students have verified attendance.':`There are no ${status} certificate records to show.`}/>}
    {rejecting&&<Modal title="Reject certificate request" onClose={()=>setRejecting(undefined)}><form onSubmit={rejectRequest} style={{display:'grid',gap:13}}><p style={{margin:0,fontSize:14,color:'hsl(var(--muted-foreground))'}}>Explain why the request for {rejecting.studentName} was not approved. The student can see this note.</p><label className="field">Reason<textarea className="textarea" name="reason" required minLength={3} maxLength={500}/></label>{error&&<div role="alert" style={{color:'hsl(var(--destructive))',fontSize:13}}>{error}</div>}<div style={{display:'flex',justifyContent:'flex-end',gap:8}}><button type="button" className="btn outline" onClick={()=>setRejecting(undefined)}>Cancel</button><button className="btn danger" disabled={reject.isPending}>{reject.isPending?'Submitting…':'Reject request'}</button></div></form></Modal>}
  </>;
}
function AnnouncementForm({item,onClose}:{item?:Announcement;onClose:()=>void}){
  const create=useCreateAnnouncement();const update=useUpdateAnnouncement();const [error,setError]=useState('');
  const save=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setError('');const f=new FormData(e.currentTarget);const data={title:String(f.get('title')),body:String(f.get('body'))};const cb={onSuccess:()=>{invalid(getListManageAnnouncementsQueryKey(),getListAnnouncementsQueryKey());onClose()},onError:(e:unknown)=>setError(msgError(e))};if(item)update.mutate({announcementId:item.id,data},{...cb});else create.mutate({data},{...cb});};
  return <Modal title={item?'Edit notice':'Write a notice'} onClose={onClose}><form onSubmit={save} style={{display:'grid',gap:14}}><label className="field">Notice title<input className="input" name="title" required minLength={3} maxLength={180} defaultValue={item?.title} data-testid="input-announcement-title"/></label><label className="field">Message<textarea className="textarea" name="body" required defaultValue={item?.body} style={{minHeight:170}} data-testid="input-announcement-body"/></label>{error&&<div role="alert" style={{color:'hsl(var(--destructive))',fontSize:13}}>{error}</div>}<div style={{display:'flex',justifyContent:'flex-end',gap:9}}><button type="button" className="btn outline" onClick={onClose}>Cancel</button><button className="btn" disabled={create.isPending||update.isPending}>{create.isPending||update.isPending?'Saving…':item?'Save edits':'Create notice'}</button></div></form></Modal>;
}
function StaffAnnouncements(){
  const items=useListManageAnnouncements();const [editing,setEditing]=useState<Announcement|undefined>();const [open,setOpen]=useState(false);const publish=useUpdateAnnouncement();const remove=useDeleteAnnouncement();const [error,setError]=useState('');
  return <><Header title="Notices" subtitle="Publish timely information to the student volunteer community." action={<button className="btn" onClick={()=>{setEditing(undefined);setOpen(true)}}><Plus size={17}/> Write a notice</button>}/>
    {error&&<div role="alert" style={{color:'hsl(var(--destructive))',fontSize:13,marginBottom:12}}>{error}</div>}
    {items.isLoading?<Loading/>:items.error?<Problem error={items.error} retry={()=>void items.refetch()}/>:items.data?.length?<div style={{display:'grid',gap:12}}>{items.data.map((a:Announcement)=><article key={a.id} className="card" style={{padding:20,display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:15,alignItems:'center'}}><div><div style={{display:'flex',alignItems:'center',gap:9}}><Pill tone={a.published?'green':'amber'}>{a.published?'Published':'Draft'}</Pill><span className="eyebrow">{date(a.createdAt)}</span></div><h2 style={{fontFamily:'var(--app-font-serif)',fontSize:19,margin:'9px 0 5px'}}>{a.title}</h2><p style={{fontSize:13,lineHeight:1.6,color:'hsl(var(--muted-foreground))',margin:0,whiteSpace:'pre-wrap'}}>{a.body}</p></div><div style={{display:'flex',gap:7,flexWrap:'wrap',justifyContent:'flex-end'}}>{!a.published&&<button className="btn secondary small" disabled={publish.isPending} onClick={()=>publish.mutate({announcementId:a.id,data:{published:true}},{onSuccess:()=>invalid(getListManageAnnouncementsQueryKey(),getListAnnouncementsQueryKey()),onError:e=>setError(msgError(e))})} data-testid={`button-publish-announcement-${a.id}`}>Publish</button>}<button className="btn outline small" onClick={()=>{setEditing(a);setOpen(true)}} data-testid={`button-edit-announcement-${a.id}`}>Edit</button><button className="btn danger small" disabled={remove.isPending} onClick={()=>{if(confirm('Delete this notice?'))remove.mutate({announcementId:a.id},{onSuccess:()=>invalid(getListManageAnnouncementsQueryKey(),getListAnnouncementsQueryKey()),onError:e=>setError(msgError(e))})}} data-testid={`button-delete-announcement-${a.id}`}>Delete</button></div></article>)}</div>:<Empty title="No notices published yet" body="Create a draft for your next update, then publish it when students are ready to see it." action={<button className="btn small" onClick={()=>setOpen(true)}><Plus size={15}/> Write a notice</button>}/>}
    {open&&<AnnouncementForm item={editing} onClose={()=>{setOpen(false);setEditing(undefined)}}/>}
  </>;
}

function Routed({component:Component,role}:{component:()=>ReactNode;role?:'student'|'staff'}){
  return role?<RequireRole role={role}><Component/></RequireRole>:<Component/>;
}
function Router(){
  return <Switch>
    <Route path="/" component={Landing}/><Route path="/login"><Login/></Route><Route path="/staff/login"><Login staff/></Route><Route path="/staff/signup" component={StaffSignup}/><Route path="/staff/reset-password" component={StaffPasswordReset}/><Route path="/signup" component={Signup}/>
    <Route path="/student"><Routed component={StudentHome} role="student"/></Route>
    <Route path="/student/events"><Routed component={StudentEvents} role="student"/></Route>
    <Route path="/student/attendance"><Routed component={StudentAttendance} role="student"/></Route>
    <Route path="/student/attendance/scan"><Routed component={StudentQrScan} role="student"/></Route>
    <Route path="/student/certificates"><Routed component={StudentCertificates} role="student"/></Route>
    <Route path="/student/announcements"><Routed component={Announcements} role="student"/></Route>
    <Route path="/student/profile"><Routed component={Profile} role="student"/></Route>
    <Route path="/staff"><Routed component={StaffHome} role="staff"/></Route>
    <Route path="/staff/dashboard"><Routed component={StaffHome} role="staff"/></Route>
    <Route path="/staff/programs"><Routed component={StaffEvents} role="staff"/></Route>
    <Route path="/staff/events"><Routed component={StaffEvents} role="staff"/></Route>
    <Route path="/staff/students"><Routed component={StaffStudents} role="staff"/></Route>
    <Route path="/staff/accounts"><Routed component={StaffAccounts} role="staff"/></Route>
    <Route path="/staff/certificates"><Routed component={StaffCertificates} role="staff"/></Route>
    <Route path="/staff/notices"><Routed component={StaffAnnouncements} role="staff"/></Route>
    <Route path="/staff/announcements"><Routed component={StaffAnnouncements} role="staff"/></Route>
    <Route path="/certificates/verify" component={VerifyCertificate}/>
    <Route><NotFound/></Route>
  </Switch>;
}
function NotFound(){return <div style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:24,textAlign:'center'}}><div><div className="eyebrow">404 / Not found</div><h1 style={{fontFamily:'var(--app-font-serif)',fontSize:44,margin:'10px 0'}}>That page isn’t here.</h1><p style={{color:'hsl(var(--muted-foreground))'}}>The route may have moved, or you may not have access.</p><Link className="btn" href="/">Return to NSS Connect</Link></div></div>}
function App(){return <QueryClientProvider client={queryClient}><Router/></QueryClientProvider>}
export default App;
