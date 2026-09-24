import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import cors from 'cors';
import { SERVICES_DATA } from '../src/data/services';
import { PROJECTS_DATA } from '../src/data/projects';

type User = { id:string; name:string; email:string; passwordHash?:string; provider:string; role:'admin'|'user'; avatar?:string; createdAt:string };
type Lead = { id:string; type:'quote'|'contact'; createdAt:string; status:'new'|'read'|'closed'; name:string; company?:string; phone?:string; email?:string; service?:string; location?:string; description?:string; message?:string };
type SiteSettings = { companyName:string; slogan:string; phone:string; whatsapp:string; email:string; address:string; maintenanceMode:boolean };

const defaultSettings: SiteSettings = {
  companyName:'INFOR IEST – Comércio e Serviços, LDA.',
  slogan:'Tecnologia que Resolve • Inovação que Transforma',
  phone:'+244 921 382 205', whatsapp:'+244 953 505 318', email:'geral@inforiest.ao',
  address:'Km 44, Bairro 44, EN230, Icolo e Bengo, Angola', maintenanceMode:false
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized:false } : undefined, max: 5 });
let initPromise: Promise<void> | null = null;

export async function initDb(){
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
  if(initPromise) return initPromise;
  initPromise = (async()=>{
    await pool.query(`CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, password_hash text, provider text NOT NULL, role text NOT NULL DEFAULT 'user', avatar text, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS leads (id uuid PRIMARY KEY, type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'new', name text NOT NULL, company text, phone text, email text, service text, location text, description text, message text);
      CREATE TABLE IF NOT EXISTS site_settings (id integer PRIMARY KEY CHECK (id=1), company_name text NOT NULL, slogan text NOT NULL, phone text NOT NULL, whatsapp text NOT NULL, email text NOT NULL, address text NOT NULL, maintenance_mode boolean NOT NULL DEFAULT false);
      CREATE TABLE IF NOT EXISTS sessions (token text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
      CREATE TABLE IF NOT EXISTS oauth_states (state text PRIMARY KEY, provider text NOT NULL, expires_at timestamptz NOT NULL);`);
    await pool.query(`INSERT INTO site_settings (id,company_name,slogan,phone,whatsapp,email,address,maintenance_mode) VALUES (1,$1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`, [defaultSettings.companyName,defaultSettings.slogan,defaultSettings.phone,defaultSettings.whatsapp,defaultSettings.email,defaultSettings.address,false]);
    const adminEmail=(process.env.ADMIN_EMAIL||'admin@inforiest.ao').toLowerCase();
    const exists=await pool.query('SELECT id FROM users WHERE lower(email)=lower($1)',[adminEmail]);
    if(!exists.rowCount){ await pool.query('INSERT INTO users (id,name,email,password_hash,provider,role) VALUES ($1,$2,$3,$4,$5,$6)',[crypto.randomUUID(),'Administrador',adminEmail,hashPassword(process.env.ADMIN_PASSWORD||'Admin@12345'),'local','admin']); }
  })().catch(e=>{initPromise=null;throw e});
  return initPromise;
}

function hashPassword(password:string,salt=crypto.randomBytes(16).toString('hex')){ return `${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`; }
function verifyPassword(password:string,encoded?:string){ if(!encoded)return false; const [salt,expected]=encoded.split(':'); if(!salt||!expected)return false; const actual=crypto.scryptSync(password,salt,64).toString('hex'); return actual.length===expected.length && crypto.timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex')); }
function publicUser(u:any){return {id:u.id,name:u.name,email:u.email,provider:u.provider,role:u.role,avatar:u.avatar,createdAt:u.created_at||u.createdAt};}
function cookie(req:express.Request,name:string){ return req.headers.cookie?.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1]; }
function isProduction(){return process.env.NODE_ENV==='production';}
function cookieFlags(){return `HttpOnly; Path=/; SameSite=${isProduction()?'None':'Lax'}; Max-Age=604800${isProduction()?'; Secure':''}`;}
async function sessionUser(req:express.Request){ const token=cookie(req,'sid'); if(!token)return null; const r=await pool.query(`SELECT u.*, s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at>now()`,[token]); return r.rows[0] ? {token,user:r.rows[0]} : null; }
async function requireAuth(req:express.Request,res:express.Response,role?:'admin'|'user'){ const s=await sessionUser(req); if(!s){res.status(401).json({error:'Não autenticado'});return null;} if(role&&s.user.role!==role){res.status(403).json({error:'Acesso reservado ao administrador'});return null;} return s.user; }
async function setSession(res:express.Response,userId:string){ const token=crypto.randomBytes(32).toString('hex'); await pool.query('INSERT INTO sessions(token,user_id,expires_at) VALUES($1,$2,now()+interval \'7 days\')',[token,userId]); res.setHeader('Set-Cookie',`sid=${token}; ${cookieFlags()}`); }
function frontendUrl(){return (process.env.FRONTEND_URL||'http://localhost:5173').replace(/\/$/,'');}

export const app=express();
app.set('trust proxy',1);
app.use(cors({origin:(origin,cb)=>{const allowed=(process.env.FRONTEND_URL||'http://localhost:5173').split(',').map(x=>x.trim()); if(!origin||allowed.includes(origin))cb(null,true); else cb(new Error('Origin não autorizada'));},credentials:true}));
app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:true}));
app.use(async(_req,res,next)=>{try{await initDb();next();}catch(e){console.error(e);res.status(500).json({error:'Base de dados não configurada ou indisponível.'});}});

app.get('/api/health',async(_req,res)=>res.json({ok:true,service:'INFOR IEST API',database:'postgresql'}));
app.get('/api/site',async(_req,res)=>{const s=await pool.query('SELECT company_name,slogan,phone,whatsapp,email,address,maintenance_mode FROM site_settings WHERE id=1'); res.json({settings:s.rows[0],services:SERVICES_DATA,projects:PROJECTS_DATA});});
app.get('/api/auth/me',async(req,res)=>{const s=await sessionUser(req);res.json({user:s?.user?publicUser(s.user):null});});
app.post('/api/auth/login',async(req,res)=>{const {email,password}=req.body||{};const r=await pool.query("SELECT * FROM users WHERE lower(email)=lower($1) AND provider='local'",[String(email||'').trim()]);const u=r.rows[0];if(!u||!verifyPassword(String(password||''),u.password_hash))return res.status(401).json({error:'E-mail ou palavra-passe inválidos.'});await setSession(res,u.id);res.json({user:publicUser(u)});});
app.post('/api/auth/logout',async(req,res)=>{const t=cookie(req,'sid');if(t)await pool.query('DELETE FROM sessions WHERE token=$1',[t]);res.setHeader('Set-Cookie',`sid=; ${cookieFlags()}; Max-Age=0`);res.json({ok:true});});

function oauthConfig(provider:'google'|'github'){return provider==='google'?{id:process.env.GOOGLE_CLIENT_ID,secret:process.env.GOOGLE_CLIENT_SECRET,redirect:process.env.GOOGLE_CALLBACK_URL||`${process.env.BACKEND_URL||'http://localhost:3000'}/api/auth/google/callback`}:{id:process.env.GITHUB_CLIENT_ID,secret:process.env.GITHUB_CLIENT_SECRET,redirect:process.env.GITHUB_CALLBACK_URL||`${process.env.BACKEND_URL||'http://localhost:3000'}/api/auth/github/callback`};}
app.get('/api/auth/:provider',async(req,res)=>{const provider=req.params.provider as 'google'|'github';if(!['google','github'].includes(provider))return res.status(404).send('Provider inválido');const c=oauthConfig(provider);if(!c.id||!c.secret)return res.redirect(`${frontendUrl()}/login?error=oauth_not_configured`);const state=crypto.randomBytes(24).toString('hex');await pool.query('INSERT INTO oauth_states(state,provider,expires_at) VALUES($1,$2,now()+interval \'10 minutes\')',[state,provider]);res.setHeader('Set-Cookie',`oauth_state=${state}; ${cookieFlags()}; Max-Age=600`);const url=provider==='google'?`https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(c.id)}&redirect_uri=${encodeURIComponent(c.redirect)}&response_type=code&scope=${encodeURIComponent('openid email profile')}&state=${state}`:`https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(c.id)}&redirect_uri=${encodeURIComponent(c.redirect)}&scope=${encodeURIComponent('read:user user:email')}&state=${state}`;res.redirect(url);});

async function oauthCallback(provider:'google'|'github',req:express.Request,res:express.Response){const state=String(req.query.state||'');const sr=await pool.query('DELETE FROM oauth_states WHERE state=$1 AND provider=$2 AND expires_at>now() RETURNING state',[state,provider]);if(!sr.rowCount)return res.redirect(`${frontendUrl()}/login?error=invalid_state`);const code=String(req.query.code||'');if(!code)return res.redirect(`${frontendUrl()}/login?error=oauth_cancelled`);const c=oauthConfig(provider);try{let profile:{id:string;name:string;email:string;avatar?:string};if(provider==='google'){const tr=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:c.id!,client_secret:c.secret!,redirect_uri:c.redirect,grant_type:'authorization_code'})});const tok=await tr.json() as any;if(!tok.access_token)throw new Error('Token Google inválido');const p=await(await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${tok.access_token}`}})).json() as any;profile={id:p.sub,name:p.name||p.email,email:p.email,avatar:p.picture};}else{const tr=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({client_id:c.id,client_secret:c.secret,code,redirect_uri:c.redirect,state})});const tok=await tr.json() as any;if(!tok.access_token)throw new Error('Token GitHub inválido');const headers={Authorization:`Bearer ${tok.access_token}`,Accept:'application/vnd.github+json','User-Agent':'INFOR-IEST'};const p=await(await fetch('https://api.github.com/user',{headers})).json() as any;let email=p.email as string|null;if(!email){const es=await(await fetch('https://api.github.com/user/emails',{headers})).json() as any[];email=es.find(e=>e.primary)?.email||es[0]?.email;}if(!email)throw new Error('O GitHub não disponibilizou e-mail.');profile={id:String(p.id),name:p.name||p.login,email,avatar:p.avatar_url};}
let ur=await pool.query('SELECT * FROM users WHERE lower(email)=lower($1)',[profile.email]);let u=ur.rows[0];if(!u){u={id:crypto.randomUUID(),name:profile.name,email:profile.email,provider,avatar:profile.avatar,role:'user'};await pool.query('INSERT INTO users(id,name,email,provider,role,avatar) VALUES($1,$2,$3,$4,$5,$6)',[u.id,u.name,u.email,u.provider,u.role,u.avatar]);}await setSession(res,u.id);res.redirect(`${frontendUrl()}${u.role==='admin'?'/admin':'/?login=success'}`);}catch(e){console.error(e);res.redirect(`${frontendUrl()}/login?error=oauth_failed`);}}
app.get('/api/auth/google/callback',(req,res)=>oauthCallback('google',req,res));
app.get('/api/auth/github/callback',(req,res)=>oauthCallback('github',req,res));

app.post('/api/leads',async(req,res)=>{const b=req.body||{};if(!b.name||(!b.phone&&!b.email))return res.status(400).json({error:'Informe o nome e pelo menos um contacto.'});const id=crypto.randomUUID();await pool.query(`INSERT INTO leads(id,type,name,company,phone,email,service,location,description,message) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,b.type==='contact'?'contact':'quote',String(b.name),b.company||null,b.phone||null,b.email||null,b.service||null,b.location||null,b.description||null,b.message||null]);res.status(201).json({ok:true,leadId:id});});
app.get('/api/admin/dashboard',async(req,res)=>{if(!await requireAuth(req,res,'admin'))return;const [stats,leads,users,settings]=await Promise.all([pool.query(`SELECT (SELECT count(*) FROM leads) leads,(SELECT count(*) FROM leads WHERE status='new') new_leads,(SELECT count(*) FROM users) users`),pool.query('SELECT * FROM leads ORDER BY created_at DESC LIMIT 100'),pool.query('SELECT id,name,email,provider,role,avatar,created_at FROM users ORDER BY created_at DESC'),pool.query('SELECT company_name,slogan,phone,whatsapp,email,address,maintenance_mode FROM site_settings WHERE id=1')]);res.json({stats:{leads:Number(stats.rows[0].leads),newLeads:Number(stats.rows[0].new_leads),users:Number(stats.rows[0].users),services:SERVICES_DATA.length,projects:PROJECTS_DATA.length},settings:settings.rows[0],leads:leads.rows,users:users.rows.map(publicUser)});});
app.patch('/api/admin/settings',async(req,res)=>{if(!await requireAuth(req,res,'admin'))return;const b=req.body||{};await pool.query(`UPDATE site_settings SET company_name=COALESCE($1,company_name),slogan=COALESCE($2,slogan),phone=COALESCE($3,phone),whatsapp=COALESCE($4,whatsapp),email=COALESCE($5,email),address=COALESCE($6,address),maintenance_mode=COALESCE($7,maintenance_mode) WHERE id=1`,[b.companyName,b.slogan,b.phone,b.whatsapp,b.email,b.address,b.maintenanceMode]);const r=await pool.query('SELECT company_name,slogan,phone,whatsapp,email,address,maintenance_mode FROM site_settings WHERE id=1');res.json({settings:r.rows[0]});});
app.patch('/api/admin/leads/:id',async(req,res)=>{if(!await requireAuth(req,res,'admin'))return;const st=req.body?.status;if(!['new','read','closed'].includes(st))return res.status(400).json({error:'Estado inválido.'});const r=await pool.query('UPDATE leads SET status=$1 WHERE id=$2 RETURNING *',[st,req.params.id]);if(!r.rowCount)return res.status(404).json({error:'Pedido não encontrado.'});res.json({lead:r.rows[0]});});

export default app;
