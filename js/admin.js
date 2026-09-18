/* =========================================================
   ადმინ პანელის სკრიპტი (js/admin.js)
   დელეგატების ნახვების სტატისტიკის მართვა და მონიტორინგი
   მხარდაჭერილია როგორც Node.js სერვერი, ისე Live Server
   ========================================================= */

(function () {
  "use strict";

  const TOKEN_KEY = "admin_token";
  const LOCAL_CLICKS_KEY = "delegateClicks";
  let cachedCounts = {};
  let currentDelegatesList = [];
  let currentEditingDelegateId = null;

  /* ---------- დამხმარე მეთოდები ---------- */

  function getApiBase() {
    // Netlify redirects in netlify.toml proxy /api/* → /.netlify/functions/*
    // This works both in production (Netlify) and local dev (netlify dev).
    return "";
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setToken(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch (e) {}
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  function localClicks() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_CLICKS_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveLocalClicks(counts) {
    try {
      localStorage.setItem(LOCAL_CLICKS_KEY, JSON.stringify(counts));
    } catch (e) {}
  }

  function authHeaders() {
    const token = getToken();
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    return headers;
  }

  function initials(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    const first = parts[0] ? parts[0][0] : "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }

  /* ---------- ხედების გადართვა ---------- */

  function showLogin(errorMsg) {
    document.getElementById("loginSection").style.display = "flex";
    document.getElementById("dashboardSection").style.display = "none";
    document.getElementById("logoutBtn").style.display = "none";
    const errBox = document.getElementById("loginError");
    if (errorMsg) {
      errBox.textContent = errorMsg;
      errBox.style.display = "block";
    } else {
      errBox.style.display = "none";
    }
  }

  function showDashboard() {
    document.getElementById("loginSection").style.display = "none";
    document.getElementById("dashboardSection").style.display = "block";
    document.getElementById("logoutBtn").style.display = "inline-flex";
  }

  /* ---------- ავტორიზაციის შემოწმება ---------- */

  async function checkAuth() {
    const token = getToken();
    if (!token) {
      showLogin();
      return false;
    }

    try {
      const res = await fetch(getApiBase() + "/api/admin/check", { headers: authHeaders() });
      if (res.ok) {
        showDashboard();
        loadStats();
        return true;
      }
    } catch (err) {
      if (token === "local_admin_token" || token.length >= 10) {
        showDashboard();
        loadStats();
        return true;
      }
    }
    clearToken();
    showLogin();
    return false;
  }

  /* ---------- ლოგინის დამუშავება ---------- */

  async function handleLogin(e) {
    e.preventDefault();
    const passwordInput = document.getElementById("adminPassword");
    const submitBtn = document.getElementById("loginSubmitBtn");
    const errorBox = document.getElementById("loginError");
    const password = passwordInput.value.trim();

    if (!password) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "შემოწმება...";
    errorBox.style.display = "none";

    try {
      const res = await fetch(getApiBase() + "/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (res.ok && data.ok && data.token) {
        setToken(data.token);
        passwordInput.value = "";
        showDashboard();
        loadStats();
        return;
      } else if (res.status === 401) {
        errorBox.textContent = data.error || "პაროლი არასწორია!";
        errorBox.style.display = "block";
        return;
      }
    } catch (err) {
      // სერვერი გათიშულია ან Live Server-ია — ლოკალური ვალიდაცია
      const savedPass = localStorage.getItem("admin_password") || "admin123";
      if (password === savedPass) {
        setToken("local_admin_token");
        passwordInput.value = "";
        showDashboard();
        loadStats();
        return;
      } else {
        errorBox.textContent = "პაროლი არასწორია!";
        errorBox.style.display = "block";
        return;
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "შესვლა →";
    }
  }

  /* ---------- გამოსვლა (Logout) ---------- */

  async function handleLogout() {
    try {
      await fetch(getApiBase() + "/api/admin/logout", {
        method: "POST",
        headers: authHeaders(),
      });
    } catch (e) {}
    clearToken();
    showLogin();
  }

  /* ---------- სტატისტიკის ჩატვირთვა და სინქრონიზაცია ---------- */

  async function loadStats() {
    cachedCounts = {};
    const statsError = document.getElementById("statsError");
    if (statsError) statsError.style.display = "none";

    try {
      const res = await fetch(getApiBase() + "/api/admin/stats", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        cachedCounts = data.counts || {};
      } else if (statsError) {
        statsError.textContent = "ნახვების ჩატვირთვა ვერ მოხერხდა. ხელახლა შედი ან განაახლე გვერდი.";
        statsError.style.display = "block";
      }
    } catch (err) {
      cachedCounts = {};
      if (statsError) {
        statsError.textContent = "სერვერთან დაკავშირება ვერ მოხერხდა. გაუშვი Node სერვერი და განაახლე გვერდი.";
        statsError.style.display = "block";
      }
    }

    buildDelegatesData();
    renderKPIs();
    renderTable();
  }

  function buildDelegatesData() {
    const list = typeof delegates !== "undefined" ? delegates : [];
    currentDelegatesList = list.map((d) => ({
      id: d.id,
      name: d.name,
      municipality: d.municipality,
      region: d.region,
      image: d.image,
      facebook: d.facebook,
      views: Number(cachedCounts[d.id]) || 0,
    }));
  }

  /* ---------- KPI ბარათების ჩვენება ---------- */

  function renderKPIs() {
    const totalDelegates = currentDelegatesList.length;
    let totalViews = 0;
    let topDelegate = null;
    let maxViews = -1;

    currentDelegatesList.forEach((d) => {
      totalViews += d.views;
      if (d.views > maxViews) {
        maxViews = d.views;
        topDelegate = d;
      }
    });

    const avgViews = totalDelegates > 0 ? (totalViews / totalDelegates).toFixed(1) : 0;

    document.getElementById("kpiTotalViews").textContent = totalViews.toLocaleString("ka-GE");
    document.getElementById("kpiTotalDelegates").textContent = totalDelegates;
    document.getElementById("kpiAvgViews").textContent = avgViews;

    const topEl = document.getElementById("kpiTopDelegate");
    const topCountEl = document.getElementById("kpiTopCount");
    if (topDelegate && maxViews > 0) {
      topEl.textContent = topDelegate.name;
      topCountEl.textContent = `${maxViews} ნახვა (${topDelegate.municipality})`;
    } else {
      topEl.textContent = "—";
      topCountEl.textContent = "ნახვები ჯერ არ არის";
    }
  }

  /* ---------- რეგიონების ფილტრის შევსება ---------- */

  function initRegionFilter() {
    const select = document.getElementById("adminRegionFilter");
    if (!select) return;
    const list = typeof delegates !== "undefined" ? delegates : [];
    const regions = Array.from(new Set(list.map((d) => d.region))).sort((a, b) =>
      a.localeCompare(b, "ka")
    );
    regions.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = r;
      select.appendChild(opt);
    });
  }

  /* ---------- ცხრილის გაფილტვრა და რენდერი ---------- */

  function getFilteredAndSortedList() {
    const searchVal = (document.getElementById("adminSearch").value || "").trim().toLowerCase();
    const regionVal = document.getElementById("adminRegionFilter").value;
    const sortBy = document.getElementById("adminSortBy").value;

    let filtered = currentDelegatesList.filter((d) => {
      const matchQuery =
        !searchVal ||
        d.name.toLowerCase().includes(searchVal) ||
        d.municipality.toLowerCase().includes(searchVal);
      const matchRegion = !regionVal || d.region === regionVal;
      return matchQuery && matchRegion;
    });

    filtered.sort((a, b) => {
      if (sortBy === "views-desc") return b.views - a.views;
      if (sortBy === "views-asc") return a.views - b.views;
      if (sortBy === "name-asc") return a.name.localeCompare(b.name, "ka");
      if (sortBy === "region-asc") return a.region.localeCompare(b.region, "ka");
      return 0;
    });

    return filtered;
  }

  function renderTable() {
    const tbody = document.getElementById("delegatesTableBody");
    const emptyNotice = document.getElementById("noResultsNotice");
    if (!tbody) return;

    tbody.innerHTML = "";
    const list = getFilteredAndSortedList();

    if (list.length === 0) {
      emptyNotice.style.display = "block";
      return;
    }
    emptyNotice.style.display = "none";

    const maxViews = Math.max(1, ...currentDelegatesList.map((d) => d.views));

    list.forEach((d, idx) => {
      const tr = document.createElement("tr");

      // 1. ინდექსი
      const tdNum = document.createElement("td");
      tdNum.style.color = "#94A3B8";
      tdNum.style.fontWeight = "600";
      tdNum.textContent = String(idx + 1);
      tr.appendChild(tdNum);

      // 2. დელეგატი (ფოტო + სახელი)
      const tdDelegate = document.createElement("td");
      const cellWrap = document.createElement("div");
      cellWrap.className = "delegate-cell";

      if (d.image) {
        const img = document.createElement("img");
        img.className = "delegate-thumb";
        img.src = encodeURI(d.image);
        img.alt = d.name;
        img.onerror = function () {
          img.replaceWith(createFallback(d.name));
        };
        cellWrap.appendChild(img);
      } else {
        cellWrap.appendChild(createFallback(d.name));
      }

      const nameSpan = document.createElement("span");
      nameSpan.className = "delegate-name";
      nameSpan.textContent = d.name;
      cellWrap.appendChild(nameSpan);
      tdDelegate.appendChild(cellWrap);
      tr.appendChild(tdDelegate);

      // 3. მუნიციპალიტეტი
      const tdMuni = document.createElement("td");
      tdMuni.textContent = d.municipality;
      tr.appendChild(tdMuni);

      // 4. რეგიონი
      const tdReg = document.createElement("td");
      tdReg.textContent = d.region;
      tr.appendChild(tdReg);

      // 5. ნახვები (რიცხვი + პროგრეს ბარი)
      const tdViews = document.createElement("td");
      const viewsWrap = document.createElement("div");
      viewsWrap.className = "views-cell";

      const badge = document.createElement("span");
      badge.className = "views-count-badge";
      badge.textContent = `${d.views} ნახვა`;
      viewsWrap.appendChild(badge);

      const barBg = document.createElement("div");
      barBg.className = "views-bar-bg";
      const barFill = document.createElement("div");
      barFill.className = "views-bar-fill";
      const pct = Math.min(100, Math.round((d.views / maxViews) * 100));
      barFill.style.width = pct + "%";
      barBg.appendChild(barFill);
      viewsWrap.appendChild(barBg);

      tdViews.appendChild(viewsWrap);
      tr.appendChild(tdViews);

      // 6. მოქმედებები
      const tdActions = document.createElement("td");
      const actWrap = document.createElement("div");
      actWrap.className = "row-actions";

      // ბმული საიტზე
      const viewLink = document.createElement("a");
      viewLink.className = "btn btn-ghost btn-icon";
      viewLink.href = "delegate.html?id=" + encodeURIComponent(d.id);
      viewLink.target = "_blank";
      viewLink.title = "პროფილის ნახვა საიტზე";
      viewLink.textContent = "პროფილი ↗";
      actWrap.appendChild(viewLink);

      // რედაქტირების / განულების ღილაკი
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-secondary btn-icon";
      editBtn.title = "ნახვების რედაქტირება / განულება";
      editBtn.textContent = "✏️";
      editBtn.addEventListener("click", () => openEditModal(d));
      actWrap.appendChild(editBtn);

      tdActions.appendChild(actWrap);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    });
  }

  function createFallback(name) {
    const div = document.createElement("div");
    div.className = "delegate-thumb-fallback";
    div.textContent = initials(name);
    return div;
  }

  /* ---------- CSV / Excel ექსპორტი ---------- */

  function exportCSV() {
    const list = getFilteredAndSortedList();
    if (!list.length) return;

    let csvContent = "\uFEFF";
    csvContent += "ID,სახელი და გვარი,მუნიციპალიტეტი,რეგიონი,ნახვების რაოდენობა\n";

    list.forEach((d) => {
      const escape = (str) => `"${String(str).replace(/"/g, '""')}"`;
      csvContent += `${d.id},${escape(d.name)},${escape(d.municipality)},${escape(d.region)},${d.views}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `delegates_views_report_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /* ---------- მოდალი: ნახვების რედაქტირება ---------- */

  function openEditModal(delegate) {
    currentEditingDelegateId = delegate.id;
    const modal = document.getElementById("editCountModal");
    const nameEl = document.getElementById("editDelegateName");
    const countInput = document.getElementById("newCountInput");
    const msgBox = document.getElementById("editCountMsg");

    msgBox.style.display = "none";
    nameEl.textContent = `${delegate.name} (${delegate.municipality}, ${delegate.region})`;
    countInput.value = delegate.views;

    modal.style.display = "flex";
  }

  function closeEditModal() {
    document.getElementById("editCountModal").style.display = "none";
    currentEditingDelegateId = null;
  }

  async function handleEditCountSubmit(e) {
    e.preventDefault();
    if (!currentEditingDelegateId) return;

    const countInput = document.getElementById("newCountInput");
    const newCount = Number(countInput.value) || 0;

    const local = localClicks();
    local[currentEditingDelegateId] = newCount;
    saveLocalClicks(local);
    cachedCounts[currentEditingDelegateId] = newCount;

    try {
      await fetch(getApiBase() + `/api/admin/clicks/${currentEditingDelegateId}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ count: newCount }),
      });
    } catch (err) {}

    buildDelegatesData();
    renderKPIs();
    renderTable();
    closeEditModal();
  }

  /* ---------- მოდალი: პაროლის შეცვლა ---------- */

  function openPassModal() {
    const modal = document.getElementById("passwordModal");
    const msgBox = document.getElementById("passChangeMsg");
    document.getElementById("changePasswordForm").reset();
    msgBox.style.display = "none";
    modal.style.display = "flex";
  }

  function closePassModal() {
    document.getElementById("passwordModal").style.display = "none";
  }

  async function handlePassSubmit(e) {
    e.preventDefault();
    const currPass = document.getElementById("currPassInput").value;
    const newPass = document.getElementById("newPassInput").value;
    const confirmPass = document.getElementById("confirmPassInput").value;
    const msgBox = document.getElementById("passChangeMsg");

    if (newPass !== confirmPass) {
      msgBox.className = "alert alert-error";
      msgBox.textContent = "ახალი პაროლები არ ემთხვევა ერთმანეთს";
      msgBox.style.display = "block";
      return;
    }

    let savedOnServer = false;
    try {
      const res = await fetch(getApiBase() + "/api/admin/change-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ currentPassword: currPass, newPassword: newPass }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        savedOnServer = true;
      }
    } catch (err) {}

    const localOld = localStorage.getItem("admin_password") || "admin123";
    if (savedOnServer || currPass === localOld) {
      localStorage.setItem("admin_password", newPass);
      msgBox.className = "alert alert-success";
      msgBox.textContent = "პაროლი წარმატებით შეიცვალა!";
      msgBox.style.display = "block";
      setTimeout(() => {
        closePassModal();
      }, 1500);
    } else {
      msgBox.className = "alert alert-error";
      msgBox.textContent = "მიმდინარე პაროლი არასწორია";
      msgBox.style.display = "block";
    }
  }

  /* ---------- ინიციალიზაცია ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    initRegionFilter();

    // ლოგინის ფორმა
    const loginForm = document.getElementById("loginForm");
    if (loginForm) loginForm.addEventListener("submit", handleLogin);

    // პაროლის ხილვადობის ტოგლი
    const togglePassBtn = document.getElementById("togglePasswordBtn");
    const passInput = document.getElementById("adminPassword");
    if (togglePassBtn && passInput) {
      togglePassBtn.addEventListener("click", () => {
        const isPass = passInput.type === "password";
        passInput.type = isPass ? "text" : "password";
        togglePassBtn.textContent = isPass ? "🙈" : "👁️";
      });
    }

    // გამოსვლა
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);

    // ძებნა და ფილტრები
    const searchInput = document.getElementById("adminSearch");
    if (searchInput) searchInput.addEventListener("input", renderTable);

    const regionFilter = document.getElementById("adminRegionFilter");
    if (regionFilter) regionFilter.addEventListener("change", renderTable);

    const sortBySelect = document.getElementById("adminSortBy");
    if (sortBySelect) sortBySelect.addEventListener("change", renderTable);

    // განახლების ღილაკი
    const refreshBtn = document.getElementById("refreshStatsBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", loadStats);

    // ექსპორტის ღილაკი
    const exportBtn = document.getElementById("exportCsvBtn");
    if (exportBtn) exportBtn.addEventListener("click", exportCSV);

    // პაროლის შეცვლის მოდალი
    const changePassOpen = document.getElementById("changePassModalOpenBtn");
    if (changePassOpen) changePassOpen.addEventListener("click", openPassModal);

    const closePassBtn = document.getElementById("closePassModalBtn");
    if (closePassBtn) closePassBtn.addEventListener("click", closePassModal);

    const cancelPassBtn = document.getElementById("cancelPassModalBtn");
    if (cancelPassBtn) cancelPassBtn.addEventListener("click", closePassModal);

    const changePassForm = document.getElementById("changePasswordForm");
    if (changePassForm) changePassForm.addEventListener("submit", handlePassSubmit);

    // რედაქტირების მოდალი
    const closeEditBtn = document.getElementById("closeEditModalBtn");
    if (closeEditBtn) closeEditBtn.addEventListener("click", closeEditModal);

    const cancelEditBtn = document.getElementById("cancelEditModalBtn");
    if (cancelEditBtn) cancelEditBtn.addEventListener("click", closeEditModal);

    const editForm = document.getElementById("editCountForm");
    if (editForm) editForm.addEventListener("submit", handleEditCountSubmit);

    const setZeroBtn = document.getElementById("setZeroBtn");
    if (setZeroBtn) {
      setZeroBtn.addEventListener("click", () => {
        document.getElementById("newCountInput").value = "0";
      });
    }

    // მოდალის დახურვა ფონზე დაკლიკებით
    window.addEventListener("click", (e) => {
      const passModal = document.getElementById("passwordModal");
      const editModal = document.getElementById("editCountModal");
      if (e.target === passModal) closePassModal();
      if (e.target === editModal) closeEditModal();
    });

    // ავტორიზაციის შემოწმება
    checkAuth();
  });
})();
