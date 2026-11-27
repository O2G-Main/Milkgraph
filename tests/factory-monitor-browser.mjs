import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const root = process.env.BASE_URL ?? 'http://localhost:3105';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failAssets = false, failSchedule = false, maintenance = true;
const row = { production_date:'2026-11-01', batch_id:'B1', batch_code:'B1', sequence_no:1, line_no:1, production_order_id:'PO1', finished_sku_id:'SKU-1', filling_line_id:'FL-01', aseptic_tank_id:'AT-01', sterilizer_id:'ST-01', target_volume_l:5000, target_packs:null, status:'Terjadwal' };
const schedule = [row,{...row,line_no:2,production_order_id:'PO2',target_volume_l:3000},{...row,batch_id:'B2',batch_code:'B2',sequence_no:2,target_volume_l:4000},{...row,batch_id:'B2',batch_code:'B2',sequence_no:2,line_no:2,filling_line_id:'FL-MISSING',target_volume_l:2000}];
const nodes = [
  {asset_id:'FL-01',asset_name:'Filler satu',asset_type:'Filling Line'},
  {asset_id:'AT-01',asset_name:'Tangki aseptik',asset_type:'Aseptic Tank'},
  {asset_id:'ST-01',asset_name:'Sterilizer',asset_type:'Sterilizer'},
  {asset_id:'SPARE-01',asset_name:'Filler cadangan',asset_type:'Filling Line'},
  {asset_id:'BOUNDARY',asset_name:'Sumber konfigurasi',asset_type:'Farm Supply Boundary'},
];
const topology = {nodes,edges:[{connection_id:'C1',source_asset_id:'ST-01',destination_asset_id:'AT-01',via_asset_id:'',flow_type:'milk',max_flow_lph:'10000'},{connection_id:'C2',source_asset_id:'AT-01',destination_asset_id:'FL-01',via_asset_id:'',flow_type:'milk',max_flow_lph:'8000'}]};
const page = await browser.newPage({ viewport:{width:1440,height:1000}, timezoneId:'America/Los_Angeles', reducedMotion:'reduce' });
const errors = [], writes = [];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{ localStorage.setItem('milkgraph-account','USR-superadmin');sessionStorage.setItem('milkgraph-api-role','superadmin');localStorage.setItem('milkgraph-panduan-seen','1'); });
await page.route('**/api/v1/**',async route=>{
  const request=route.request(), url=new URL(request.url()), path=url.pathname.split('/api/v1')[1];
  if(request.method()!=='GET'){writes.push(path);return route.fulfill({status:405,json:{error:{message:'Read-only QA'}}});}
  if(path==='/session')return route.fulfill({json:{role:'superadmin',permissions:['plan.decide']}});
  if(path==='/events')return route.fulfill({contentType:'text/event-stream',body:': QA\n\n'});
  if(path==='/meta')return route.fulfill({json:{event_invalidations:{}}});
  if(path==='/limits')return route.fulfill({json:{maxTransfer:10000,tankMax:95,cipBuffer:10,changeoverMax:2}});
  if(path==='/production/assets'){
    if(failAssets)return route.fulfill({status:503,json:{error:{message:'Status alat gagal'}}});
    const statuses=[maintenance?'Maintenance':'Available','Available',null,'Not running'];
    const items=nodes.slice(0,4).map((node,index)=>({...node,current_status:statuses[index],current_status_reason:index===0?'Inspeksi pompa':null,current_status_source:'user_input',current_status_observed_at:index===2?null:'2026-11-01T03:00:00Z'}));
    return route.fulfill({json:{count:items.length,items}});
  }
  if(path==='/production/schedule'){
    if(failSchedule)return route.fulfill({status:503,json:{error:{message:'Jadwal gagal'}}});
    const items=url.searchParams.get('date')==='2026-11-01'?schedule:[];
    return route.fulfill({json:{count:items.length,items}});
  }
  if(path==='/production/daily')return route.fulfill({json:{production_date:url.searchParams.get('date'),count:0,batches:[]}});
  if(path==='/production/predictions'||path==='/production/plans')return route.fulfill({json:{count:0,items:[]}});
  if(path==='/trace/history')return route.fulfill({json:{groups:[]}});
  if(path==='/master/topology')return route.fulfill({json:topology});
  if(path==='/downtime-events')return route.fulfill({json:[{event_id:'DT-1',resource_id:'FL-01',start:'2026-11-01T03:00:00Z',end:'2026-11-01T04:00:00Z',type:'planned_maintenance',source:'user_input'}]});
  return route.fulfill({json:[]});
});
try {
  await page.goto(root+'/kondisi-pabrik?date=2026-11-01&batch=B1');
  await expect(page.getByRole('heading',{name:'Kondisi Pabrik',exact:true})).toBeVisible();
  await expect(page.locator('#desktop-navigation .nav-item.active')).toHaveAttribute('aria-label','Operasional');
  await expect(page.getByLabel('Batch yang disorot',{exact:true})).toHaveValue('B1');
  const filler = page.getByRole('button',{name:/^Lihat alat FL-01\./});
  await expect(filler).toBeVisible();
  await expect(filler).toContainText('2 batch');
  await expect(filler).toContainText('2026');
  await expect(page.getByRole('button',{name:'Lihat alat BOUNDARY',exact:true})).toContainText('Node konfigurasi');
  await expect(page.getByRole('button',{name:'Detail kondisi FL-01'})).toBeVisible();
  await filler.press('Enter');
  const dialog = page.getByRole('dialog',{name:'FL-01 · Filler satu',exact:true});
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Inspeksi pompa');
  await expect(dialog).toContainText('8.000 L');
  await expect(dialog).toContainText('B2');
  await expect(dialog).toContainText('Maintenance terencana');
  await expect(dialog.getByRole('link',{name:'Buka Penjadwalan tanggal ini'})).toHaveAttribute('href','/penjadwalan?date=2026-11-01');
  await page.keyboard.press('Escape');
  await expect(filler).toBeFocused();
  for(const width of [320,768,1024,1440]){
    await page.setViewportSize({width,height:1000});
    await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth,null,{timeout:3000});
    await filler.press('Enter');
    await expect(dialog).toBeVisible();
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),'modal overflow '+width);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button',{name:'Alur 3D',exact:true}).click();
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.getByRole('button',{name:'Daftar rute',exact:true}).click();
  await page.getByRole('button',{name:'ST-01',exact:true}).press('Enter');
  await expect(page.getByRole('dialog',{name:'ST-01 · Sterilizer',exact:true})).toContainText('Belum tercatat');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Alur 2D',exact:true}).click();
  await page.getByLabel('Batch yang disorot',{exact:true}).selectOption('');
  await expect(page.getByText('ID alat pada jadwal belum ditemukan di katalog:',{exact:false})).toContainText('FL-MISSING');
  maintenance=false;
  await page.getByRole('button',{name:'Perbarui tampilan',exact:true}).click();
  await expect(filler).toContainText('Available');
  await expect(page.getByRole('button',{name:'Detail kondisi FL-01'})).toHaveCount(0);
  await page.getByRole('button',{name:'Tanggal penugasan alat',exact:true}).click();
  await page.getByRole('dialog',{name:'Tanggal penugasan alat'}).getByRole('button',{name:'Kosongkan',exact:true}).click();
  await expect(page.getByText('Pilih tanggal untuk melihat penugasan.',{exact:false})).toBeVisible();
  await expect(filler).toContainText('Available');
  await page.goto(root+'/kondisi-pabrik?date=2026-11-02');
  await expect(page.getByText('Belum ada jadwal pada tanggal 2026-11-02.',{exact:false})).toBeVisible();
  await expect(filler).toBeVisible();
  await page.goto(root+'/kondisi-pabrik?date=2026-11-01&batch=UNKNOWN');
  await expect(page.getByText('Batch UNKNOWN tidak ditemukan',{exact:false})).toBeVisible();
  failSchedule=true;await page.reload();
  await expect(page.getByText('Penugasan belum dapat dipastikan:',{exact:false})).toBeVisible();
  await expect(page.getByText('Belum ada jadwal pada tanggal',{exact:false})).toHaveCount(0);
  failSchedule=false;await page.getByRole('button',{name:'Coba lagi',exact:true}).click();
  await expect(page.getByText('Batch UNKNOWN tidak ditemukan',{exact:false})).toBeVisible();
  failAssets=true;await page.reload();
  await expect(page.getByText('Status alat belum dapat dipastikan:',{exact:false})).toBeVisible();
  await expect(filler).toContainText('Status tidak tersedia');
  failAssets=false;
  await page.goto(root+'/kondisi-pabrik?date=2026-02-30');
  await expect(page.getByText('Parameter tanggal tidak valid;', {exact:false})).toBeVisible();
  await page.goto(root+'/penjadwalan?date=2026-11-01');
  await expect(page.getByRole('button',{name:'Tanggal penjadwalan',exact:true})).toContainText('1 Nov 2026');
  await page.locator('nav[aria-label="Hari produksi"] [aria-current="date"] button').click();
  await page.getByRole('button',{name:/B1/}).first().click();
  await page.getByRole('link',{name:'Lihat kondisi alat batch'}).click();
  await expect(page).toHaveURL(root+'/kondisi-pabrik?date=2026-11-01&batch=B1');
  await expect(page.getByLabel('Batch yang disorot',{exact:true})).toHaveValue('B1');
  if(process.env.QA_ARTIFACT_DIR){ await mkdir(process.env.QA_ARTIFACT_DIR,{recursive:true}); await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);}); await page.screenshot({path:process.env.QA_ARTIFACT_DIR+'/kondisi-pabrik.png',fullPage:true}); }
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  console.log('PASS factory monitor: assignments/status separation, exact IDs, timestamps, attention, downtime, refresh, empty/error states, unknown batch, date clear, scheduling cross-links, keyboard and four widths; GET-only');
} finally {await browser.close();}
