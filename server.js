import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.urlencoded({extended:true}));

const PORT = Number(process.env.PORT || 3000);
const PASSWORD = process.env.DASHBOARD_PASSWORD || 'change-me';
const QR_URL = 'https://www.tiktok.com/login/qrcode';
const HOME_URL = 'https://www.tiktok.com/';
const DATA_DIR = '/tmp/tiktok-railway-session';
const STATE_FILE = path.join(DATA_DIR, 'storageState.json');
fs.mkdirSync(DATA_DIR, {recursive:true});

let browser = null;
let context = null;
let page = null;
let status = {
  mode: 'starting',
  loggedIn: false,
  url: '',
  title: '',
  error: null,
  savedAt: null,
  lastCheck: null
};

function basicAuth(req,res,next){
  const h = req.headers.authorization || '';
  if(h.startsWith('Basic ')){
    try{
      const [user,pass] = Buffer.from(h.slice(6),'base64').toString('utf8').split(':');
      if(user === 'admin' && pass === PASSWORD) return next();
    }catch{}
  }
  res.set('WWW-Authenticate','Basic realm="TikTok Railway Login"');
  return res.status(401).send('Authentication required');
}

async function ensureBrowser(){
  if(browser && context && page) return;
  browser = await chromium.launch({
    headless:true,
    args:[
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  });
  const options = {
    viewport:{width:1280,height:900},
    locale:'en-US'
  };
  if(fs.existsSync(STATE_FILE)){
    try{ options.storageState = STATE_FILE; }catch{}
  }
  context = await browser.newContext(options);
  page = await context.newPage();
}

async function refreshMeta(){
  try{
    status.url = page?.url() || '';
    status.title = page ? await page.title() : '';
  }catch{}
}

async function detectLogin(){
  try{
    if(!context || !page) return false;
    const cookies = await context.cookies();
    const sessionCookie = cookies.some(c => ['sessionid','sessionid_ss','sid_tt','sid_guard'].includes(c.name));
    const u = page.url();
    const notLoginPage = !/\/login(?:\/|\?|$)/i.test(u);
    status.loggedIn = Boolean(sessionCookie && notLoginPage);
    status.lastCheck = new Date().toISOString();

    if(status.loggedIn){
      await context.storageState({path:STATE_FILE});
      status.savedAt = new Date().toISOString();
      status.mode = 'logged-in';
    }
    await refreshMeta();
    return status.loggedIn;
  }catch(e){
    status.error = e?.message || String(e);
    return false;
  }
}

async function openQr(){
  try{
    await ensureBrowser();
    status.mode = 'opening-qr';
    status.error = null;
    await page.goto(QR_URL,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(3500);
    await refreshMeta();
    status.mode = 'qr-ready';
    console.log('QR_READY', JSON.stringify({url:status.url,title:status.title}));
  }catch(e){
    status.mode = 'error';
    status.error = e?.message || String(e);
    console.log('QR_ERROR', status.error);
  }
}

async function openHome(){
  try{
    await ensureBrowser();
    status.mode = 'opening-home';
    status.error = null;
    await page.goto(HOME_URL,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(3000);
    await detectLogin();
    if(!status.loggedIn) status.mode = 'home-opened';
  }catch(e){
    status.mode = 'error';
    status.error = e?.message || String(e);
  }
}

async function screenshot(){
  await ensureBrowser();
  return await page.screenshot({fullPage:false});
}

app.get('/health',(_,res)=>res.json({ok:true,mode:status.mode}));

app.use(basicAuth);

app.get('/api/status',async(_,res)=>{
  await detectLogin();
  res.json(status);
});

app.get('/screenshot.png',async(_,res)=>{
  try{
    const img = await screenshot();
    res.set('Cache-Control','no-store');
    res.type('png').send(img);
  }catch(e){
    res.status(500).send(e?.message || String(e));
  }
});

app.post('/qr',async(_,res)=>{
  await openQr();
  res.redirect('/');
});

app.post('/refresh-qr',async(_,res)=>{
  await openQr();
  res.redirect('/');
});

app.post('/check',async(_,res)=>{
  await detectLogin();
  res.redirect('/');
});

app.post('/home',async(_,res)=>{
  await openHome();
  res.redirect('/');
});

app.get('/',async(_,res)=>{
  if(!page) await openQr();
  await detectLogin();
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  res.send(`<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TikTok Railway QR Login</title>
<style>
body{font-family:system-ui;background:#0f172a;color:#fff;margin:0}.wrap{max-width:1050px;margin:auto;padding:20px}
.card{background:#1e293b;border-radius:14px;padding:16px;margin:12px 0}
button{padding:11px 16px;border:0;border-radius:9px;margin:4px;font-weight:700;cursor:pointer}
.blue{background:#3b82f6;color:#fff}.green{background:#10b981}.gray{background:#475569;color:#fff}
.ok{color:#86efac}.bad{color:#fca5a5}.muted{color:#cbd5e1}
img{max-width:100%;border:1px solid #475569;border-radius:10px;background:white}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:800px){.grid{grid-template-columns:1fr}}
code{word-break:break-all}
</style></head><body><div class="wrap">
<h1>TikTok Railway QR Login</h1>
<div class="card">
<div>สถานะ: <b id="mode">${esc(status.mode)}</b></div>
<div>Login: <b id="login" class="${status.loggedIn?'ok':'bad'}">${status.loggedIn?'ล็อกอินแล้ว':'ยังไม่ล็อกอิน'}</b></div>
<div class="muted">URL: <code id="url">${esc(status.url)}</code></div>
<div class="muted">Title: <span id="title">${esc(status.title)}</span></div>
<div class="bad" id="error">${esc(status.error||'')}</div>
</div>

<div class="card">
<form method="post" action="/qr" style="display:inline"><button class="blue">เปิด QR Login</button></form>
<form method="post" action="/refresh-qr" style="display:inline"><button class="gray">สร้าง/รีเฟรช QR ใหม่</button></form>
<form method="post" action="/check" style="display:inline"><button class="gray">เช็กว่าล็อกอินแล้ว</button></form>
<form method="post" action="/home" style="display:inline"><button class="green">เปิด TikTok หน้าแรก</button></form>
<p class="muted">วิธีใช้: กด “เปิด QR Login” → ใช้แอป TikTok บนมือถือสแกน QR → กดยืนยันในมือถือ → รอหน้านี้เปลี่ยนเป็น “ล็อกอินแล้ว”</p>
</div>

<div class="grid">
<div class="card">
<h3>หน้าจอ Chromium บน Railway</h3>
<img id="shot" src="/screenshot.png?t=${Date.now()}">
</div>
<div class="card">
<h3>Session</h3>
<p>บันทึกล่าสุด: <span id="saved">${esc(status.savedAt||'-')}</span></p>
<p class="muted">Session จะถูกบันทึกใน container นี้อัตโนมัติหลังตรวจพบว่าล็อกอินสำเร็จ</p>
</div>
</div>
</div>
<script>
async function poll(){
  try{
    const r = await fetch('/api/status',{cache:'no-store'});
    const s = await r.json();
    document.getElementById('mode').textContent=s.mode||'';
    const lg=document.getElementById('login');
    lg.textContent=s.loggedIn?'ล็อกอินแล้ว':'ยังไม่ล็อกอิน';
    lg.className=s.loggedIn?'ok':'bad';
    document.getElementById('url').textContent=s.url||'';
    document.getElementById('title').textContent=s.title||'';
    document.getElementById('error').textContent=s.error||'';
    document.getElementById('saved').textContent=s.savedAt||'-';
    document.getElementById('shot').src='/screenshot.png?t='+Date.now();
  }catch{}
}
setInterval(poll,3000);
</script>
</body></html>`);
});

app.listen(PORT,'0.0.0.0',async()=>{
  console.log('listening',PORT);
  await openQr();
  setInterval(()=>detectLogin().catch(()=>{}),2500);
});
