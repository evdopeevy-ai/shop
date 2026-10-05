// Netlify-функция: принимает заказ из Mini App и шлёт его владельцу в Telegram.
// Переменные окружения в Netlify: BOT_TOKEN (обязательно), ADMIN_CHAT_ID (необязательно).
const crypto = require("crypto");

function verify(initData, token){
  const p = new URLSearchParams(initData || "");
  const hash = p.get("hash"); if(!hash) return null; p.delete("hash");
  const str = [...p.entries()].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const h = crypto.createHmac("sha256", secret).update(str).digest("hex");
  const a = Buffer.from(h), b = Buffer.from(hash);
  if(a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if(Date.now() / 1000 - Number(p.get("auth_date")) > 86400) return null;
  try{ return JSON.parse(p.get("user")); }catch(e){ return null; }
}
const DELIV = ["Самовывоз", "СДЭК", "Почта России"];
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const money = n => Number(n).toLocaleString("ru-RU") + " ₽";

exports.handler = async (event) => {
  if(event.httpMethod !== "POST") return { statusCode: 405, body: "" };
  const token = process.env.BOT_TOKEN;
  if(!token) return { statusCode: 500, body: "BOT_TOKEN не задан" };
  let d; try{ d = JSON.parse(event.body || "{}"); }catch(e){ return { statusCode: 400, body: "" }; }

  const user = verify(d.initData, token);
  if(!user) return { statusCode: 401, body: "Откройте магазин из Telegram" };

  const items = (Array.isArray(d.items) ? d.items : []).slice(0, 30).map(i => ({
    name: String(i.name || "").slice(0, 80), size: String(i.size || "").slice(0, 20),
    qty: Math.min(50, Math.max(1, parseInt(i.qty) || 1)), price: Math.max(0, Number(i.price) || 0)
  }));
  if(!items.length) return { statusCode: 400, body: "" };
  if(!DELIV.includes(d.delivery)) return { statusCode: 400, body: "" };
  const address = d.delivery === "Самовывоз" ? "" : String(d.address || "").slice(0, 200);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  const who = `<a href="tg://user?id=${user.id}">${esc([user.first_name, user.last_name].filter(Boolean).join(" ") || "Покупатель")}</a>` +
    (user.username ? ` (@${esc(user.username)})` : "");
  const text = `🧙 <b>Новый заказ</b>\nПокупатель: ${who}\n\n` +
    items.map(i => `• ${esc(i.name)}${i.size ? ", " + esc(i.size) : ""} × ${i.qty} — ${money(i.price * i.qty)}`).join("\n") +
    `\n\n<b>Итого: ${money(total)}</b>` + `\nПолучение: ${d.delivery}` + (address ? `\nАдрес: ${esc(address)}` : "");

  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: process.env.ADMIN_CHAT_ID || "1390292429", text, parse_mode: "HTML", disable_web_page_preview: true })
  });
  return { statusCode: r.ok ? 200 : 502, body: "" };
};
