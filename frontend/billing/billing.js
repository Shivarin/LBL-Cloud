(function () {
    "use strict";

    var LOGIN =
        "/pages/auth/login.html?return=" +
        encodeURIComponent(location.pathname + location.search);
    var currentStatus = null;

    // Тот же uvicorn, что и lbl3d.info: cloud проксирует /api → :5000
    var API_PREFIX = "/api";

    function hasToken() {
        return !!(localStorage.getItem("authToken") || localStorage.getItem("token"));
    }

    function csrfHeaders(headers) {
        headers = headers || {};
        try {
            var cm = document.cookie.match(/(?:^|; )lbl_csrf=([^;]*)/);
            if (cm) headers["X-CSRF-Token"] = decodeURIComponent(cm[1]);
        } catch (e) { /* noop */ }
        return headers;
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function apiGet(path) {
        if (typeof api !== "undefined" && api.get) {
            return api.get(path);
        }
        var headers = csrfHeaders({ Accept: "application/json" });
        var t = localStorage.getItem("authToken") || localStorage.getItem("token");
        if (t) headers.Authorization = "Bearer " + t;
        return fetch(API_PREFIX + path, { credentials: "include", headers: headers }).then(function (r) {
            if (!r.ok) throw new Error(r.status === 401 ? "auth" : "error");
            return r.json();
        });
    }

    function apiPost(path, body) {
        if (typeof api !== "undefined" && api.post) {
            return api.post(path, body || {});
        }
        var headers = csrfHeaders({
            Accept: "application/json",
            "Content-Type": "application/json",
        });
        var t = localStorage.getItem("authToken") || localStorage.getItem("token");
        if (t) headers.Authorization = "Bearer " + t;
        return fetch(API_PREFIX + path, {
            method: "POST",
            credentials: "include",
            headers: headers,
            body: JSON.stringify(body || {}),
        }).then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok) {
                    var msg = data.detail || "Ошибка оплаты";
                    if (r.status === 403) {
                        msg =
                            typeof data.detail === "string"
                                ? data.detail
                                : "Сессия устарела — войдите снова через «Войти»";
                    }
                    throw new Error(msg);
                }
                return data;
            });
        });
    }

    function periodLabel(days) {
        var n = Number(days || 30);
        if (n >= 360) return "год";
        if (n >= 28 && n <= 31) return "месяц";
        return n + " дн.";
    }

    function rub(value) {
        var n = Number(value || 0);
        return n.toLocaleString("ru-RU") + " ₽";
    }

    function planFeatures(plan) {
        var gb = Number(plan.storage_gb || 0);
        var storage = gb >= 1024 ? (gb / 1024).toLocaleString("ru-RU") + " ТБ" : gb.toLocaleString("ru-RU") + " ГБ";
        var list = [
            storage + " защищенного хранилища",
            "Папки, избранное, корзина и быстрый поиск",
            "Автоматическое обновление лимита после оплаты",
        ];
        if (plan.id === "cloud_pro") list.push("Оптимально для личного и рабочего архива");
        else if (gb >= 1000) list.push("Подходит для больших библиотек и команды");
        else list.push("Можно сменить тариф в любой момент");
        return list;
    }

    function renderPlanCard(plan) {
        var popular = plan.id === "cloud_pro" || plan.badge ? " is-popular" : "";
        var badge = plan.badge || (plan.id === "cloud_pro" ? "Популярный" : "");
        var price = Number(plan.price_rub || 0);
        var features = planFeatures(plan)
            .map(function (item) {
                return "<li>" + escapeHtml(item) + "</li>";
            })
            .join("");
        return (
            '<article class="lc-plan' + popular + '" data-plan="' + escapeHtml(plan.id) + '">' +
            (badge ? '<span class="lc-plan__badge">' + escapeHtml(badge) + "</span>" : "") +
            '<div class="lc-plan__top">' +
            '<span class="lc-plan__label">Тариф</span>' +
            "<h2>" + escapeHtml(plan.name || "Cloud") + "</h2>" +
            '<p class="lc-plan__storage">' + escapeHtml(plan.storage_gb || "0") + ' <span>ГБ</span></p>' +
            '<p class="lc-plan__price">' + rub(price) + ' <span>/ ' + periodLabel(plan.period_days) + "</span></p>" +
            "</div>" +
            '<ul class="lc-plan__features">' + features + "</ul>" +
            '<div class="lc-plan__foot">' +
            '<button type="button" class="lc-plan__btn" data-default-text="Оформить" data-checkout="' +
            escapeHtml(plan.id) +
            '">Оформить</button>' +
            "</div>" +
            "</article>"
        );
    }

    function renderPlans(plans) {
        var grid = document.getElementById("plansGrid");
        if (!grid) return;
        grid.innerHTML = (plans || []).map(renderPlanCard).join("");
        bindCheckoutButtons(grid);
        syncCurrentPlan();
    }

    function renderFreeCard(freeGb) {
        var grid = document.getElementById("plansGrid");
        if (!grid) return;
        var free = document.createElement("article");
        free.className = "lc-plan";
        free.dataset.plan = "free";
        free.innerHTML =
            '<div class="lc-plan__top">' +
            '<span class="lc-plan__label">Старт</span>' +
            "<h2>Бесплатный</h2>" +
            '<p class="lc-plan__storage">' + escapeHtml(freeGb) + ' <span>ГБ</span></p>' +
            '<p class="lc-plan__price">0 ₽ <span>/ всегда</span></p>' +
            "</div>" +
            '<ul class="lc-plan__features">' +
            "<li>Базовое место для личных файлов</li>" +
            "<li>Папки, загрузки и просмотр из облака</li>" +
            "<li>Можно перейти на платный тариф без переноса</li>" +
            "</ul>" +
            '<div class="lc-plan__foot">' +
            '<a class="lc-plan__btn lc-plan__btn--outline" href="/app/">Открыть диск</a>' +
            "</div>";
        grid.insertBefore(free, grid.firstChild);
        syncCurrentPlan();
    }

    function renderErrorState() {
        var grid = document.getElementById("plansGrid");
        if (!grid) return;
        grid.innerHTML =
            '<article class="lc-plan">' +
            '<div class="lc-plan__top">' +
            '<span class="lc-plan__label">Тарифы</span>' +
            "<h2>Не удалось загрузить планы</h2>" +
            '<p class="lc-plan__price">Попробуйте обновить страницу</p>' +
            "</div>" +
            '<ul class="lc-plan__features"><li>Проверьте подключение</li><li>Диск продолжает работать на текущем тарифе</li></ul>' +
            '<div class="lc-plan__foot"><a class="lc-plan__btn" href="/app/">Вернуться в диск</a></div>' +
            "</article>";
    }

    function bindCheckoutButtons(root) {
        root.querySelectorAll("[data-checkout]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                if (!hasToken()) {
                    location.href = LOGIN;
                    return;
                }
                var planId = btn.getAttribute("data-checkout");
                var text = btn.getAttribute("data-default-text") || "Оформить";
                btn.disabled = true;
                btn.textContent = "Открываем оплату…";
                apiPost("/cloud/billing/checkout", { plan_id: planId })
                    .then(function (res) {
                        if (res.confirmation_url) {
                            location.href = res.confirmation_url;
                            return;
                        }
                        throw new Error("Нет ссылки на оплату");
                    })
                    .catch(function (err) {
                        btn.disabled = false;
                        btn.textContent = text;
                        alert(err.message || "Не удалось начать оплату");
                    });
            });
        });
    }

    function syncCurrentPlan() {
        var activePlan = currentStatus && currentStatus.active ? currentStatus.plan_id || "free" : "free";
        document.querySelectorAll(".lc-plan").forEach(function (card) {
            var isCurrent = card.dataset.plan === activePlan;
            card.classList.toggle("is-current", isCurrent);
            var btn = card.querySelector("[data-checkout]");
            if (btn && isCurrent) {
                btn.textContent = "Текущий тариф";
                btn.disabled = true;
            } else if (btn && btn.disabled && btn.textContent === "Текущий тариф") {
                btn.disabled = false;
                btn.textContent = btn.getAttribute("data-default-text") || "Оформить";
            }
        });
    }

    function updateStatus(el, data) {
        currentStatus = data || null;
        var title = document.getElementById("billingStatusTitle");
        var meter = document.getElementById("billingStatusMeter");
        if (!el) return;
        if (!data || !data.active) {
            if (title) title.textContent = "Бесплатный тариф";
            el.textContent = "Сейчас доступен бесплатный объем. Выберите план ниже, чтобы расширить хранилище.";
            if (meter) meter.style.width = "34%";
            syncCurrentPlan();
            return;
        }
        var until = data.paid_until ? new Date(data.paid_until).toLocaleDateString("ru") : "";
        if (title) title.textContent = data.plan_name || "Активный тариф";
        el.textContent =
            (until ? "Оплачен до " + until + ". " : "") +
            "Доступно " +
            data.storage_gb +
            " ГБ хранилища.";
        if (meter) meter.style.width = data.storage_gb >= 1000 ? "92%" : "68%";
        syncCurrentPlan();
    }

    function syncAfterPayment() {
        var params = new URLSearchParams(location.search);
        if (params.get("billing") !== "success" || !hasToken()) return Promise.resolve();
        params.delete("billing");
        var qs = params.toString();
        history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
        return apiPost("/cloud/billing/sync-pending", {}).then(function (st) {
            updateStatus(document.getElementById("billingStatus"), st);
            if (st.activated || st.active) {
                alert("Подписка активирована. Лимит в диске обновлён.");
            }
        });
    }

    function init() {
        var navLogin = document.getElementById("navLogin");
        if (navLogin && hasToken()) navLogin.classList.add("is-hidden");

        syncAfterPayment().finally(function () {
        apiGet("/cloud/billing/plans")
            .then(function (data) {
                renderPlans(data.plans || []);
                renderFreeCard(data.free_storage_gb || 5);
                if (hasToken()) {
                    return apiGet("/cloud/billing/status").then(function (st) {
                        updateStatus(document.getElementById("billingStatus"), st);
                    });
                }
                updateStatus(document.getElementById("billingStatus"), null);
            })
            .catch(function () {
                updateStatus(document.getElementById("billingStatus"), null);
                document.getElementById("billingStatus").textContent =
                    "Не удалось загрузить тарифы. Попробуйте позже или вернитесь в диск.";
                renderErrorState();
            });
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
