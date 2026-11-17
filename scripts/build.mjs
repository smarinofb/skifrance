import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist");
const base = (process.env.URL || process.env.SITE_URL || "https://skifrance-smarin.netlify.app").replace(/\/+$/, "");
const api = process.env.STATIONS_API_URL || "https://api.skiradar.fr/api/v1/geo-feed?niche=montagne&limit=500";
const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const clean = value => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const slugPart = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const isNum = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const number = value => isNum(value) ? new Intl.NumberFormat("fr-FR").format(Number(value)) : "";
const massifNames = { "alpes-du-nord":"Alpes du Nord", "alpes-du-sud":"Alpes du Sud", pyrenees:"Pyrénées", "massif-central":"Massif central", jura:"Jura", vosges:"Vosges", corse:"Corse" };
const massifLabel = value => massifNames[value] || clean(value) || "Autres massifs";

const response = await fetch(api, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(45000) });
if (!response.ok) throw new Error("API stations HTTP " + response.status + " : build annulé pour conserver le dernier déploiement fonctionnel.");
const payload = await response.json();
if (!Array.isArray(payload.stations)) throw new Error("Réponse API invalide : tableau stations absent.");

const quality = s => [
  Boolean(clean(s.commune)), Boolean(clean(s.massif)),
  isNum(s.altitudes?.village ?? s.altitudes?.bas), isNum(s.altitudes?.sommet),
  isNum(s.pistes?.km ?? s.pistes?.kmDomaineRelie), isNum(s.pistes?.remontees),
  [s.pistes?.vertes, s.pistes?.bleues, s.pistes?.rouges, s.pistes?.noires].some(isNum),
  s.neige?.basCm != null || s.neige?.hautCm != null || Boolean(clean(s.neige?.statut))
].filter(Boolean).length;

const accepted = payload.stations.filter(s => s && s.id != null && clean(s.name) && quality(s) >= 3);
const usedSlugs = new Set();
const records = accepted.map(s => {
  const rootSlug = [slugPart(s.name), slugPart(s.commune), slugPart(s.id)].filter(Boolean).join("-") || "station-ski";
  let slug = rootSlug, suffix = 2;
  while (usedSlugs.has(slug)) slug = rootSlug + "-" + suffix++;
  usedSlugs.add(slug);
  return { station: s, slug, url: base + "/stations/" + slug + "/" };
});
if (!records.length) throw new Error("Aucune station suffisamment renseignée : build annulé pour éviter un sitemap vide.");

const byMassif = new Map();
for (const record of records) {
  const key = clean(record.station.massif) || "autres";
  if (!byMassif.has(key)) byMassif.set(key, []);
  byMassif.get(key).push(record);
}
const massifSlugs = new Map([...byMassif.keys()].map(key => [key, slugPart(key) || "autres"]));

function stationPage(record) {
  const s = record.station, name = clean(s.name), commune = clean(s.commune);
  const massif = massifLabel(s.massif), village = s.altitudes?.village ?? s.altitudes?.bas, summit = s.altitudes?.sommet;
  const km = s.pistes?.km ?? s.pistes?.kmDomaineRelie, lifts = s.pistes?.remontees;
  const snow = s.neige || {}, pistes = s.pistes || {};
  const title = "Station de ski " + name + (commune ? " (" + commune + ")" : "") + " : pistes, altitude et neige | Ski France";
  const description = ("Découvrez " + name + (commune ? " à " + commune : "") + " dans le massif " + massif + ". Consultez les altitudes, le domaine skiable, les pistes et les informations d'enneigement disponibles.").slice(0, 158);
  const stats = [
    ["Altitude du village", village, "m"], ["Altitude du sommet", summit, "m"],
    ["Pistes / domaine skiable", km, "km"], ["Remontées mécaniques", lifts, ""],
    ["Neige en bas", snow.basCm, "cm"], ["Neige en haut", snow.hautCm, "cm"]
  ].filter(row => isNum(row[1])).map(row => '<div class="stat"><b>' + number(row[1]) + (row[2] ? " " + row[2] : "") + '</b><span>' + escapeHtml(row[0]) + '</span></div>').join("");
  const pisteRows = [["Vertes",pistes.vertes],["Bleues",pistes.bleues],["Rouges",pistes.rouges],["Noires",pistes.noires]]
    .filter(row => isNum(row[1])).map(row => "<li>" + row[0] + " : " + number(row[1]) + "</li>").join("");
  const snowText = (snow.basCm != null || snow.hautCm != null || snow.statut)
    ? "<section><h2>Enneigement et conditions</h2><p>" + (snow.basCm != null ? "Neige en bas : " + number(snow.basCm) + " cm. " : "") + (snow.hautCm != null ? "Neige en haut : " + number(snow.hautCm) + " cm. " : "") + (snow.statut ? "Statut indiqué par la source : " + escapeHtml(clean(snow.statut)) + ". " : "") + (snow.releveLe ? "Relevé : " + escapeHtml(clean(snow.releveLe)) + "." : "") + "</p></section>" : "";
  const other = (byMassif.get(clean(s.massif) || "autres") || []).filter(x => x.slug !== record.slug).slice(0, 12)
    .map(x => '<li><a href="/stations/' + escapeHtml(x.slug) + '/">' + escapeHtml(clean(x.station.name)) + '</a></li>').join("");
  const schema = {"@context":"https://schema.org","@type":"SkiResort","name":name,"url":record.url,"description":description,"inLanguage":"fr-FR","address":commune ? {"@type":"PostalAddress","addressLocality":commune,"addressCountry":"FR"} : undefined};
  const schemaText = JSON.stringify(schema).replaceAll("<", "\\u003c");
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(title) + '</title><meta name="description" content="' + escapeHtml(description) + '"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="' + escapeHtml(record.url) + '"><meta property="og:type" content="website"><meta property="og:locale" content="fr_FR"><meta property="og:site_name" content="Ski France"><meta property="og:title" content="' + escapeHtml(title) + '"><meta property="og:description" content="' + escapeHtml(description) + '"><meta property="og:url" content="' + escapeHtml(record.url) + '"><meta property="og:image" content="' + base + '/og-image.svg"><script type="application/ld+json">' + schemaText + '</script><style>body{font:16px/1.65 system-ui,-apple-system,Segoe UI,sans-serif;color:#172b3d;margin:0}header{background:#08233e;color:#fff;padding:22px max(20px,calc((100% - 1000px)/2))}main{max-width:1000px;margin:auto;padding:28px 20px 56px}h1{font-size:clamp(28px,4vw,42px);line-height:1.15}h2{margin-top:30px}.lead{font-size:18px;color:#526477}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:24px 0}.stat{background:#f3f7fa;border:1px solid #dce5ed;border-radius:10px;padding:14px 18px}.stat b{display:block;font-size:22px}.stat span{color:#526477;font-size:13px}a{color:#087eb5;text-decoration:none}a:hover{text-decoration:underline}.note{color:#5b6b7b;font-size:13px;border-top:1px solid #dce5ed;margin-top:36px;padding-top:16px}</style></head><body><header><strong>ski<span style="color:#38bdf8">france</span></strong></header><main><p><a href="/">Accueil · Carte des stations</a> / ' + escapeHtml(name) + '</p><h1>Station de ski ' + escapeHtml(name) + (commune ? " à " + escapeHtml(commune) : "") + ' : pistes, altitude et enneigement</h1><p class="lead">Découvrez les informations disponibles sur la station de ' + escapeHtml(name) + ', dans le massif ' + escapeHtml(massif) + (commune ? ", commune de " + escapeHtml(commune) : "") + '. Retrouvez les repères d’altitude, les caractéristiques du domaine skiable et les données de neige lorsqu’elles sont publiées par la source.</p><div class="stats">' + stats + '</div><section><h2>Le domaine skiable</h2>' + (km != null ? "<p>Longueur de pistes ou de domaine skiable indiquée : <strong>" + number(km) + " km</strong>.</p>" : "") + (lifts != null ? "<p>Remontées mécaniques indiquées : " + number(lifts) + ".</p>" : "") + (pisteRows ? "<ul>" + pisteRows + "</ul>" : "") + '</section>' + snowText + '<section><h2>Préparer votre sortie</h2><p>Retrouvez cette station sur la <a href="/">carte interactive des stations de ski en France</a> pour explorer d’autres destinations et comparer les massifs. Les informations peuvent être incomplètes ou évoluer : vérifiez toujours les conditions directement auprès de l’exploitant avant votre déplacement.</p></section>' + (other ? '<section><h2>Autres stations du massif ' + escapeHtml(massif) + '</h2><ul>' + other + '</ul></section>' : '') + '<p><a href="/">← Revenir à la carte des stations de ski</a></p><div class="note">Ski France · Fiche produite à partir des informations disponibles au moment du déploiement. Les données ne garantissent pas l’ouverture des pistes.</div></main></body></html>';
}

function massifPage(key, items) {
  const label = massifLabel(key), slug = massifSlugs.get(key);
  const description = "Explorez " + items.length + " stations de ski du massif " + label + " sur Ski France. Consultez les fiches, altitudes, domaines skiables et informations de neige disponibles.";
  const links = items.slice().sort((a,b)=>clean(a.station.name).localeCompare(clean(b.station.name),"fr"))
    .map(x=>'<li><a href="/stations/' + escapeHtml(x.slug) + '/">' + escapeHtml(clean(x.station.name)) + (x.station.commune ? " – " + escapeHtml(clean(x.station.commune)) : "") + '</a></li>').join("");
  const urls = items.map((x,i)=>({"@type":"ListItem","position":i+1,"url":x.url,"name":clean(x.station.name)}));
  const schema = JSON.stringify({"@context":"https://schema.org","@type":"CollectionPage","name":"Stations de ski " + label,"url":base + "/massifs/" + slug + "/","description":description,"inLanguage":"fr-FR","mainEntity":{"@type":"ItemList","numberOfItems":items.length,"itemListElement":urls}}).replaceAll("<","\\u003c");
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stations de ski ' + escapeHtml(label) + ' : carte et fiches | Ski France</title><meta name="description" content="' + escapeHtml(description) + '"><meta name="robots" content="index,follow"><link rel="canonical" href="' + base + '/massifs/' + escapeHtml(slug) + '/"><meta property="og:image" content="' + base + '/og-image.svg"><script type="application/ld+json">' + schema + '</script><style>body{font:16px/1.65 system-ui,sans-serif;color:#172b3d;margin:0}header{background:#08233e;color:#fff;padding:22px max(20px,calc((100% - 1000px)/2))}main{max-width:1000px;margin:auto;padding:28px 20px 56px}h1{font-size:clamp(28px,4vw,42px)}a{color:#087eb5;text-decoration:none}li{margin:8px 0}.note{color:#5b6b7b;font-size:13px;margin-top:36px}</style></head><body><header><strong>ski<span style="color:#38bdf8">france</span></strong></header><main><p><a href="/">Accueil · Carte des stations</a> / ' + escapeHtml(label) + '</p><h1>Stations de ski du massif ' + escapeHtml(label) + '</h1><p>' + escapeHtml(description) + '</p><h2>Liste des stations</h2><ul>' + links + '</ul><p><a href="/">← Revenir à la carte des stations de ski en France</a></p><div class="note">Ski France · Informations susceptibles d’évoluer selon les sources.</div></main></body></html>';
}

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
for (const file of ["index.html","favicon.svg","og-image.svg","site.webmanifest"]) await fs.copyFile(path.join(root,file), path.join(out,file));

const grouped = [];
for (const [key, items] of byMassif.entries()) grouped.push('<section class="seo-station-group"><h3><a href="/massifs/' + escapeHtml(massifSlugs.get(key)) + '/">' + escapeHtml(massifLabel(key)) + ' : toutes les stations</a></h3><div class="seo-station-grid">' + items.map(x=>'<a href="/stations/' + escapeHtml(x.slug) + '/">' + escapeHtml(clean(x.station.name)) + (x.station.commune ? ' – ' + escapeHtml(clean(x.station.commune)) : '') + '</a>').join("") + '</div></section>');
const indexPath = path.join(out, "index.html");
let home = await fs.readFile(indexPath, "utf8");
home = home.replaceAll("https://skifrance-smarin.netlify.app", base);
const linkBlock = '<div id="seo-station-links">' + grouped.join("") + '</div>';
home = home.replace(/<div id="seo-station-links">[\s\S]*?<\/div>/, linkBlock);
await fs.writeFile(indexPath, home, "utf8");

for (const record of records) {
  const dir = path.join(out, "stations", record.slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "index.html"), stationPage(record), "utf8");
}
for (const [key, items] of byMassif.entries()) {
  const dir = path.join(out, "massifs", massifSlugs.get(key));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "index.html"), massifPage(key, items), "utf8");
}

const date = new Date().toISOString().slice(0,10);
const urls = [base + "/", ...[...byMassif.keys()].map(key=>base + "/massifs/" + massifSlugs.get(key) + "/"), ...records.map(x=>x.url)];
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(url=>'  <url><loc>' + url.replaceAll("&","&amp;") + '</loc><lastmod>' + date + '</lastmod></url>').join("\n") + '\n</urlset>\n';
await fs.writeFile(path.join(out,"sitemap.xml"), sitemap, "utf8");
await fs.writeFile(path.join(out,"robots.txt"), "User-agent: *\nAllow: /\n\nSitemap: " + base + "/sitemap.xml\n", "utf8");
await fs.writeFile(path.join(out,"404.html"), '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page introuvable – Ski France</title><h1>Page introuvable</h1><p>La page demandée n’existe pas ou a été déplacée.</p><p><a href="/">Revenir à la carte des stations de ski</a></p></html>', "utf8");
console.log("Build Ski France terminé : " + records.length + " fiches station, " + byMassif.size + " pages massif, " + urls.length + " URL dans le sitemap.");
