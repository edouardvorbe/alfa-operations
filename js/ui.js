// Petits utilitaires d'interface
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }

let toastTimer;
export function toast(msg, isErr = false) {
  const t = $("#toast"); t.textContent = msg; t.className = "toast" + (isErr ? " err" : ""); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, isErr ? 6000 : 3000);
}

export function modal(html, { onOpen } = {}) {
  const m = $("#modal"), box = $(".modal-box", m);
  box.innerHTML = html; m.hidden = false;
  const close = () => { m.hidden = true; box.innerHTML = ""; };
  m.onclick = e => { if (e.target === m) close(); };
  $$("[data-close]", box).forEach(b => b.onclick = close);
  if (onOpen) onOpen(box, close);
  return close;
}
export function confirmDlg(msg, okLabel = "Confirmer") {
  return new Promise(res => {
    modal(`<h3>Confirmation</h3><p>${esc(msg)}</p><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-close>Annuler</button><button class="btn danger" id="okBtn">${esc(okLabel)}</button></div>`,
      { onOpen: (box, close) => { $("#okBtn", box).onclick = () => { close(); res(true); }; $("[data-close]", box).addEventListener("click", () => res(false)); } });
  });
}
export function lightbox(src) {
  const lb = $("#lightbox"); $("img", lb).src = src; lb.hidden = false;
  $(".lb-close", lb).onclick = () => { lb.hidden = true; $("img", lb).src = ""; };
  lb.onclick = e => { if (e.target === lb) { lb.hidden = true; $("img", lb).src = ""; } };
}
export const fmtDate = d => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
export const fmtDateTime = d => d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const deptLabel = d => ({ "NORD": "Nord", "NORD EST": "Nord-Est", "NORD OUEST": "Nord-Ouest", "ARTIBONITE": "Artibonite", "CENTRE": "Centre", "OUEST": "Ouest", "NIPPES": "Nippes", "SUD": "Sud", "SUD EST": "Sud-Est", "GRAND ANSE": "Grand'Anse" }[d] || d || "—");
export function dms(lat, lon) {
  if (lat == null || lon == null) return "";
  const f = (v, p, n) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d - m / 60) * 3600).toFixed(2); return `${d}°${m}'${s}"${v >= 0 ? p : n}`; };
  return `${f(lat, "N", "S")} ${f(lon, "E", "W")}`;
}
export function parseCoords(txt) {
  if (!txt) return null;
  const t = txt.trim().replace(/,/g, (m, i, s) => /\d,\d/.test(s.slice(i - 1, i + 2)) && !/\s/.test(s) ? "." : m);
  let m = t.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2])];
  const re = /(\d+)[°\s]+(\d+)['′\s]+(\d+(?:[.,]\d+)?)["″\s]*([NSEW])/gi; const parts = []; let r;
  while ((r = re.exec(t))) { let v = +r[1] + r[2] / 60 + parseFloat(r[3].replace(",", ".")) / 3600; if (/[SW]/i.test(r[4])) v = -v; parts.push(v); }
  if (parts.length === 2) return parts;
  m = t.match(/(\d+(?:\.\d+)?)\s*([NS])[\s,;]+(\d+(?:\.\d+)?)\s*([EW])/i);
  if (m) return [+m[1] * (/S/i.test(m[2]) ? -1 : 1), +m[3] * (/W/i.test(m[4]) ? -1 : 1)];
  return null;
}
export function downloadXlsx(name, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [title, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), title.slice(0, 31));
  XLSX.writeFile(wb, name);
}
