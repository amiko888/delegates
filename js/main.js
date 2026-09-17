/* =========================================================
   დელეგატთა ქსელი — მთავარი სკრიპტი
   ეყრდნობა js/data.js-ში განსაზღვრულ municipalities / delegates მასივებს
   მარკაპი მორგებულია css/style.css-ის რეალურ კლასებზე (photo-based დიზაინი)
   ========================================================= */

(function () {
  "use strict";

  /* ---------- დამხმარე ფუნქციები ---------- */

  function initials(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    const first = parts[0] ? parts[0][0] : "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function uniqueRegions(list) {
    return Array.from(new Set(list.map((item) => item.region))).sort((a, b) =>
      a.localeCompare(b, "ka")
    );
  }

  function populateSelect(select, regions) {
    regions.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = r;
      select.appendChild(opt);
    });
  }

  function fullName(person) {
    return person.surname ? person.name + " " + person.surname : person.name;
  }

  // ქმნის ფოტოს კონტეინერს (class-ს თავად ანიჭებს გამომძახებელი).
  // თუ ფოტო ვერ ჩაიტვირთა, ავტომატურად ჩნდება ინიციალების placeholder.
  function photoEl(name) {
    var imagePath = arguments.length > 1 ? arguments[1] : undefined;
    const wrap = document.createElement("div");
    function showFallback() {
      wrap.innerHTML = "";
      wrap.appendChild(el("div", "photo-fallback", initials(name)));
    }
    if (imagePath) {
      const img = document.createElement("img");
      img.alt = name || "";
      img.loading = "lazy";
      img.onerror = showFallback;
      img.src = encodeURI(imagePath);
      wrap.appendChild(img);
    } else {
      showFallback();
    }
    return wrap;
  }

  const LOCAL_CLICKS_KEY = "delegateClicks";

  function localClicks() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_CLICKS_KEY) || "{}");
    } catch (err) {
      return {};
    }
  }

  function saveLocalClicks(counts) {
    localStorage.setItem(LOCAL_CLICKS_KEY, JSON.stringify(counts));
  }

  function getApiBase() {
    if (typeof window !== "undefined" && window.location) {
      if (window.location.protocol === "http:" || window.location.protocol === "https:") {
        if (window.location.port === "3000") return "";
        if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
          return "";
        }
        return "http://localhost:3000";
      }
    }
    return "http://localhost:3000";
  }

  function getAdminToken() {
    try {
      return localStorage.getItem("admin_token") || sessionStorage.getItem("admin_token") || "";
    } catch (err) {
      return "";
    }
  }

  async function fetchAllClicks() {
    const token = getAdminToken();
    if (!token) return localClicks();
    try {
      const res = await fetch(getApiBase() + "/api/clicks", {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
      });
      if (!res.ok) throw new Error("api");
      const data = await res.json();
      return data.counts || localClicks();
    } catch (err) {
      return localClicks();
    }
  }

  async function recordProfileClick(id) {
    const numId = Number(id);
    if (!numId) return null;

    // ნახვა ითვლება მხოლოდ სერვერზე, რათა ადმინ პანელმა რეალური მონაცემი აჩვენოს.
    const token = getAdminToken();
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;

    try {
      const res = await fetch(getApiBase() + "/api/clicks/" + encodeURIComponent(numId), {
        method: "POST",
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.count === "number") {
          return data.count;
        }
        return 0;
      }
    } catch (err) {
      // სერვერის გარეშე ვიზიტი არ ითვლება რეალურ ნახვად.
    }
    return null;
  }

  function formatViews(count) {
    const n = Number(count) || 0;
    return n + " ნახვა";
  }

  function setViewLabel(node, count) {
    if (!node) return;
    node.textContent = formatViews(count);
    node.hidden = false;
  }

  async function hydrateClickCounts() {
    const nodes = document.querySelectorAll("[data-click-count]");
    if (!nodes.length) return;
    const counts = await fetchAllClicks();
    nodes.forEach((node) => {
      const id = node.getAttribute("data-click-count");
      setViewLabel(node, counts[id] || 0);
    });
  }

  function facebookIcon(url) {
    const a = document.createElement("a");
    a.className = "icon-btn";
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("aria-label", "Facebook-ის გვერდი");
    a.title = "Facebook";
    a.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">' +
      '<path d="M13.5 21v-8h2.7l.4-3.2h-3.1V7.7c0-.9.25-1.5 1.55-1.5H16.7V3.4C16.4 3.36 15.5 3.28 14.4 3.28c-2.3 0-3.9 1.4-3.9 4V9.8H8v3.2h2.5V21h3z"/>' +
      "</svg>";
    return a;
  }

  /* ---------- მობილური მენიუ ---------- */

  function initMenu() {
    const toggle = document.querySelector(".menu-toggle");
    const links = document.querySelector(".nav-links");
    if (!toggle || !links) return;
    toggle.addEventListener("click", () => {
      const isOpen = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
    links.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => links.classList.remove("open"))
    );
  }

  /* ---------- ბარათების შემქმნელები ---------- */

  function delegateCard(d) {
    const card = el("a", "delegate-card");
    card.href = "delegate.html?id=" + encodeURIComponent(d.id);

    const photo = photoEl(d.name, d.image);
    photo.className = "card-photo " + photo.className;
    card.appendChild(photo);

    const body = el("div", "card-body");
    body.appendChild(el("h3", null, d.name));
    body.appendChild(el("p", "delegate-location", d.municipality + " · " + d.region));
    const meta = el("div", "card-meta");
    meta.appendChild(el("span", "small-link", "პროფილის ნახვა →"));
    body.appendChild(meta);
    card.appendChild(body);

    return card;
  }

  /* ---------- მთავარი გვერდი (index.html) ---------- */

  // შემთხვევითი დელეგატების შერჩევა სხვადასხვა რეგიონების მიხედვით
  function getRandomDelegates(count = 6) {
    const shuffled = [...delegates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const picked = [];
    const usedRegions = new Set();

    for (const d of shuffled) {
      if (!usedRegions.has(d.region)) {
        picked.push(d);
        usedRegions.add(d.region);
        if (picked.length === count) break;
      }
    }

    if (picked.length < count) {
      for (const d of shuffled) {
        if (!picked.includes(d)) {
          picked.push(d);
          if (picked.length === count) break;
        }
      }
    }

    return picked;
  }

  function renderFeaturedDelegates() {
    const featD = document.getElementById("featuredDelegates");
    if (!featD) return;
    featD.innerHTML = "";
    const randomDelegates = getRandomDelegates(6);
    randomDelegates.forEach((d) => featD.appendChild(delegateCard(d)));
  }

  function renderHome() {
    const statM = document.getElementById("statMunicipalities");
    const statD = document.getElementById("statDelegates");
    const statR = document.getElementById("statRegions");
    if (!statM && !statD && !statR) return; // ეს არ არის მთავარი გვერდი

    if (statM) statM.textContent = "51";
    if (statD) animateCount(statD, delegates.length);
    if (statR) animateCount(statR, uniqueRegions(municipalities).length);

    renderFeaturedDelegates();

    const shuffleBtn = document.getElementById("shuffleDelegatesBtn");
    if (shuffleBtn) {
      shuffleBtn.addEventListener("click", function () {
        const svg = shuffleBtn.querySelector("svg");
        if (svg) svg.style.transform = "rotate(360deg)";
        setTimeout(() => {
          if (svg) svg.style.transform = "";
        }, 400);
        renderFeaturedDelegates();
      });
    }
  }

  function animateCount(node, target) {
    const duration = 900;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(tick);
    }
    const prefersReduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      node.textContent = target;
    } else {
      requestAnimationFrame(tick);
    }
  }

  /* ---------- დელეგატების გვერდი ---------- */

  function renderDelegatesPage() {
    const list = document.getElementById("delegateList");
    if (!list) return;

    const searchInput = document.getElementById("delegateSearch");
    const regionSelect = document.getElementById("delegateRegionFilter");
    const empty = document.getElementById("delegateEmpty");

    populateSelect(regionSelect, uniqueRegions(delegates));

    function draw() {
      const q = (searchInput.value || "").trim().toLowerCase();
      const region = regionSelect.value;
      list.innerHTML = "";
      const filtered = delegates.filter((d) => {
        const matchesQuery =
          !q ||
          d.name.toLowerCase().includes(q) ||
          d.municipality.toLowerCase().includes(q);
        const matchesRegion = !region || d.region === region;
        return matchesQuery && matchesRegion;
      });
      filtered.forEach((d) => list.appendChild(delegateCard(d)));
      empty.hidden = filtered.length !== 0;
    }

    searchInput.addEventListener("input", draw);
    regionSelect.addEventListener("change", draw);
    draw();
  }

  /* ---------- დელეგატის პროფილი (delegate.html?id=) ---------- */

  function renderDelegateProfile() {
    const main = document.getElementById("delegatePage");
    if (!main) return;

    const id = Number(qs("id"));
    const d = delegates.find((item) => item.id === id);

    if (!d) {
      main.innerHTML =
        '<section class="section"><div class="container empty">' +
        "<h2>დელეგატი ვერ მოიძებნა</h2>" +
        "<p>ბმული, რომელსაც მიჰყევი, არასწორია ან დელეგატი აღარ არის ხელმისაწვდომი.</p>" +
        '<a class="btn btn-primary" href="delegates.html">დელეგატების სია →</a>' +
        "</div></section>";
      return;
    }

    const hero = el("section", "profile-hero");
    const heroContainer = el("div", "container");

    const backWrapper = el("div", "profile-back-wrapper");
    const backBtn = el("a", "profile-back-btn");
    backBtn.href = "delegates.html";
    backBtn.setAttribute("aria-label", "დელეგატების სიაში დაბრუნება");
    backBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg><span>← უკან</span>';
    backBtn.addEventListener("click", function (e) {
      if (window.history.length > 1 && document.referrer) {
        e.preventDefault();
        window.history.back();
      }
    });
    backWrapper.appendChild(backBtn);
    heroContainer.appendChild(backWrapper);

    const heroInner = el("div", "profile-grid");

    const photo = photoEl(d.name, d.image);
    photo.className = "profile-image " + photo.className;
    heroInner.appendChild(photo);

    const copy = el("div", "profile-copy");
    const eyebrow = el("div", "eyebrow");
    eyebrow.appendChild(el("span"));
    eyebrow.appendChild(document.createTextNode("დელეგატი"));
    copy.appendChild(eyebrow);
    copy.appendChild(el("h1", null, d.name));
    copy.appendChild(el("p", "profile-role", d.municipality + " · " + d.region));
    // ვიზიტი ჩაიწეროს სერვერზე, მაგრამ სტატისტიკა საჯარო პროფილზე არ გამოჩნდეს.
    recordProfileClick(d.id);
    copy.appendChild(
      el(
        "p",
        "profile-bio",
        d.bio ||
          d.name + " არის ახალგაზრდული საქმიანობის დელეგატი მუნიციპალიტეტში „" + d.municipality + "“."
      )
    );

    const actions = el("div", "profile-actions");
    if (d.facebook) actions.appendChild(facebookIcon(d.facebook));
    copy.appendChild(actions);

    heroInner.appendChild(copy);
    heroContainer.appendChild(heroInner);
    hero.appendChild(heroContainer);

    const body = el("section", "section");
    const bodyInner = el("div", "container profile-details");

    const col1 = el("div");
    col1.appendChild(el("h2", null, "მუნიციპალიტეტი"));
    col1.appendChild(el("p", null, d.municipality + ", " + d.region + " რეგიონი."));
    bodyInner.appendChild(col1);

    const col2 = el("div");
    col2.appendChild(el("h2", null, "კონტაქტი"));
    if (d.phone || d.email || d.facebook) {
      const p = el("p");
      const parts = [];
      if (d.phone) parts.push(d.phone);
      if (d.email) parts.push(d.email);
      p.textContent = parts.join(" · ") || "";
      if (parts.length) col2.appendChild(p);
      if (d.facebook) {
        const fbLine = el("p");
        fbLine.appendChild(document.createTextNode("Facebook: "));
        const a = document.createElement("a");
        a.href = d.facebook;
        a.target = "_blank";
        a.rel = "noopener";
        a.className = "text-link";
        a.textContent = "გვერდის ნახვა →";
        fbLine.appendChild(a);
        col2.appendChild(fbLine);
      }
    } else {
      col2.appendChild(el("p", null, "საკონტაქტო ინფორმაცია მალე დაემატება."));
    }
    bodyInner.appendChild(col2);

    const bottomNav = el("div", "profile-bottom-nav");
    const bottomBack = el("a", "profile-bottom-back-btn");
    bottomBack.href = "delegates.html";
    bottomBack.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg><span>← დელეგატების სიაში დაბრუნება</span>';
    bottomBack.addEventListener("click", function (e) {
      if (window.history.length > 1 && document.referrer) {
        e.preventDefault();
        window.history.back();
      }
    });
    bottomNav.appendChild(bottomBack);
    bodyInner.appendChild(bottomNav);

    body.appendChild(bodyInner);
    main.appendChild(hero);
    main.appendChild(body);
  }

  /* ---------- გაშვება ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    initMenu();
    renderHome();
    renderDelegatesPage();
    renderDelegateProfile();
    hydrateClickCounts();
  });
})();