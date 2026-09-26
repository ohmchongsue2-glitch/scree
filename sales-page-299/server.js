const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||8080, ADMIN_KEY=process.env.ADMIN_KEY||'admin299';
const STORE='/tmp/sales_analytics.json';
function load(){try{return JSON.parse(fs.readFileSync(STORE,'utf8'))}catch(e){return {events:[],orders:[]}}}
function save(d){try{fs.writeFileSync(STORE,JSON.stringify(d))}catch(e){}}
function body(req){return new Promise(r=>{let s='';req.on('data',c=>{s+=c;if(s.length>1e6)req.destroy()});req.on('end',()=>{try{r(JSON.parse(s||'{}'))}catch(e){r({})}})})}
function json(res,x,c=200){res.writeHead(c,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(x))}
function client(req){return (req.headers['x-forwarded-for']||req.socket.remoteAddress||'').toString().split(',')[0].trim()}
function anon(ip){return crypto.createHash('sha256').update(ip+'|'+(process.env.ANALYTICS_SALT||'sales299')).digest('hex').slice(0,16)}
function adminHtml(){
 const d=load(), now=Date.now(), day=24*3600*1000;
 const ev=d.events||[], od=d.orders||[];
 const page=ev.filter(x=>x.type==='page_view').length;
 const clicks=ev.filter(x=>x.type==='click').length;
 const conv=ev.filter(x=>x.type==='conversion').length;
 const unique=new Set(ev.filter(x=>x.type==='page_view').map(x=>x.visitor)).size;
 const top=Object.entries(ev.filter(x=>x.type==='click').reduce((a,x)=>(a[x.name]=(a[x.name]||0)+1,a),{})).sort((a,b)=>b[1]-a[1]).slice(0,20);
 const recent=od.slice(-50).reverse();
 return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sales Dashboard</title><style>
 body{font-family:system-ui;margin:0;background:#f5f5f7;color:#171717}.wrap{max-width:1100px;margin:auto;padding:20px}.login,.card{background:#fff;border-radius:16px;padding:18px;box-shadow:0 4px 18px #0001;margin-bottom:16px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.k{font-size:32px;font-weight:800}.muted{color:#777;font-size:13px}table{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden}th,td{padding:10px;border-bottom:1px solid #eee;text-align:left;font-size:13px}input,button{padding:11px;border-radius:10px;border:1px solid #ccc}button{background:#111;color:#fff}.hidden{display:none}@media(max-width:720px){.grid{grid-template-columns:1fr 1fr}table{font-size:11px}.wrap{padding:10px}}</style></head><body><div class="wrap">
 <div id="login" class="login"><b>หลังบ้าน Sales Page</b><div class="muted">ใส่รหัสผ่านเพื่อดูข้อมูล</div><p><input id="key" type="password" placeholder="รหัสหลังบ้าน"> <button onclick="go()">เข้าสู่ระบบ</button></p></div>
 <div id="dash" class="hidden">
 <div class="grid">
 <div class="card"><div class="muted">Page views</div><div class="k">${page}</div></div>
 <div class="card"><div class="muted">ผู้เข้าชมโดยประมาณ</div><div class="k">${unique}</div></div>
 <div class="card"><div class="muted">Clicks</div><div class="k">${clicks}</div></div>
 <div class="card"><div class="muted">ออเดอร์</div><div class="k">${od.length}</div></div>
 </div>
 <div class="card"><h3>จุดที่ลูกค้าคลิกมากสุด</h3><table><tr><th>จุด</th><th>จำนวน</th></tr>${top.map(x=>`<tr><td>${x[0]}</td><td>${x[1]}</td></tr>`).join('')}</table></div>
 <div class="card"><h3>ออเดอร์ล่าสุด</h3><table><tr><th>เวลา</th><th>ข้อมูล</th></tr>${recent.map(o=>`<tr><td>${new Date(o.ts).toLocaleString('th-TH')}</td><td><pre style="white-space:pre-wrap;margin:0">${escapeHtml(JSON.stringify(o.data,null,2))}</pre></td></tr>`).join('')}</table></div>
 </div></div><script>
 function go(){const k=document.getElementById('key').value;fetch('/api/admin/check?key='+encodeURIComponent(k)).then(r=>{if(!r.ok)throw 0;sessionStorage.setItem('admin_key',k);document.getElementById('login').style.display='none';document.getElementById('dash').style.display='block'}).catch(()=>alert('รหัสไม่ถูกต้อง'))}
 const k=sessionStorage.getItem('admin_key');if(k)document.getElementById('key').value=k;
 </script></body></html>`;
}
function escapeHtml(s){return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://x');
 if(req.method==='GET' && u.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return fs.createReadStream(path.join(__dirname,'index.html')).pipe(res)}
 if(req.method==='POST' && u.pathname==='/api/event'){const x=await body(req),d=load();d.events.push({ts:Date.now(),type:x.type||'event',name:(x.name||'').slice(0,120),meta:x.meta||{},path:x.path||'',referrer:(x.referrer||'').slice(0,300),visitor:anon(client(req))});if(d.events.length>20000)d.events=d.events.slice(-20000);save(d);return json(res,{ok:true})}
 if(req.method==='POST' && u.pathname==='/api/order'){const x=await body(req),d=load();d.orders.push({ts:Date.now(),data:x,visitor:anon(client(req))});d.events.push({ts:Date.now(),type:'conversion',name:'order_submit',visitor:anon(client(req))});save(d);return json(res,{ok:true})}
 if(req.method==='GET' && u.pathname==='/admin'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(adminHtml())}
 if(req.method==='GET' && u.pathname==='/api/admin/check'){return u.searchParams.get('key')===ADMIN_KEY?json(res,{ok:true}):json(res,{ok:false},401)}
 res.writeHead(404);res.end('Not Found');
});
server.listen(PORT,'0.0.0.0',()=>console.log('listening',PORT));