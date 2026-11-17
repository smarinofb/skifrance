import { createServer } from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = await fs.readFile(path.join(root, "tests/fixtures/stations.json"), "utf8");
const server = createServer((req,res)=>{ res.writeHead(200,{"content-type":"application/json"}); res.end(fixture); });
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port = server.address().port;
try {
  await new Promise((resolve,reject)=>{
    const child = spawn(process.execPath,["scripts/build.mjs"],{cwd:root,env:{...process.env,STATIONS_API_URL:"http://127.0.0.1:"+port+"/feed",URL:"https://skifrance-smarin.netlify.app"},stdio:"inherit"});
    child.on("error",reject); child.on("exit",code=>code===0?resolve():reject(new Error("Build code "+code)));
  });
  const dist=path.join(root,"dist");
  const home=await fs.readFile(path.join(dist,"index.html"),"utf8");
  const station=await fs.readFile(path.join(dist,"stations","station-exemple-village-exemple-fixture-station-001","index.html"),"utf8");
  const massif=await fs.readFile(path.join(dist,"massifs","alpes-du-nord","index.html"),"utf8");
  const sitemap=await fs.readFile(path.join(dist,"sitemap.xml"),"utf8");
  assert.match(home,/Stations de ski en France/);
  assert.match(home,/massifs\/alpes-du-nord/);
  assert.match(station,/<h1>Station de ski Station Exemple/);
  assert.match(massif,/Stations de ski du massif Alpes du Nord/);
  assert.match(sitemap,/<loc>https:\/\/skifrance-smarin\.netlify\.app\/stations\//);
  assert.doesNotMatch(sitemap,/Fiche-Trop-Peu-Renseignée/);
  console.log("Tests SEO passés : accueil, fiche station, page massif, liens internes et sitemap.");
} finally {
  await new Promise(resolve=>server.close(resolve));
}
