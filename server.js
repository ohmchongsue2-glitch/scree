import express from 'express';
import { chromium } from 'playwright';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const TARGET = process.env.TARGET_URL || 'https://www.tiktok.com/';
let browser, page, last = {status:'idle', url:'', title:'', error:null, screenshot:null};

async function takeScreenshotBase64(){
  if(!page) return null;
  const shot = await page.screenshot({fullPage:false});
  return Buffer.from(shot).toString('base64');
}

async function openTarget(){
  try{
    if(!browser){
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
    }
    if(!page){
      const context = await browser.newContext({viewport:{width:1440,height:1000}});
      page = await context.newPage();
    }
    last = {status:'opening', url:'', title:'', error:null, screenshot:null};
    await page.goto(TARGET,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(5000);
    last.url = page.url();
    last.title = await page.title();
    last.status = 'opened';
    last.screenshot = await takeScreenshotBase64();
  }catch(e){
    last.status='error';
    last.error=e?.message || String(e);
    try{ last.screenshot = await takeScreenshotBase64(); }catch{}
  }
  console.log('OPEN_TEST_RESULT', JSON.stringify({
    status:last.status,
    requested:TARGET,
    finalUrl:last.url,
    title:last.title,
    error:last.error
  }));
  return last;
}

app.get('/health',(_,res)=>res.json({ok:true,status:last.status}));
app.get('/result',(_,res)=>res.json({
  status:last.status,
  requested:TARGET,
  finalUrl:last.url,
  title:last.title,
  error:last.error
}));
app.get('/',async(_,res)=>{
  if(last.status==='idle') await openTarget();
  res.send(`<!doctype html><html><meta charset="utf-8"><body style="font-family:system-ui;background:#111827;color:white;padding:20px"><h1>TikTok Railway Open Test</h1><p>Status: <b>${last.status}</b></p><p>Requested: ${TARGET}</p><p>Final URL: ${last.url||'-'}</p><p>Title: ${last.title||'-'}</p><p>Error: ${last.error||'-'}</p><form method="post" action="/retry"><button style="padding:10px 14px">เปิดใหม่</button></form>${last.screenshot?`<h3>Screenshot</h3><img style="max-width:100%;border:1px solid #444" src="data:image/png;base64,${last.screenshot}">`:''}</body></html>`);
});
app.post('/retry',async(_,res)=>{await openTarget();res.redirect('/');});

app.listen(PORT,'0.0.0.0',async()=>{
  console.log('listening',PORT);
  await openTarget();
});
