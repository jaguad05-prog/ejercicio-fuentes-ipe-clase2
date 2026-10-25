// ============================================================
//  EL VÍDEO BAJO LA LUPA · servidor (Google Apps Script)
//  Pégalo en un proyecto nuevo de Apps Script y publícalo como
//  aplicación web: Ejecutar como «Yo», acceso «Cualquier usuario».
//  Las partidas se guardan 6 horas en la caché y luego se borran solas.
// ============================================================

var TTL = 21600; // 6 horas
var COLORES = ["#C8102E","#1E5AA8","#1E7A45","#8A4FBF","#E07A00","#0E8C8C","#B0306A","#5B6B00","#7A4A1E","#2F2F8F","#D4A017","#00796B","#E5533D","#4A90C2","#6B8E23","#B565A7","#A0522D","#3B3B3B","#F06292","#26A69A"];

function doGet(){ return ContentService.createTextOutput("El vídeo bajo la lupa · servidor activo"); }

function doPost(e){
  var out;
  try {
    var p = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    out = manejar(p);
  } catch(err){
    out = { error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- almacenamiento ----------
function cache(){ return CacheService.getScriptCache(); }
function leer(k){ var v = cache().get(k); return v ? JSON.parse(v) : null; }
function guardar(k, o){ cache().put(k, JSON.stringify(o), TTL); }
function juego(code){
  var g = leer("g_" + code);
  if (!g) throw new Error("No existe esa partida. Revisa el código.");
  return g;
}
// Cada equipo guarda su respuesta en su propio hueco: así los envíos simultáneos no se esperan unos a otros
function claveResp(code, idx, tid){ return "a_" + code + "_" + idx + "_" + tid; }
function claveMot(code, idx, tid){ return "m_" + code + "_" + idx + "_" + tid; } // por qué se dan los puntos
function respuestas(code, idx, g){
  var claves = g.teams.map(function(t){ return claveResp(code, idx, t.id); });
  var crudo = claves.length ? cache().getAll(claves) : {}, out = {};
  g.teams.forEach(function(t){ var v = crudo[claveResp(code, idx, t.id)]; if (v) out[t.id] = JSON.parse(v); });
  return out;
}

function conCandado(fn){
  var lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---------- utilidades ----------
function ahora(){ return Date.now(); }
function restante(g){
  if (g.status !== "answer" || !g.startedAt) return g.dur;
  var r = g.dur - Math.floor((ahora() - g.startedAt) / 1000);
  return r > 0 ? r : 0;
}
function pistaVisible(g){
  if (g.status !== "answer") return g.status === "review" && g.hint;
  if (g.hint) return true;
  return (g.dur - restante(g)) >= Math.floor(g.dur / 2);
}
function total(g, teamId){
  var t = 0;
  for (var k in g.points){ if (g.points[k][teamId] != null) t += g.points[k][teamId]; }
  return t;
}
function tablaEquipos(g){
  return g.teams.map(function(t){ return { id: t.id, name: t.name, color: t.color, pts: total(g, t.id) }; });
}
function norm(s){ return String(s || "").trim().replace(/\s+/g, " ").toLowerCase(); }
function nuevoCodigo(){
  var abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", c = "";
  for (var i = 0; i < 5; i++) c += abc.charAt(Math.floor(Math.random() * abc.length));
  return c;
}
function esAdmin(g, k){ if (!k || k !== g.admin) throw new Error("Solo la pantalla de la profesora puede hacer esto."); }
function preguntaPublica(g){
  if (!g.q) return null;
  return { idx: g.idx, n: g.q.n, total: g.q.total, bloque: g.q.bloque, q: g.q.q, guides: g.q.guides };
}

// ---------- acciones ----------
function manejar(p){
  var a = p.a, code = String(p.c || "").toUpperCase();

  if (a === "new"){
    return conCandado(function(){
      var c; do { c = nuevoCodigo(); } while (leer("g_" + c));
      var g = { code: c, admin: "k" + Math.random().toString(36).slice(2, 12), status: "lobby", idx: -1, q: null,
                dur: 300, startedAt: 0, hint: false, teams: [], devs: {}, points: {}, used: [] };
      guardar("g_" + c, g);
      return { code: c, admin: g.admin };
    });
  }

  if (a === "join"){
    return conCandado(function(){
      var g = juego(code), name = String(p.name || "").trim().replace(/\s+/g, " ").slice(0, 30);
      if (!name) throw new Error("Escribe el nombre de tu equipo");
      if (!p.dev) throw new Error("Falta el identificador del móvil");
      var t = g.teams.filter(function(x){ return norm(x.name) === norm(name); })[0];
      if (!t){
        if (g.teams.length >= 20) throw new Error("Ya hay 20 equipos en la partida");
        t = { id: "t" + (g.teams.length + 1), name: name, color: COLORES[g.teams.length % COLORES.length] };
        g.teams.push(t);
      }
      g.devs[p.dev] = t.id;
      guardar("g_" + code, g);
      return { ok: true, team: t.id };
    });
  }

  if (a === "state"){ // móvil de un equipo
    var g = juego(code), tid = g.devs[p.dev], me = null;
    if (tid){
      var t = g.teams.filter(function(x){ return x.id === tid; })[0];
      var mia = g.idx >= 0 ? cache().get(claveResp(code, g.idx, t.id)) : null;
      var mot = g.idx >= 0 && g.status !== "answer" ? cache().get(claveMot(code, g.idx, t.id)) : null;
      me = { team: t.id, teamName: t.name, color: t.color, sent: mia ? JSON.parse(mia) : null, mot: mot ? JSON.parse(mot) : null };
    }
    return { game: { status: g.status, idx: g.idx, remaining: restante(g), dur: g.dur,
                     pista: pistaVisible(g) && g.q ? g.q.pista : null, q: preguntaPublica(g),
                     myPts: me && g.points[g.idx] ? (g.points[g.idx][me.team] != null ? g.points[g.idx][me.team] : null) : null },
             me: me, teams: tablaEquipos(g) };
  }

  if (a === "send"){ // sin candado: cada equipo escribe solo en su hueco
    var gs = juego(code), tid2 = gs.devs[p.dev];
    if (!tid2) throw new Error("Vuelve a entrar con el nombre de tu equipo");
    if (gs.status !== "answer" || Number(p.idx) !== gs.idx) throw new Error("Esta pregunta ya está cerrada");
    if (restante(gs) <= 0 && (ahora() - gs.startedAt) / 1000 > gs.dur + 15) throw new Error("Se acabó el tiempo");
    var k2 = claveResp(code, gs.idx, tid2);
    if (cache().get(k2)) throw new Error("Tu equipo ya ha enviado la respuesta");
    var lista = (p.answers || []).slice(0, 8).map(function(s){ return String(s || "").slice(0, 700); });
    cache().put(k2, JSON.stringify(lista), TTL);
    return { ok: true };
  }

  // ----- a partir de aquí, solo la pantalla de la profesora -----
  if (a === "astate"){
    var g2 = juego(code); esAdmin(g2, p.k);
    var ans2 = g2.idx >= 0 ? respuestas(code, g2.idx, g2) : {};
    var cuenta = {};
    for (var d in g2.devs){ cuenta[g2.devs[d]] = (cuenta[g2.devs[d]] || 0) + 1; }
    return { game: { code: g2.code, status: g2.status, idx: g2.idx, remaining: restante(g2), dur: g2.dur,
                     hint: pistaVisible(g2), used: g2.used },
             teams: g2.teams.map(function(t){ return { id: t.id, name: t.name, color: t.color, pts: total(g2, t.id),
                                                      devs: cuenta[t.id] || 0, sent: !!ans2[t.id] }; }),
             answers: ans2, points: g2.points[g2.idx] || {}, totalDevs: Object.keys(g2.devs).length };
  }

  return conCandado(function(){
    var g = juego(code); esAdmin(g, p.k);
    if (a === "start"){
      var q = p.q || {};
      g.idx = Number(p.idx);
      g.q = { n: q.n, total: q.total, bloque: String(q.bloque || ""), q: String(q.q || ""), pista: String(q.pista || ""),
              guides: (q.guides || []).map(String) };
      g.dur = Math.max(30, Math.min(1800, Number(p.dur) || 300));
      g.status = "answer"; g.startedAt = ahora(); g.hint = false;
      if (g.used.indexOf(g.idx) < 0) g.used.push(g.idx);
      var viejas = g.teams.map(function(t){ return claveResp(code, g.idx, t.id); }) // al relanzar una pregunta se empiezan de cero sus respuestas
                    .concat(g.teams.map(function(t){ return claveMot(code, g.idx, t.id); }));
      if (viejas.length) cache().removeAll(viejas);
    } else if (a === "hint"){
      g.hint = true;
    } else if (a === "more"){
      if (g.status === "answer") g.dur += Number(p.s) || 60;
    } else if (a === "close"){
      if (g.status === "answer"){ g.hint = pistaVisible(g); g.status = "review"; }
    } else if (a === "wait"){
      g.status = "lobby";
    } else if (a === "score"){
      var pts = p.pts || {}, limpio = {};
      g.teams.forEach(function(t){ if (pts[t.id] != null && !isNaN(Number(pts[t.id]))) limpio[t.id] = Math.round(Number(pts[t.id])); });
      g.points[g.idx] = limpio;
      if (p.mot){ // cada equipo recibe en su móvil el porqué de sus puntos
        var poner = {};
        g.teams.forEach(function(t){ if (p.mot[t.id]) poner[claveMot(code, g.idx, t.id)] = JSON.stringify(p.mot[t.id]); });
        if (Object.keys(poner).length) cache().putAll(poner, TTL);
      }
    } else if (a === "adjust"){
      if (!g.points.adj) g.points.adj = {}; // ajustes a mano, aparte de los puntos de cada pregunta
      g.points.adj[p.t] = (g.points.adj[p.t] || 0) + (Number(p.d) || 0);
    } else if (a === "end"){
      g.status = "over";
    } else {
      throw new Error("Acción desconocida");
    }
    guardar("g_" + code, g);
    return { ok: true };
  });
}
