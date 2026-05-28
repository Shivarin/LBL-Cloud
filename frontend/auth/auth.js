(function () {
    "use strict";

    var page = document.body ? document.body.dataset.authPage : "";
    var DEFAULT_RETURN = "/app/";
    var YANDEX_CLIENT_ID = "d936e2d5d0894ea48a49ade772cd1351";

    function $(id) {
        return document.getElementById(id);
    }

    function csrfHeaders(headers) {
        headers = headers || {};
        try {
            var cm = document.cookie.match(/(?:^|; )lbl_csrf=([^;]*)/);
            if (cm) headers["X-CSRF-Token"] = decodeURIComponent(cm[1]);
        } catch (e) { /* noop */ }
        return headers;
    }

    function parseSafeReturnUrl(raw) {
        if (!raw) return null;
        try {
            var u = new URL(raw, window.location.origin);
            var host = u.hostname.toLowerCase();
            var allowed =
                host === window.location.hostname.toLowerCase() ||
                host === "localhost" ||
                host === "127.0.0.1" ||
                host === "lbl3d.info" ||
                host.endsWith(".lbl3d.info") ||
                host === "lblstudio.ru" ||
                host.endsWith(".lblstudio.ru");
            if (!allowed) return null;
            if (u.protocol !== "https:" && u.protocol !== "http:") return null;
            return u.href;
        } catch (e) {
            return null;
        }
    }

    function persistReturnFromQuery() {
        try {
            var params = new URLSearchParams(window.location.search);
            var safe = parseSafeReturnUrl(params.get("return") || params.get("return_to"));
            if (safe) sessionStorage.setItem("lbl_cloud_auth_return", safe);
        } catch (e) { /* noop */ }
    }

    function consumeReturnUrl() {
        try {
            var params = new URLSearchParams(window.location.search);
            var fromQuery = parseSafeReturnUrl(params.get("return") || params.get("return_to"));
            if (fromQuery) return fromQuery;
            return parseSafeReturnUrl(sessionStorage.getItem("lbl_cloud_auth_return")) ||
                new URL(DEFAULT_RETURN, window.location.origin).href;
        } catch (e) {
            return new URL(DEFAULT_RETURN, window.location.origin).href;
        }
    }

    function clearReturnUrl() {
        try { sessionStorage.removeItem("lbl_cloud_auth_return"); } catch (e) { /* noop */ }
    }

    function redirectAfterAuth(response) {
        var token = response && (response.access_token || response.token);
        var back = new URL(consumeReturnUrl(), window.location.origin);
        if (token && back.origin !== window.location.origin) {
            back.hash = "lbl_token=" + encodeURIComponent(token);
        }
        clearReturnUrl();
        window.location.replace(back.href);
    }

    function deviceInfo() {
        var ua = navigator.userAgent || "";
        var browser = ua.indexOf("Firefox") >= 0 ? "Firefox" :
            ua.indexOf("Edg") >= 0 ? "Edge" :
            ua.indexOf("Safari") >= 0 && ua.indexOf("Chrome") < 0 ? "Safari" :
            ua.indexOf("Chrome") >= 0 ? "Chrome" : "Browser";
        var os = ua.indexOf("Windows") >= 0 ? "Windows" :
            ua.indexOf("Mac") >= 0 ? "macOS" :
            ua.indexOf("Android") >= 0 ? "Android" :
            ua.indexOf("iPhone") >= 0 || ua.indexOf("iPad") >= 0 ? "iOS" :
            ua.indexOf("Linux") >= 0 ? "Linux" : "Unknown";
        return browser + " на " + os;
    }

    function rawPost(path, payload) {
        return fetch("/api" + path, {
            method: "POST",
            credentials: "include",
            headers: csrfHeaders({
                Accept: "application/json",
                "Content-Type": "application/json",
            }),
            body: JSON.stringify(payload || {}),
        }).then(function (r) {
            return r.text().then(function (text) {
                var data = {};
                if (text) {
                    try { data = JSON.parse(text); } catch (e) { data = { message: text }; }
                }
                if (!r.ok) {
                    var msg = data.detail || data.message || "Ошибка запроса";
                    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
                }
                return data;
            });
        });
    }

    function rawGet(path) {
        return fetch("/api" + path, {
            credentials: "include",
            headers: csrfHeaders({ Accept: "application/json" }),
        }).then(function (r) {
            if (!r.ok) throw new Error("Ошибка запроса");
            return r.json();
        });
    }

    function apiLogin(email, password, code) {
        if (window.api && typeof window.api.login === "function") {
            return window.api.login(email, password, code || null);
        }
        return rawPost("/login", {
            email: email,
            password: password,
            two_factor_code: code || null,
            user_agent: navigator.userAgent || "",
            device_info: deviceInfo(),
            location: "Неизвестно",
            app_context: "cloud",
        });
    }

    function apiRegister(payload) {
        if (window.api && typeof window.api.register === "function") {
            return window.api.register(payload);
        }
        return rawPost("/register", payload);
    }

    function apiForgot(email) {
        if (window.api && typeof window.api.forgotPassword === "function") {
            return window.api.forgotPassword(email);
        }
        return rawPost("/forgot-password", { email: email, app_context: "cloud" });
    }

    function apiRegistrationStatus() {
        if (window.api && typeof window.api.getPublicRegistrationStatus === "function") {
            return window.api.getPublicRegistrationStatus();
        }
        return rawGet("/public/registration-status");
    }

    function storeAuth(email, response) {
        var token = response && (response.access_token || response.token);
        if (token) {
            localStorage.setItem("authToken", token);
            if (window.api && typeof window.api.setToken === "function") window.api.setToken(token);
        }
        var user = response && response.user;
        localStorage.setItem("userEmail", user && user.email ? user.email : email);
        localStorage.setItem("userName", user ? [user.first_name, user.last_name].filter(Boolean).join(" ") : "");
        if (user && user.id) localStorage.setItem("userId", user.id);
        localStorage.setItem("isLoggedIn", "true");
    }

    function setStatus(type, message) {
        var el = $("authStatus");
        if (!el) return;
        el.className = "lc-auth-status";
        if (!message) {
            el.textContent = "";
            return;
        }
        el.classList.add("is-visible", "is-" + (type || "info"));
        el.textContent = message;
    }

    function setBusy(form, busy, text) {
        var btn = form ? form.querySelector(".lc-auth-submit") : null;
        if (!btn) return;
        if (!btn.dataset.originalText) btn.dataset.originalText = btn.innerHTML;
        btn.disabled = !!busy;
        btn.innerHTML = busy
            ? '<i class="fas fa-spinner fa-spin"></i><span>' + (text || "Подождите...") + "</span>"
            : btn.dataset.originalText;
    }

    function closeModal() {
        var modal = $("authModal");
        if (!modal) return;
        modal.classList.remove("is-open", "lc-modal--2fa", "lc-modal--form");
        modal.setAttribute("aria-hidden", "true");
        var card = modal.querySelector(".lc-modal__card");
        if (card) card.className = "lc-modal__card";
        var body = $("authModalBody");
        var actions = $("authModalActions");
        if (body) body.innerHTML = "";
        if (actions) actions.innerHTML = '<button type="button" class="lc-auth-submit lc-auth-submit--modal" id="authModalOk">Понятно</button>';
        var ok = $("authModalOk");
        if (ok) ok.addEventListener("click", closeModal);
    }

    function openModal(type, title, message, bodyHtml, actionsHtml, variant) {
        var modal = $("authModal");
        if (!modal) return;
        var card = modal.querySelector(".lc-modal__card");
        modal.classList.remove("lc-modal--2fa", "lc-modal--form");
        if (card) card.className = "lc-modal__card";
        if (variant) {
            modal.classList.add("lc-modal--" + variant);
            if (card) card.classList.add("lc-modal__card--" + variant);
        }
        var icon = $("authModalIcon");
        var iconNode = icon ? icon.querySelector("i") : null;
        if (icon) {
            icon.className = "lc-modal__icon" + (type ? " is-" + type : "");
        }
        if (iconNode) {
            iconNode.className = type === "success" ? "fas fa-check" :
                type === "error" ? "fas fa-xmark" : "fas fa-info";
        }
        $("authModalTitle").textContent = title || "LBL Cloud";
        $("authModalMessage").textContent = message || "";
        $("authModalBody").innerHTML = bodyHtml || "";
        $("authModalActions").innerHTML = actionsHtml ||
            '<button type="button" class="lc-auth-submit lc-auth-submit--modal" id="authModalOk">Понятно</button>';
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        var close = $("authModalClose");
        var ok = $("authModalOk");
        if (close) close.onclick = closeModal;
        if (ok) ok.onclick = closeModal;
    }

    var twoFactorState = { email: "", password: "", form: null };

    function closeTwoFactorModal() {
        var modal = $("twoFactorModal");
        if (!modal) return;
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        var input = $("twoFactorCode");
        var submit = $("twoFactorSubmit");
        if (input) input.value = "";
        if (submit) {
            submit.disabled = false;
            submit.innerHTML = '<i class="fas fa-check"></i><span>Подтвердить вход</span>';
        }
        twoFactorState = { email: "", password: "", form: null };
    }

    function initTwoFactorModal() {
        var modal = $("twoFactorModal");
        if (!modal) return;
        var input = $("twoFactorCode");
        var submit = $("twoFactorSubmit");
        var close = $("twoFactorClose");
        if (close) close.addEventListener("click", closeTwoFactorModal);
        modal.addEventListener("click", function (event) {
            if (event.target === modal) closeTwoFactorModal();
        });
        if (input) {
            input.addEventListener("input", function () {
                input.value = input.value.replace(/\D/g, "").slice(0, 6);
            });
            input.addEventListener("keydown", function (event) {
                if (event.key === "Enter" && submit) submit.click();
            });
        }
        if (submit) {
            submit.addEventListener("click", function () {
                var code = input ? input.value.trim() : "";
                if (code.length !== 6) {
                    setStatus("error", "Введите 6-значный код подтверждения.");
                    if (input) input.focus();
                    return;
                }
                var email = twoFactorState.email;
                var password = twoFactorState.password;
                submit.disabled = true;
                submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Проверяем</span>';
                apiLogin(email, password, code)
                    .then(function (response) {
                        closeTwoFactorModal();
                        storeAuth(email, response);
                        redirectAfterAuth(response);
                    })
                    .catch(function (error) {
                        submit.disabled = false;
                        submit.innerHTML = '<i class="fas fa-check"></i><span>Подтвердить вход</span>';
                        setStatus("error", error.message || "Код не подошел.");
                        if (input) {
                            input.select();
                            input.focus();
                        }
                    });
            });
        }
    }

    function is2FA(response) {
        return !!(response && (
            response.requires_2fa === true ||
            response.requires_2fa === "true" ||
            response.requires_2fa === 1
        ));
    }

    function askTwoFactor(email, password, form) {
        twoFactorState = { email: email, password: password, form: form };
        closeModal();
        var modal = $("twoFactorModal");
        var input = $("twoFactorCode");
        var submit = $("twoFactorSubmit");
        if (!modal) {
            openModal(
                "info",
                "Двухфакторная проверка",
                "Введите 6-значный код из письма, чтобы завершить вход в LBL Cloud.",
                '<div class="lc-modal__2fa">' +
                '<label class="lc-otp" for="twoFactorCode">' +
                '<span class="lc-otp__label">Код из email</span>' +
                '<input type="text" class="lc-otp__input" id="twoFactorCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="Код подтверждения из письма">' +
                "</label>" +
                '<p class="lc-modal__hint"><i class="fas fa-envelope"></i> Проверьте «Входящие» и папку «Спам»</p>' +
                "</div>",
                '<button type="button" class="lc-auth-submit lc-auth-submit--modal" id="twoFactorSubmit"><i class="fas fa-check"></i><span>Подтвердить вход</span></button>',
                "2fa"
            );
            input = $("twoFactorCode");
            submit = $("twoFactorSubmit");
            if (input) {
                input.addEventListener("input", function () {
                    input.value = input.value.replace(/\D/g, "").slice(0, 6);
                });
                input.addEventListener("keydown", function (event) {
                    if (event.key === "Enter" && submit) submit.click();
                });
            }
            if (submit) {
                submit.addEventListener("click", function () {
                    var code = input ? input.value.trim() : "";
                    if (code.length !== 6) {
                        setStatus("error", "Введите 6-значный код подтверждения.");
                        return;
                    }
                    submit.disabled = true;
                    submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Проверяем</span>';
                    apiLogin(email, password, code)
                        .then(function (response) {
                            storeAuth(email, response);
                            redirectAfterAuth(response);
                        })
                        .catch(function (error) {
                            submit.disabled = false;
                            submit.innerHTML = '<i class="fas fa-check"></i><span>Подтвердить вход</span>';
                            setStatus("error", error.message || "Код не подошел.");
                        });
                });
            }
            if (input) setTimeout(function () { input.focus(); }, 60);
            setBusy(form, false);
            return;
        }
        if (input) input.value = "";
        if (submit) {
            submit.disabled = false;
            submit.innerHTML = '<i class="fas fa-check"></i><span>Подтвердить вход</span>';
        }
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        setTimeout(function () { if (input) input.focus(); }, 60);
        setBusy(form, false);
    }

    function initPasswordToggles() {
        document.querySelectorAll("[data-toggle-password]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var field = btn.closest(".lc-field");
                var input = field ? field.querySelector("input") : null;
                var icon = btn.querySelector("i");
                if (!input) return;
                var show = input.type === "password";
                input.type = show ? "text" : "password";
                btn.setAttribute("aria-label", show ? "Скрыть пароль" : "Показать пароль");
                if (icon) icon.className = show ? "fas fa-eye-slash" : "fas fa-eye";
            });
        });
    }

    function initForgot() {
        var btn = $("forgotPasswordBtn");
        if (!btn) return;
        btn.addEventListener("click", function () {
            var emailInput = document.querySelector('input[name="email"]');
            var email = emailInput ? emailInput.value.trim() : "";
            openModal(
                "info",
                "Восстановление пароля",
                "Укажите email аккаунта LBL Cloud — отправим ссылку для сброса пароля.",
                '<label class="lc-modal-field" for="forgotEmail">' +
                '<span>Email</span>' +
                '<input type="email" id="forgotEmail" autocomplete="email" placeholder="name@example.com" value="' + email.replace(/"/g, "&quot;") + '">' +
                "</label>",
                '<button type="button" class="lc-auth-submit lc-auth-submit--modal" id="forgotSubmit"><i class="fas fa-paper-plane"></i><span>Отправить</span></button>',
                "form"
            );
            var submit = $("forgotSubmit");
            if (submit) {
                submit.addEventListener("click", function () {
                    var input = $("forgotEmail");
                    var value = input ? input.value.trim() : "";
                    if (!value) {
                        setStatus("error", "Введите email для восстановления.");
                        return;
                    }
                    submit.disabled = true;
                    submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Отправляем</span>';
                    apiForgot(value)
                        .then(function () {
                            closeModal();
                            setStatus("success", "Если email есть в системе, письмо уже отправлено.");
                        })
                        .catch(function (error) {
                            submit.disabled = false;
                            submit.innerHTML = '<i class="fas fa-paper-plane"></i><span>Отправить</span>';
                            setStatus("error", error.message || "Не удалось отправить письмо.");
                        });
                });
            }
        });
    }

    function initLogin() {
        var form = $("cloudLoginForm");
        if (!form) return;
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            var email = (form.elements.email.value || "").trim();
            var password = form.elements.password.value || "";
            if (!email || !password) {
                setStatus("error", "Заполните email и пароль.");
                return;
            }
            setStatus("info", "Проверяем данные входа...");
            setBusy(form, true, "Входим...");
            apiLogin(email, password)
                .then(function (response) {
                    if (is2FA(response)) {
                        askTwoFactor(email, password, form);
                        return;
                    }
                    storeAuth(email, response);
                    setStatus("success", "Готово. Открываем облако...");
                    redirectAfterAuth(response);
                })
                .catch(function (error) {
                    setStatus("error", error.message || "Не удалось войти. Проверьте email и пароль.");
                    setBusy(form, false);
                });
        });
    }

    function passwordScore(value) {
        var score = 0;
        if (value.length >= 8) score += 1;
        if (/[A-ZА-Я]/.test(value) && /[a-zа-я]/.test(value)) score += 1;
        if (/\d/.test(value)) score += 1;
        if (/[^A-Za-zА-Яа-я0-9]/.test(value)) score += 1;
        return score;
    }

    function initRegister() {
        var form = $("cloudRegisterForm");
        if (!form) return;
        var password = form.elements.password;
        var meter = $("passwordMeter");
        if (password && meter) {
            password.addEventListener("input", function () {
                meter.style.width = Math.max(8, passwordScore(password.value) * 25) + "%";
            });
        }

        apiRegistrationStatus()
            .then(function (status) {
                var closed = status && (status.registration_closed || status.closed || status.public_registration_closed);
                if (closed) {
                    setStatus("info", "Регистрация временно закрыта. Вход для существующих аккаунтов работает.");
                    form.querySelectorAll("input, button").forEach(function (el) { el.disabled = true; });
                }
            })
            .catch(function () { /* статус необязателен для формы */ });

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            var firstName = (form.elements.first_name.value || "").trim();
            var lastName = (form.elements.last_name.value || "").trim();
            var email = (form.elements.email.value || "").trim();
            var pass = form.elements.password.value || "";
            var confirm = form.elements.password_confirm.value || "";
            if (!firstName || !lastName || !email || !pass) {
                setStatus("error", "Заполните все поля регистрации.");
                return;
            }
            if (pass.length < 8) {
                setStatus("error", "Пароль должен быть не короче 8 символов.");
                return;
            }
            if (pass !== confirm) {
                setStatus("error", "Пароли не совпадают.");
                return;
            }
            if (!form.elements.terms.checked) {
                setStatus("error", "Необходимо согласие на обработку персональных данных (152-ФЗ) и с условиями использования.");
                return;
            }
            var params = new URLSearchParams(window.location.search);
            var payload = {
                first_name: firstName,
                last_name: lastName,
                email: email,
                password: pass,
                consent_personal_data: true,
                app_context: "cloud",
            };
            if (params.get("ref")) payload.referral_code = params.get("ref");
            setStatus("info", "Создаем Cloud ID...");
            setBusy(form, true, "Создаем...");
            apiRegister(payload)
                .then(function (response) {
                    storeAuth(email, response);
                    setStatus("success", "Аккаунт создан. Открываем облако...");
                    redirectAfterAuth(response);
                })
                .catch(function (error) {
                    setStatus("error", error.message || "Не удалось создать аккаунт.");
                    setBusy(form, false);
                });
        });
    }

    function initOauthCode() {
        var params = new URLSearchParams(window.location.search);
        var code = params.get("code");
        if (!code || !window.api || typeof window.api.yandexAuth !== "function") return;
        setStatus("info", "Завершаем вход через Яндекс...");
        window.api.yandexAuth(code)
            .then(function (response) {
                storeAuth(response && response.user ? response.user.email : "", response);
                redirectAfterAuth(response);
            })
            .catch(function (error) {
                setStatus("error", error.message || "Не удалось завершить вход через Яндекс.");
            });
    }

    function initYandexButtons() {
        document.querySelectorAll("[data-yandex-auth]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                persistReturnFromQuery();
                var redirect = window.location.origin + window.location.pathname;
                window.location.href =
                    "https://oauth.yandex.ru/authorize?response_type=code&client_id=" +
                    encodeURIComponent(YANDEX_CLIENT_ID) +
                    "&redirect_uri=" +
                    encodeURIComponent(redirect);
            });
        });
    }

    persistReturnFromQuery();
    initPasswordToggles();
    initForgot();
    initTwoFactorModal();
    initLogin();
    initRegister();
    initOauthCode();
    initYandexButtons();
})();
