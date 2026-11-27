import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const base = process.env.BASE_URL ?? 'http://localhost:3105';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width:1440,height:1000 }, reducedMotion:'reduce' });
let permission = true, failTopology = false, emptyTopology = false, failLimits = false, failSave = false, skipApply = false;
let limits = {maxTransfer:9000,tankMax:95,cipBuffer:10,changeoverMax:2,starvationTol:20};
const writes = [], errors = [];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{localStorage.setItem('milkgraph-account','USR-superadmin');sessionStorage.setItem('milkgraph-api-role','superadmin');localStorage.setItem('milkgraph-panduan-seen','1');});
await page.route('**/api/v1/**',async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname.split('/api/v1')[1];
 if(req.method()!=='GET'){
  assert.equal(path,'/limits');assert.equal(req.method(),'PUT');writes.push(req.postDataJSON());
  if(failSave)return route.fulfill({status:503,json:{error:{message:'Penyimpanan gagal'}}});
  if(!skipApply)limits=req.postDataJSON();return route.fulfill({json:limits});
 }
 if(path==='/events')return route.fulfill({contentType:'text/event-stream',body:': QA\n\n'});
 if(path==='/meta')return route.fulfill({json:{event_invalidations:{}}});
 if(path==='/session')return route.fulfill({json:{role:'superadmin',permissions:permission?['constraint.edit']:[]}});
 if(path==='/limits')return failLimits?route.fulfill({status:503,json:{error:{message:'Batas gagal dimuat'}}}):route.fulfill({json:limits});
 if(path==='/limits/schema')return route.fulfill({json:[{params:[
  {key:'maxTransfer',kind:'range',min:7000,max:12000,step:100},
  {key:'tankMax',kind:'range',min:85,max:100,step:1},
  {key:'cipBuffer',kind:'range',min:0,max:30,step:5},
  {key:'changeoverMax',kind:'range',min:0,max:4,step:1},
 ]}]});
 if(path==='/master/topology'){
  if(failTopology)return route.fulfill({status:503,json:{error:{message:'Master tidak tersedia'}}});
  return route.fulfill({json:emptyTopology?{nodes:[],edges:[]}:{nodes:[
   {asset_id:'FL-01',asset_name:'Filler satu',asset_type:'Filling Line',speed_packph:'12000',capacity_l:'0'},
   {asset_id:'AT-01',asset_name:'Tangki aseptik',asset_type:'Aseptic Tank',capacity_l:'20000'},
  ],edges:[{connection_id:'C1',source_asset_id:'AT-01',destination_asset_id:'FL-01',via_asset_id:'',max_flow_lph:'8000',flow_type:'milk'}]}});
 }
 if(path==='/master/lines')return route.fulfill({json:{dedications:[{line_id:'FL-01',allowed_sku_ids:'SKU1',pack_size_codes:'1L',source_aseptic_tank_id:'AT-01',speed_packph:'12000'}],finishedCompatibility:[{line_id:'FL-01',finished_sku_id:'FG1',liquid_sku_id:'SKU1',pack_size_code:'1L',market_variant:'ID',eligible:'true'}],productCompatibility:[]}});
 if(path==='/production/daily')return route.fulfill({json:{production_date:url.searchParams.get('date'),count:0,batches:[]}});
 if(path==='/production/predictions'||path==='/production/plans'||path==='/production/assets')return route.fulfill({json:{count:0,items:[]}});
 return route.fulfill({json:[]});
});
const management = page.getByRole('button',{name:'Manajemen proses',exact:true});
const transfer = page.getByLabel('Laju transfer maksimum (L/jam)',{exact:true});
const save = page.getByRole('button',{name:'Simpan pengaturan',exact:true});
async function open(){await page.goto(base+'/produksi');await management.click();await expect(page.getByRole('heading',{name:'Manajemen proses',exact:true})).toBeVisible();}
try{
 await open();await expect(transfer).toHaveValue('9000');await expect(save).toBeDisabled();
 await transfer.fill('13000');await save.click();assert.equal(writes.length,0,'HTML constraints must block invalid values');
 await transfer.fill('10000');
 // Latest backend state, unrelated field must survive the merge.
 limits={...limits,starvationTol:35};
 await save.click();await expect(page.getByText('Pengaturan produksi tersimpan.',{exact:true})).toBeVisible();
 assert.equal(writes.length,1);assert.equal(writes[0].maxTransfer,10000);assert.equal(writes[0].starvationTol,35);
 failSave=true;await transfer.fill('11000');await save.click();await expect(page.getByRole('alert').filter({hasText:'Penyimpanan gagal'})).toBeVisible();await expect(transfer).toHaveValue('11000');
 failSave=false;skipApply=true;await save.click();
 await expect(page.getByRole('alert').filter({hasText:'nilai backend belum sesuai'})).toBeVisible();
 await expect(page.getByText('Pengaturan produksi tersimpan.',{exact:true})).toHaveCount(0);skipApply=false;
 // Permission was revoked after the form loaded: fresh session check blocks the write.
 permission=false;const before=writes.length;await save.click();await expect(page.getByRole('alert').filter({hasText:'Izin mengubah'})).toBeVisible();assert.equal(writes.length,before);
 await open();await expect(transfer).toHaveAttribute('readonly','');await expect(save).toHaveCount(0);
 permission=true;await open();
 await page.getByRole('button',{name:'Alat & rute',exact:true}).click();
 await expect(page.getByLabel('Pilih alat proses',{exact:true})).toBeVisible();
 await expect(page.getByText('12000',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('Backend belum menyediakan',{exact:false})).toBeVisible();
 await page.getByLabel('Pilih alat proses',{exact:true}).click();await page.getByRole('option',{name:'AT-01 · Tangki aseptik'}).click();await expect(page.getByRole('heading',{name:'AT-01 · Tangki aseptik',exact:true})).toBeVisible();
 await expect(page.getByText('20000',{exact:true})).toBeVisible();
 await page.getByLabel('Pilih alat proses',{exact:true}).click();await page.getByRole('option',{name:'FL-01 · Filler satu'}).click();
 await expect(page.getByText('0',{exact:true})).toBeVisible();
 for(const width of [320,768,1024,1440]){
  await page.setViewportSize({width,height:1000});
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
  await page.getByRole('button',{name:'Batas operasional',exact:true}).click();await expect(transfer).toBeVisible();
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
  await page.getByRole('button',{name:'Lini & kompatibilitas',exact:true}).click();await expect(page.getByRole('heading',{name:'Konfigurasi lini',exact:true})).toBeVisible();
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
  await page.getByRole('button',{name:'Alat & rute',exact:true}).click();
 }
 failTopology=true;await page.getByRole('button',{name:'Muat ulang konfigurasi'}).click();await expect(page.getByRole('alert').filter({hasText:'Konfigurasi gagal dimuat'})).toBeVisible();
 failTopology=false;emptyTopology=true;await page.getByRole('button',{name:'Coba lagi',exact:true}).click();await expect(page.getByText('Belum ada konfigurasi alat di backend.')).toBeVisible();
 emptyTopology=false;await page.getByRole('button',{name:'Muat ulang konfigurasi'}).click();
 failLimits=true;await page.getByRole('button',{name:'Batas operasional',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Gagal memuat pengaturan'})).toBeVisible();
 failLimits=false;await page.getByRole('button',{name:'Coba lagi',exact:true}).click();await expect(transfer).toBeVisible();
 await page.getByRole('button',{name:'Alat & rute',exact:true}).press('Enter');await expect(page.getByLabel('Pilih alat proses',{exact:true})).toBeVisible();
 if(process.env.QA_ARTIFACT_DIR){await mkdir(process.env.QA_ARTIFACT_DIR,{recursive:true});await page.screenshot({path:process.env.QA_ARTIFACT_DIR+'/manajemen-proses.png',fullPage:true});}
 assert.deepEqual(errors,[]);
 console.log('PASS process management: real API-shaped configuration, validated PUT, preserve latest unrelated fields, failure retains draft, fresh permission check/read-only, equipment zero/missing specs/routes, empty/error/retry, keyboard, four widths; all mutations mocked');
}finally{await browser.close();}
