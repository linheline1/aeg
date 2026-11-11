const fs = require('node:fs');
const path = require('node:path');
const {get} = require('./find-shipping-logos.cjs');
const root = process.argv[2];
if (!root) throw new Error('Destination required');
const items = [
 ['01_MSC_地中海航运.svg','MSC 地中海航运','https://upload.wikimedia.org/wikipedia/commons/b/b3/Mediterranean_Shipping_Company_logo.svg','https://commons.wikimedia.org/wiki/File:Mediterranean_Shipping_Company_logo.svg'],
 ['02_Maersk_马士基.png','Maersk 马士基','https://companieslogo.com/img/orig/MAERSK-B.CO_BIG-de866853.png?t=1720244492','https://companieslogo.com/maersk/logo/'],
 ['03_CMA-CGM_达飞.svg','CMA CGM 达飞','https://upload.wikimedia.org/wikipedia/commons/d/d1/CMA_CGM_logo.svg','https://commons.wikimedia.org/wiki/File:CMA_CGM_logo.svg'],
 ['04_COSCO_中远海运.png','COSCO 中远海运','https://companieslogo.com/img/orig/601919.SS-a507a5cc.png?t=1720244490','https://companieslogo.com/cosco-shipping/logo/'],
 ['05_Hapag-Lloyd_赫伯罗特.png','Hapag-Lloyd 赫伯罗特','https://companieslogo.com/img/orig/HLAG.DE_BIG-6ba9e6fe.png?t=1720244492','https://companieslogo.com/hapag-lloyd/logo/'],
 ['06_ONE_海洋网联.svg','ONE 海洋网联','https://www.one-line.com/assets/_next/static/media/logo.8b5ca3fe.svg','https://www.one-line.com/en'],
 ['07_Evergreen_长荣海运.svg','Evergreen 长荣海运','https://www.evergreen-marine.com/emc/common/images/logo/emc_logo.svg','https://www.evergreen-marine.com'],
 ['08_HMM_韩新海运.png','HMM 韩新海运','https://companieslogo.com/img/orig/011200.KS-bd6a0171.png?t=1720244489','https://companieslogo.com/hmm/logo/'],
 ['09_Yang-Ming_阳明海运.png','Yang Ming 阳明海运','https://companieslogo.com/img/orig/2609.TW_BIG-945d69e9.png?t=1746286847','https://companieslogo.com/yang-ming/logo/'],
 ['10_ZIM_以星航运.png','ZIM 以星航运','https://companieslogo.com/img/orig/ZIM-21ddf0fa.png?t=1720244494','https://companieslogo.com/zim/logo/'],
];
fs.mkdirSync(root,{recursive:true});
async function main(){
 const results=await Promise.all(items.map(async ([file,name,url,source])=>{
  try {
   const target=path.join(root,file);
   let body;
   if(fs.existsSync(target)) body=fs.readFileSync(target);
   else {
    const r=await get(url);
    if(r.status!==200)throw new Error('HTTP '+r.status);
    body=r.body;
   }
   const svg=file.endsWith('.svg');
   if(svg ? !/<svg[\s>]/.test(body.toString()) || /<html[\s>]/i.test(body.toString()) : body.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Invalid image content');
   if(!fs.existsSync(target))fs.writeFileSync(target,body,{flag:'wx'});
   console.log(JSON.stringify({file,bytes:body.length,status:'OK'}));
   return {file,name,url,source,bytes:body.length};
  }catch(e){console.log(JSON.stringify({file,error:e.message}));return {file,name,url,source,error:e.message};}
 }));
 fs.writeFileSync(path.join(root,'来源清单.json'),JSON.stringify({date:'2026-11-10',ranking:'https://alphaliner.axsmarine.com/PublicTop100/',items:results},null,2));
 fs.writeFileSync(path.join(root,'来源说明.txt'),'全球十大集装箱船公司 Logo\r\n整理日期：2026-11-10\r\n排名参考：Alphaliner Top 100（船队集装箱运力口径，排名会变化）\r\nhttps://alphaliner.axsmarine.com/PublicTop100/\r\n下载自公司官网、CompaniesLogo 和 Wikimedia Commons；保留原始格式。\r\n\r\n'+results.map(x=>x.name+'\r\n文件：'+x.file+'\r\n来源：'+x.source+'\r\n原图：'+x.url+(x.error?'\r\n下载失败：'+x.error:'')).join('\r\n\r\n'));
 fs.writeFileSync(path.join(root,'Logo预览.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>全球十大船公司 Logo</title><style>body{font:15px system-ui;margin:40px;background:#f2f5f9;color:#18304d}h1{font-size:26px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px}.card{background:white;border:1px solid #dce3eb;border-radius:12px;padding:24px}.card img{width:100%;height:130px;object-fit:contain}a{color:#2563eb}p{line-height:1.6}</style><h1>全球十大集装箱船公司 Logo</h1><p>2026-11-10 整理 · 原始素材与来源见同目录文件</p><div class="grid">'+results.map(x=>'<article class="card">'+(x.error?'<p>暂未下载</p>':'<img src="'+encodeURIComponent(x.file)+'" alt="'+x.name+'">')+'<h2>'+x.name+'</h2><a href="'+x.source+'">素材来源</a></article>').join('')+'</div></html>');
 if(results.some(x=>x.error))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
