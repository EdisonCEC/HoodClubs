/* ================= HoopsHub — booking logic ================= */
"use strict";

/* ---------- Data (prices in Philippine Peso) ---------- */
const COURTS = [
  {
    id: "full", name: "Full Court", icon: "🏀", thumb: "thumb-a", rate: 1800,
    meta: "Regulation 94×50 ft maple floor, 10-ft breakaway rims, full shot clocks.",
    tags: ["Regulation size", "Shot clock", "Bleachers"],
  },
  {
    id: "half", name: "Half Court", icon: "🎯", thumb: "thumb-b", rate: 1000,
    meta: "Two 3-point arcs, glass backboards — perfect for shooting sessions and 1v1.",
    tags: ["Shooting", "1v1 / 3v3", "Glass boards"],
  },
  {
    id: "train", name: "Training Zone", icon: "⚡", thumb: "thumb-c", rate: 600,
    meta: "Machine, agility ladders, rebound net and hoops for focused skill work.",
    tags: ["Gun machine", "Agility gear", "Private"],
  },
];

const OPEN_HOUR = 6;   // 6:00 AM
const CLOSE_HOUR = 23; // 11:00 PM
const PEAK_START = 17; // 5 PM
const PEAK_END = 21;   // 9 PM
const PEAK_SURCHARGE = 300;
const STORE_KEY = "hoops_bookings";
const DAYS_AHEAD = 14;

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const pad = (n) => String(n).padStart(2, "0");
const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtHour = (h) => {
  const suffix = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:00 ${suffix}`;
};
const fmtHourShort = (h) => {
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${h >= 12 ? "p" : "a"}`;
};
const isPeak = (h) => h >= PEAK_START && h < PEAK_END;
const slotPrice = (court, h) => court.rate + (isPeak(h) ? PEAK_SURCHARGE : 0);
const money = (n) =>
  "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pesoShort = (n) => "₱" + Math.round(Number(n)).toLocaleString("en-PH");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtDateLong(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DOWS[dt.getDay()]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

function loadBookings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function saveBookings(list) {
  localStorage.setItem(STORE_KEY, JSON.stringify(list));
}

/* ---------- State ---------- */
const state = {
  step: 1,
  courtId: null,
  date: null,
  slots: [],
  payMethod: "card",
  bookings: loadBookings(),
};
let lastShownTotal = 0;

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg, type = "") {
  const el = $("#toast");
  $("#toastText").textContent = msg;
  el.hidden = false;
  el.className = `toast show ${type}`;
  // restart progress bar animation
  const bar = $("#toastBar");
  bar.style.animation = "none";
  void bar.offsetWidth;
  bar.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

/* ---------- Availability ---------- */
function bookedHours(courtId, dateISO) {
  const set = new Set();
  state.bookings
    .filter((b) => b.courtId === courtId && b.date === dateISO)
    .forEach((b) => b.slots.forEach((h) => set.add(h)));
  return set;
}

function isPastSlot(dateISO, hour) {
  const now = new Date();
  const [y, m, d] = dateISO.split("-").map(Number);
  const slotDate = new Date(y, m - 1, d, hour, 0, 0);
  return slotDate <= now;
}

/* ---------- Render: court cards ---------- */
function renderCourtCards() {
  $("#courtGrid").innerHTML = COURTS.map((c) => `
    <article class="court-card-item reveal">
      <div class="court-thumb ${c.thumb}"><span>${c.name}</span></div>
      <div class="court-body">
        <h3>${c.icon} ${c.name}</h3>
        <p class="meta">${c.meta}</p>
        <div class="court-tags">${c.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
        <div class="court-foot">
          <div class="court-price">${pesoShort(c.rate)}<small>/hr</small></div>
          <button class="btn btn-primary" data-book-court="${c.id}">Book now</button>
        </div>
      </div>
    </article>`).join("");

  $$("[data-book-court]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.courtId = btn.dataset.bookCourt;
      renderCourtPicker();
      goToStep(2);
      $("#booking").scrollIntoView({ behavior: "smooth" });
    })
  );
}

/* ---------- Render: pricing ---------- */
function renderPricing() {
  $("#priceGrid").innerHTML = COURTS.map((c, i) => `
    <div class="price-card reveal ${i === 0 ? "popular" : ""}">
      ${i === 0 ? '<span class="pop-badge">Popular</span>' : ""}
      <h3>${c.name}</h3>
      <div class="price-amount">${pesoShort(c.rate)}<small>/hour</small></div>
      <p class="price-sub">+ ${pesoShort(PEAK_SURCHARGE)}/hr during peak (5–9 PM)</p>
      <ul class="price-list">
        <li>${c.meta}</li>
        <li>${c.tags.join(" · ")}</li>
        <li>Free cancellation up to 6h before</li>
        <li>Water fountain &amp; locker access</li>
      </ul>
      <button class="btn btn-primary" data-book-court="${c.id}" style="width:100%">Book ${c.name}</button>
    </div>`).join("");

  $$("#priceGrid [data-book-court]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.courtId = btn.dataset.bookCourt;
      renderCourtPicker();
      goToStep(2);
      $("#booking").scrollIntoView({ behavior: "smooth" });
    })
  );
}

/* ---------- Render: step 1 court picker ---------- */
function renderCourtPicker() {
  $("#courtPicker").innerHTML = COURTS.map((c) => `
    <button type="button" class="pick ${state.courtId === c.id ? "selected" : ""}" data-pick="${c.id}">
      <span class="pk-check">✓</span>
      <span class="pk-icon">${c.icon}</span>
      <span class="pk-name">${c.name}</span>
      <span class="pk-meta">${c.tags.join(" · ")}</span>
      <span class="pk-price">${pesoShort(c.rate)}/hr</span>
    </button>`).join("");

  $$("[data-pick]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.courtId = btn.dataset.pick;
      state.slots = [];
      renderCourtPicker();
      pop($("#courtPicker .pick.selected"));
      renderSlots();
      updateChip();
      updateNav();
    })
  );
}

/* ---------- Render: step 2 date strip ---------- */
function renderDateStrip() {
  const today = new Date();
  let html = "";
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const iso = toISODate(d);
    html += `
      <button type="button" class="date-pick ${state.date === iso ? "selected" : ""} ${i === 0 ? "today" : ""}" data-date="${iso}">
        <span class="dow">${i === 0 ? "Today" : DOWS[d.getDay()]}</span>
        <span class="dnum">${d.getDate()}</span>
        <span class="dmon">${MONTHS[d.getMonth()]}</span>
      </button>`;
  }
  $("#dateStrip").innerHTML = html;

  $$("#dateStrip [data-date]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.date = btn.dataset.date;
      state.slots = [];
      renderDateStrip();
      renderSlots();
      updateChip();
      updateNav();
    })
  );

  // keep the selected date in view horizontally
  const strip = $("#dateStrip");
  const sel = strip.querySelector(".date-pick.selected");
  if (sel) strip.scrollLeft = sel.offsetLeft - strip.clientWidth / 2 + sel.offsetWidth / 2;
}

/* ---------- Render: step 3 slots ---------- */
function renderSlots() {
  const grid = $("#slotGrid");
  const hint = $("#slotHint");
  if (!state.courtId || !state.date) {
    grid.innerHTML = "";
    hint.textContent = "Pick a court and date first.";
    hint.className = "hint warn";
    return;
  }
  hint.className = "hint";
  hint.textContent = "Tap a slot to start your reservation. Pick consecutive hours for longer sessions.";

  const court = COURTS.find((c) => c.id === state.courtId);
  const busy = bookedHours(state.courtId, state.date);
  let html = "";

  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    const past = isPastSlot(state.date, h);
    const unavailable = busy.has(h) || past;
    const sel = state.slots.includes(h);
    const cls = ["slot", unavailable ? "busy" : "", sel ? "selected" : "", isPeak(h) ? "peak" : ""].filter(Boolean).join(" ");
    const label = past ? "Closed" : busy.has(h) ? "Booked" : "";
    html += `
      <button type="button" class="${cls}" data-slot="${h}" style="animation-delay:${(h - OPEN_HOUR) * 22}ms" ${unavailable ? "disabled" : ""}>
        ${fmtHour(h)}
        <span class="st-price">${label || pesoShort(slotPrice(court, h))}</span>
      </button>`;
  }
  grid.innerHTML = html;

  $$("[data-slot]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const h = Number(btn.dataset.slot);
      const idx = state.slots.indexOf(h);
      if (idx >= 0) state.slots.splice(idx, 1);
      else state.slots.push(h);
      state.slots.sort((a, b) => a - b);
      btn.classList.toggle("selected", state.slots.includes(h));
      pop(btn);
      updateChip();
      updateNav();
    })
  );
}

function pop(el) {
  if (!el) return;
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
}

/* ---------- Selection chip ---------- */
function updateChip() {
  const chip = $("#selChip");
  const parts = [];
  if (state.courtId) parts.push(COURTS.find((c) => c.id === state.courtId).name);
  if (state.date) {
    const [, m, d] = state.date.split("-").map(Number);
    parts.push(`${MONTHS[m - 1]} ${d}`);
  }
  if (state.slots.length) {
    const first = state.slots[0];
    const last = state.slots[state.slots.length - 1];
    parts.push(state.slots.length === 1 ? fmtHour(first) : `${fmtHourShort(first)} – ${fmtHour(last + 1)}`);
  }
  chip.innerHTML = parts.length ? `Selected: <b>${parts.join(" · ")}</b>` : "";
}

/* ---------- Pricing math ---------- */
function computeTotal() {
  const court = COURTS.find((c) => c.id === state.courtId);
  if (!court) return { court, hours: 0, base: 0, peakFee: 0, total: 0, peakHours: [] };
  let base = 0, peakFee = 0;
  const peakHours = [];
  state.slots.forEach((h) => {
    base += court.rate;
    if (isPeak(h)) { peakFee += PEAK_SURCHARGE; peakHours.push(h); }
  });
  return { court, hours: state.slots.length, base, peakFee, total: base + peakFee, peakHours };
}

function payMethodLabel(m) {
  return m === "card" ? "Paid by card" : m === "gcash" ? "Paid via GCash" : "Pay at counter";
}

function renderSummary() {
  const t = computeTotal();
  const court = COURTS.find((c) => c.id === state.courtId);
  $("#orderSummary").innerHTML = `
    <h4>Order summary</h4>
    <div class="sum-row"><span>Court</span><strong>${court.icon} ${court.name}</strong></div>
    <div class="sum-row"><span>Date</span><strong>${fmtDateLong(state.date)}</strong></div>
    <div class="sum-row"><span>Time</span><strong>${fmtHour(state.slots[0])} – ${fmtHour(state.slots[state.slots.length - 1] + 1)}</strong></div>
    <div class="sum-row"><span>Players</span><strong>${$("#players").value}</strong></div>
    <div style="margin-top:14px">
      <div class="sum-line"><span>${t.hours} × ${pesoShort(t.court.rate)}/hr</span><b>${money(t.base)}</b></div>
      ${t.peakFee ? `<div class="sum-line"><span>Peak surcharge (${t.peakHours.map(fmtHourShort).join(", ")})</span><b>${money(t.peakFee)}</b></div>` : ""}
      <div class="sum-line"><span>Taxes</span><b>Included</b></div>
    </div>
    <div class="sum-total"><span>Total</span><b>${money(t.total)}</b></div>`;

  animateNumber($("#orderSummary .sum-total b"), lastShownTotal, t.total, 600, money);
  lastShownTotal = t.total;

  const cardName = $("#cardName");
  if (!cardName.value.trim()) cardName.value = $("#fullName").value.trim().toUpperCase();
  updatePayButton();
}

function updatePayButton() {
  const t = computeTotal().total;
  $("#btnNext").textContent =
    state.payMethod === "counter" ? "Confirm reservation"
      : state.payMethod === "gcash" ? `Pay via GCash · ${pesoShort(t)}`
        : `Pay ${money(t)}`;
}

/* ---------- Number / money animation ---------- */
function animateNumber(el, from, to, dur, fmt) {
  if (!el) return;
  if (Math.abs(from - to) < 0.005) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- Step machine ---------- */
function goToStep(n) {
  const dir = n > state.step ? "slide-next" : "slide-prev";
  state.step = Math.min(5, Math.max(1, n));
  $$(".panel").forEach((p) => p.classList.toggle("active", Number(p.dataset.panel) === state.step));
  $$(".step").forEach((s) => {
    const num = Number(s.dataset.step);
    s.classList.toggle("active", num === state.step);
    s.classList.toggle("done", num < state.step);
    s.querySelector(".step-num").textContent = num < state.step ? "✓" : num;
  });
  $$(".step-bar").forEach((b, i) => b.classList.toggle("filled", i < state.step - 1));

  $("#btnBack").disabled = state.step === 1;
  $("#btnNext").textContent = state.step === 5 ? "Pay now" : "Continue →";
  if (state.step === 5) renderSummary();
  updateChip();

  const panel = $(`.panel[data-panel="${state.step}"]`);
  if (panel) {
    panel.classList.remove("slide-next", "slide-prev");
    void panel.offsetWidth;
    panel.classList.add(dir);
    const y = panel.getBoundingClientRect().top + window.scrollY - 110;
    window.scrollTo({ top: y, behavior: "smooth" });
  }
}

function validateStep() {
  if (state.step === 1 && !state.courtId) { toast("Pick a court first.", "err"); return false; }
  if (state.step === 2 && !state.date) { toast("Pick a date first.", "err"); return false; }
  if (state.step === 3) {
    if (!state.slots.length) { toast("Select at least one time slot.", "err"); return false; }
    const busy = bookedHours(state.courtId, state.date);
    const clash = state.slots.filter((h) => busy.has(h) || isPastSlot(state.date, h));
    if (clash.length) {
      state.slots = state.slots.filter((h) => !clash.includes(h));
      renderSlots();
      toast("Some slots were just taken — pick again.", "err");
      return false;
    }
  }
  if (state.step === 4 && !validateDetails()) return false;
  if (state.step === 5 && !validatePayment()) return false;
  return true;
}

/* ---------- Form validation ---------- */
function setErr(name, msg) {
  const small = $(`[data-err="${name}"]`);
  if (small) small.textContent = msg;
  const input = $("#" + name);
  if (input) input.closest(".field")?.classList.toggle("invalid", !!msg);
}

function validateDetails() {
  let ok = true;
  const name = $("#fullName").value.trim();
  const phone = $("#phone").value.trim();
  const email = $("#email").value.trim();

  if (name.length < 2) { setErr("fullName", "Enter your full name."); ok = false; } else setErr("fullName", "");

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) { setErr("phone", "Enter a valid PH mobile/landline."); ok = false; } else setErr("phone", "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setErr("email", "Enter a valid email."); ok = false; } else setErr("email", "");

  if (!ok) toast("Fix the highlighted fields.", "err");
  return ok;
}

function luhn(num) {
  let sum = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = Number(num[i]);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

function validatePayment() {
  if (state.payMethod === "counter") return true;

  if (state.payMethod === "gcash") {
    const v = $("#gcashNum").value.replace(/\D/g, "");
    if (!/^09\d{9}$/.test(v)) {
      setErr("gcashNum", "Enter a valid 09XX mobile number.");
      toast("Check your GCash number.", "err");
      return false;
    }
    setErr("gcashNum", "");
    return true;
  }

  let ok = true;
  const cn = $("#cardName").value.trim();
  const cnum = $("#cardNum").value.replace(/\s/g, "");
  const cexp = $("#cardExp").value.trim();
  const ccvc = $("#cardCvc").value.trim();

  if (cn.length < 2) { setErr("cardName", "Name required."); ok = false; } else setErr("cardName", "");

  if (cnum.length < 13 || cnum.length > 19 || !/^\d+$/.test(cnum) || !luhn(cnum)) {
    setErr("cardNum", "Enter a valid card number (try 4242 4242 4242 4242)."); ok = false;
  } else setErr("cardNum", "");

  const expMatch = cexp.match(/^(\d{2})\/(\d{2})$/);
  if (!expMatch) { setErr("cardExp", "MM/YY"); ok = false; }
  else {
    const mm = Number(expMatch[1]), yy = Number(expMatch[2]);
    const now = new Date();
    const expDate = new Date(2000 + yy, mm, 1);
    if (mm < 1 || mm > 12) { setErr("cardExp", "Invalid month."); ok = false; }
    else if (expDate <= now) { setErr("cardExp", "Card expired."); ok = false; }
    else setErr("cardExp", "");
  }

  if (!/^\d{3,4}$/.test(ccvc)) { setErr("cardCvc", "3–4 digits."); ok = false; } else setErr("cardCvc", "");

  if (!ok) toast("Check your card details.", "err");
  return ok;
}

/* ---------- Confetti ---------- */
function confettiBurst() {
  const layer = $("#confettiLayer");
  layer.innerHTML = "";
  const colors = ["#ff6b1a", "#c8ff2e", "#ffffff", "#3ddc84", "#ff8f3f"];
  for (let i = 0; i < 90; i++) {
    const p = document.createElement("i");
    p.className = "confetti";
    p.style.left = Math.random() * 100 + "%";
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.7 + "s";
    p.style.animationDuration = 1.6 + Math.random() * 1.8 + "s";
    const w = 6 + Math.random() * 7;
    p.style.width = w + "px";
    p.style.height = w * 0.55 + "px";
    layer.appendChild(p);
  }
  setTimeout(() => (layer.innerHTML = ""), 4200);
}

/* ---------- Confirm booking ---------- */
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `HB-${s}`;
}

function confirmBooking() {
  const t = computeTotal();
  const booking = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    code: makeCode(),
    courtId: state.courtId,
    courtName: t.court.name,
    date: state.date,
    slots: [...state.slots],
    name: $("#fullName").value.trim(),
    phone: $("#phone").value.trim(),
    email: $("#email").value.trim(),
    players: $("#players").value,
    notes: $("#notes").value.trim(),
    payMethod: state.payMethod,
    total: t.total,
    createdAt: new Date().toISOString(),
  };
  state.bookings.push(booking);
  saveBookings(state.bookings);

  $("#modalCode").textContent = booking.code;
  $("#modalDetails").innerHTML = `
    <div class="sum-row"><span>Court</span><strong>${t.court.icon} ${t.courtName}</strong></div>
    <div class="sum-row"><span>Date</span><strong>${fmtDateLong(booking.date)}</strong></div>
    <div class="sum-row"><span>Time</span><strong>${fmtHour(booking.slots[0])} – ${fmtHour(booking.slots[booking.slots.length - 1] + 1)}</strong></div>
    <div class="sum-row"><span>Players</span><strong>${booking.players}</strong></div>
    <div class="sum-row"><span>Total</span><strong>${money(booking.total)} · ${payMethodLabel(booking.payMethod)}</strong></div>`;
  $("#confirmModal").hidden = false;
  confettiBurst();

  // reset wizard
  state.courtId = null;
  state.date = null;
  state.slots = [];
  state.payMethod = "card";
  lastShownTotal = 0;
  $$(".pm").forEach((p) => p.classList.toggle("active", p.dataset.method === "card"));
  $("#cardFields").hidden = false;
  $("#cardFields").classList.remove("disabled");
  $("#gcashFields").hidden = true;
  ["fullName", "phone", "email", "notes", "cardName", "cardNum", "cardExp", "cardCvc", "gcashNum"].forEach((id) => {
    const el = $("#" + id);
    if (el) el.value = "";
  });
  renderCourtPicker();
  renderDateStrip();
  renderSlots();
  renderBookings();
  goToStep(1);
}

/* ---------- My bookings ---------- */
function renderBookings() {
  const wrap = $("#bookingsList");
  const list = [...state.bookings].sort((a, b) =>
    a.date === b.date ? a.slots[0] - b.slots[0] : a.date < b.date ? -1 : 1
  );

  const upcomingCount = list.filter((b) => !isPastBooking(b)).length;
  const badge = $("#navBadge");
  badge.hidden = upcomingCount === 0;
  badge.textContent = upcomingCount;

  if (!list.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="es-icon">🏀</div>
        <h4>No reservations yet</h4>
        <p>Your booked courts will show up here. Ready to run some floors?</p>
        <a href="#booking" class="btn btn-primary">Book your first court</a>
      </div>`;
    return;
  }

  wrap.innerHTML = list.map((b) => {
    const [y, m, d] = b.date.split("-").map(Number);
    const past = isPastBooking(b);
    const court = COURTS.find((c) => c.id === b.courtId) || { icon: "🏀" };
    return `
      <div class="booking-item ${past ? "past" : ""}">
        <div class="bi-date">
          <div class="d">${d}</div>
          <div class="m">${MONTHS[m - 1]} ${DOWS[new Date(y, m - 1, d).getDay()]}</div>
        </div>
        <div class="bi-main">
          <h4>${court.icon} ${esc(b.courtName)}</h4>
          <div class="bi-sub">${fmtHour(b.slots[0])} – ${fmtHour(b.slots[b.slots.length - 1] + 1)} · ${b.slots.length} hr · ${b.players} players</div>
          <div class="bi-sub">${esc(b.name)} · ${esc(b.phone)}</div>
          <span class="bi-code">${esc(b.code)}</span>
        </div>
        <div class="bi-side">
          <span class="status ${past ? "done" : "upcoming"}">${past ? "Completed" : "Upcoming"}</span>
          <div class="bi-price">${money(b.total)}</div>
          ${past ? "" : `<button class="btn-cancel" data-cancel="${b.id}">Cancel</button>`}
        </div>
      </div>`;
  }).join("");

  $$("[data-cancel]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.dataset.cancel;
      const b = state.bookings.find((x) => x.id === id);
      if (!b) return;
      const start = new Date(`${b.date}T${pad(b.slots[0])}:00:00`);
      const hoursUntil = (start - new Date()) / 36e5;
      if (hoursUntil < 6) {
        toast("Free cancellation closed (less than 6h before). Call the desk.", "err");
        return;
      }
      if (!confirm(`Cancel booking ${b.code}?`)) return;
      const item = btn.closest(".booking-item");
      item.classList.add("removing");
      setTimeout(() => {
        state.bookings = state.bookings.filter((x) => x.id !== id);
        saveBookings(state.bookings);
        renderBookings();
        renderSlots();
        toast("Booking cancelled — slot released.", "ok");
      }, 330);
    })
  );
}

function isPastBooking(b) {
  const lastHour = b.slots[b.slots.length - 1];
  const end = new Date(`${b.date}T${pad(lastHour + 1)}:00:00`);
  return end <= new Date();
}

function updateNav() {
  renderBookings();
}

/* ---------- Input formatting ---------- */
function bindFormatting() {
  const cardNum = $("#cardNum");
  cardNum.addEventListener("input", () => {
    const digits = cardNum.value.replace(/\D/g, "").slice(0, 16);
    cardNum.value = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  });

  const cardExp = $("#cardExp");
  cardExp.addEventListener("input", () => {
    let v = cardExp.value.replace(/\D/g, "").slice(0, 4);
    if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
    cardExp.value = v;
  });

  $("#cardCvc").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
  });

  // PH phone: (09XX) XXX XXXX style
  $("#phone").addEventListener("input", (e) => {
    const d = e.target.value.replace(/\D/g, "").slice(0, 11);
    let v = d;
    if (d.length > 7) v = `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
    else if (d.length > 4) v = `${d.slice(0, 4)} ${d.slice(4)}`;
    e.target.value = v;
  });

  // GCash: 09XX XXX XXXX
  $("#gcashNum").addEventListener("input", (e) => {
    const d = e.target.value.replace(/\D/g, "").slice(0, 11);
    let v = d;
    if (d.length > 7) v = `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
    else if (d.length > 4) v = `${d.slice(0, 4)} ${d.slice(4)}`;
    e.target.value = v;
  });
}

/* ---------- Ripple effect ---------- */
function bindRipples() {
  document.addEventListener("click", (e) => {
    const t = e.target.closest(".btn, .slot, .date-pick, .pick, .pm");
    if (!t || t.disabled) return;
    const r = t.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const span = document.createElement("span");
    span.className = "ripple";
    span.style.width = span.style.height = size + "px";
    span.style.left = e.clientX - r.left - size / 2 + "px";
    span.style.top = e.clientY - r.top - size / 2 + "px";
    t.appendChild(span);
    setTimeout(() => span.remove(), 650);
  });
}

/* ---------- 3D tilt ---------- */
function bindTilt(selector, max = 6) {
  $$(selector).forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform =
        `translateY(-6px) perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`;
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });
  });
}

/* ---------- Hero parallax ---------- */
function bindHeroParallax() {
  const hero = $(".hero");
  const visual = $(".hero-visual");
  if (!hero || !visual) return;
  hero.addEventListener("mousemove", (e) => {
    const px = e.clientX / window.innerWidth - 0.5;
    const py = e.clientY / window.innerHeight - 0.5;
    visual.style.transform = `translate(${(px * 20).toFixed(1)}px, ${(py * 16).toFixed(1)}px)`;
  });
  hero.addEventListener("mouseleave", () => {
    visual.style.transform = "";
  });
}

/* ---------- Count-up stats ---------- */
function bindCounters() {
  $$("[data-count]").forEach((el) => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(el);
        const to = Number(el.dataset.count);
        const suffix = el.dataset.suffix || "";
        animateNumber(el, 0, to, 1200, (v) => Math.round(v) + suffix);
      });
    }, { threshold: 0.5 });
    io.observe(el);
  });
}

/* ---------- Nav / UI chrome ---------- */
function bindChrome() {
  const nav = $("#navbar");
  const bar = $("#scrollProgress");
  const onScroll = () => {
    nav.classList.toggle("scrolled", window.scrollY > 30);
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (docH > 0 ? (window.scrollY / docH) * 100 : 0) + "%";
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const toggle = $("#navToggle");
  const links = $("#navLinks");
  toggle.addEventListener("click", () => {
    toggle.classList.toggle("open");
    links.classList.toggle("open");
  });
  $$("#navLinks a").forEach((a) =>
    a.addEventListener("click", () => {
      toggle.classList.remove("open");
      links.classList.remove("open");
    })
  );

  // active nav link while scrolling
  const navIo = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      $$("#navLinks a").forEach((a) =>
        a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id)
      );
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  ["home", "courts", "booking", "pricing", "my-bookings"].forEach((id) => {
    const s = document.getElementById(id);
    if (s) navIo.observe(s);
  });

  // reveal on scroll (with sweep so jump-scrolls can't strand hidden content)
  const revealables = $$(".reveal");
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  revealables.forEach((el) => io.observe(el));

  let sweepQueued = false;
  const sweep = () => {
    sweepQueued = false;
    revealables.forEach((el) => {
      if (el.classList.contains("in")) return;
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
        el.classList.add("in");
        io.unobserve(el);
      }
    });
  };
  window.addEventListener("scroll", () => {
    if (!sweepQueued) { sweepQueued = true; requestAnimationFrame(sweep); }
  }, { passive: true });
  sweep();

  $("#year").textContent = new Date().getFullYear();
}

/* ---------- Wizard buttons ---------- */
function bindWizard() {
  $("#btnNext").addEventListener("click", () => {
    if (!validateStep()) return;
    if (state.step === 5) {
      const btn = $("#btnNext");
      btn.disabled = true;
      btn.textContent = "Processing…";
      setTimeout(() => {
        btn.disabled = false;
        confirmBooking();
        toast("Court reserved — see you on the hardwood!", "ok");
      }, 900);
      return;
    }
    goToStep(state.step + 1);
  });

  $("#btnBack").addEventListener("click", () => goToStep(state.step - 1));

  // payment method toggle
  $$(".pm").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.payMethod = btn.dataset.method;
      $$(".pm").forEach((b) => b.classList.toggle("active", b === btn));
      $("#cardFields").hidden = state.payMethod !== "card";
      $("#cardFields").classList.toggle("disabled", state.payMethod !== "card");
      $("#gcashFields").hidden = state.payMethod !== "gcash";
      $("#gcashFields").classList.toggle("disabled", state.payMethod !== "gcash");
      updatePayButton();
    })
  );

  // modal
  $("#modalDismiss").addEventListener("click", () => ($("#confirmModal").hidden = true));
  $("#modalView").addEventListener("click", () => ($("#confirmModal").hidden = true));
  $("#confirmModal").addEventListener("click", (e) => {
    if (e.target === $("#confirmModal")) $("#confirmModal").hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $("#confirmModal").hidden = true;
  });

  // clear errors while typing
  $$("#detailsForm input, #cardFields input, #gcashFields input").forEach((inp) =>
    inp.addEventListener("input", () => setErr(inp.id, ""))
  );
}

/* ---------- Init ---------- */
function init() {
  renderCourtCards();
  renderPricing();
  renderCourtPicker();
  renderDateStrip();
  renderSlots();
  renderBookings();
  bindFormatting();
  bindChrome();
  bindWizard();
  bindRipples();
  bindTilt(".court-card-item", 6);
  bindTilt(".price-card", 5);
  bindHeroParallax();
  bindCounters();
  // freeze slot entrance animation once played so .pop doesn't replay it
  $("#slotGrid").addEventListener("animationend", (e) => {
    if (e.animationName === "slotIn") e.target.classList.add("settled");
  });
  goToStep(1);
}

document.addEventListener("DOMContentLoaded", init);
