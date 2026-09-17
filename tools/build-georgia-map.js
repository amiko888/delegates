const fs = require("fs");
const path = require("path");

const rings = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "assets", "georgia-rings.json"), "utf8")
);
const pts = rings[0];
const lons = pts.map((p) => p[0]);
const lats = pts.map((p) => p[1]);
const minLon = Math.min(...lons);
const maxLon = Math.max(...lons);
const minLat = Math.min(...lats);
const maxLat = Math.max(...lats);
const meanLat = (minLat + maxLat) / 2;
const pad = 18;
const W = 600;
const innerW = W - pad * 2;
const lonSpan = maxLon - minLon;
const latSpan = maxLat - minLat;
const aspect = latSpan / (lonSpan * Math.cos((meanLat * Math.PI) / 180));
const innerH = innerW * aspect;
const H = innerH + pad * 2;

function xy(lon, lat) {
  const x = pad + ((lon - minLon) / lonSpan) * innerW;
  const y = pad + ((maxLat - lat) / latSpan) * innerH;
  return [x, y];
}

function pathFrom(ring) {
  return (
    ring
      .map((p, i) => {
        const [x, y] = xy(p[0], p[1]);
        return (i ? "L" : "M") + x.toFixed(2) + "," + y.toFixed(2);
      })
      .join(" ") + " Z"
  );
}

const cities = {
  Telavi: [45.473, 41.917],
  Tbilisi: [44.783, 41.715],
  Batumi: [41.637, 41.643],
  Kutaisi: [42.705, 42.267],
  Zugdidi: [41.871, 42.509],
  Akhaltsikhe: [42.986, 41.639],
  Gori: [44.108, 41.984],
  Mestia: [42.728, 43.045],
  Ozurgeti: [42.018, 41.921],
  Ambrolauri: [43.163, 42.521],
  Rustavi: [45.011, 41.549],
  Kazbegi: [44.651, 42.659],
};

const pins = {};
for (const [k, v] of Object.entries(cities)) {
  const [x, y] = xy(v[0], v[1]);
  pins[k] = { x: +x.toFixed(2), y: +y.toFixed(2) };
}

const d = pathFrom(pts);
const meta = { W, H, minLon, maxLon, minLat, maxLat, innerW, innerH, pad, path: d, pins };
fs.writeFileSync(path.join(__dirname, "..", "assets", "georgia-meta.json"), JSON.stringify(meta, null, 2));
fs.writeFileSync(
  path.join(__dirname, "..", "assets", "georgia-map.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H.toFixed(2)}"><path fill="#D9CDF3" stroke="#F3EEFC" stroke-width="4" stroke-linejoin="round" d="${d}"/></svg>\n`
);
console.log("viewBox", W, H.toFixed(2), "pins", pins);
