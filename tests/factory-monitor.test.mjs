import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetAssignments, assignedBatchCount, assetStatusTone, assignedAttention, recordedStatusTime, validProductionDate } from '../lib/factory-monitor.ts';
const row={production_date:'2026-11-01',batch_id:'B1',batch_code:'MG-B1',sequence_no:1,line_no:1,production_order_id:'PO1',finished_sku_id:'SKU',filling_line_id:'FL-01',aseptic_tank_id:'AT-01',sterilizer_id:'ST-01',target_volume_l:5000,status:'Terjadwal'};

test('assignments join exact stored asset IDs and preserve different PO lines without double counting duplicate rows',()=>{
 const second={...row,line_no:2,production_order_id:'PO2'};
 const result=assetAssignments([row,row,second,{...row,production_date:'2026-11-02'}],'2026-11-01');
 assert.deepEqual([...result.keys()],['FL-01','AT-01','ST-01']);
 assert.equal(result.get('FL-01').length,2);
 assert.equal(assignedBatchCount(result.get('FL-01')),1);
 assert.ok(!result.has('FL-1'));
});
test('one asset can be referenced by several batches without being marked active or a capacity conflict',()=>{
 const result=assetAssignments([row,{...row,batch_id:'B2',line_no:1}],row.production_date);
 assert.equal(assignedBatchCount(result.get('FL-01')),2);
 assert.equal('running' in result.get('FL-01')[0],false);
 assert.equal(assetAssignments([{...row,aseptic_tank_id:'FL-01',sterilizer_id:null}],row.production_date).get('FL-01').length,1);
});
test('free text statuses only use positive/attention colors for recognized values',()=>{
 assert.equal(assetStatusTone('Available'),'ok');
 assert.equal(assetStatusTone('Empty - Clean Ready'),'ok');
 assert.equal(assetStatusTone('CIP'),'warn');
 assert.equal(assetStatusTone('Breakdown'),'crit');
 for(const status of [null,'','   ','Not running','Not available','No fault','new_custom_status']) assert.equal(assetStatusTone(status),'neutral');
});
test('attention means a recognized recorded condition on a referenced asset, not unknown or unrelated equipment',()=>{
 const assets=[{asset_id:'FL-01',current_status:'Maintenance'},{asset_id:'AT-01',current_status:null},{asset_id:'UNKNOWN',current_status:'Breakdown'}];
 assert.deepEqual(assignedAttention(assets,assetAssignments([row],row.production_date)).map(asset=>asset.asset_id),['FL-01']);
});
test('production dates reject impossible dates and non-scalar query values',()=>{
 assert.equal(validProductionDate('2026-11-01'),true);
 for(const date of ['2026-02-30','2026-13-01','1 Nov 2026','',null,['2026-11-01']])assert.equal(validProductionDate(date),false);
});
test('status timestamps expose WIB, retain the source year, and never invent a time for missing data',()=>{
 assert.match(recordedStatusTime('2026-11-27T23:00:00Z'),/28 Nov 2026.*06[.:]00 WIB/);
 assert.match(recordedStatusTime('2025-11-01T00:00:00Z',true),/2025/);
 assert.equal(recordedStatusTime(null),'Waktu belum tercatat');
 assert.equal(recordedStatusTime('invalid'),'Waktu belum tercatat');
});
