const fs = require('fs');
const path = '/workspace/.cursor/tmp/count-captures.js';
// run on VPS only
const script = `const fs=require('fs');const {PrismaClient}=require('@prisma/client');
const envPath='/opt/synqdrive/shared/backend.env';
for(const line of fs.readFileSync(envPath,'utf8').split(/\\r?\\n/)){const m=line.match(/^\\s*([A-Z0-9_]+)\\s*=\\s*(.*)\\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^"(.*)"$/,'$1');}
const since=new Date(Date.now()-30*24*3600*1000);const M=3600000,H=6*M;
(async()=>{const p=new PrismaClient();const vs=await p.vehicle.findMany({where:{dimoVehicleId:{not:null}},select:{id:true,fuelType:true,licensePlate:true}});
const r={ice:{w60:0,w6:0,any:0,c60:0,c6:0},bev:{w60:0,w6:0,any:0}};
for(const v of vs){const ice=(v.fuelType||'').toUpperCase()!=='ELECTRIC';const k=ice?'ice':'bev';
const trips=await p.vehicleTrip.findMany({where:{vehicleId:v.id,endTime:{not:null,gte:since}},orderBy:{endTime:'asc'}});
const snaps=await p.batteryHealthSnapshot.findMany({where:{vehicleId:v.id,recordedAt:{gte:since},restingVoltage:{not:null}}});
for(let i=0;i<trips.length;i++){const end=trips[i].endTime.getTime();const nxt=trips[i+1]?trips[i+1].startTime.getTime():Date.now();const d=nxt-end;if(d<M)continue;r[k].w60++;
if(d>=H)r[k].w6++;const ins=snaps.filter(s=>{const t=new Date(s.recordedAt).getTime();return t>=end&&t<=nxt;});
if(ins.length)r[k].any++;if(ins.some(s=>new Date(s.recordedAt).getTime()-end>=M-30*60000))r[k].c60++;if(d>=H&&ins.some(s=>new Date(s.recordedAt).getTime()-end>=H-60*60000))r[k].c6++;}
}
console.log(JSON.stringify(r));await p.$disconnect();})();`;
fs.writeFileSync(path, script);
