/**
 * LBL Cloud — cloud.lbl3d.info/app
 */
(function () {
    "use strict";

    const VIEW_STORAGE_KEY = "lbl_cloud_view";

    const state = {
        folderId: null,
        view: (function () {
            var saved = localStorage.getItem(VIEW_STORAGE_KEY);
            return saved === "list" || saved === "grid" ? saved : "grid";
        })(),
        config: null,
        searchTimer: null,
        ctxTarget: null,
        section: "drive",
        kind: "all",
        sort: "date-desc",
        selected: null,
        currentItems: [],
        page: 1,
        lastBrowseData: null,
        demoStore: null,
        nameModalApply: null,
        user: null,
    };

    const STORAGE_CIRC = 106.8;
    const ROOT_CARD_MIN_WIDTH = 176;
    const ROOT_CARD_HEIGHT = 146;
    const ROOT_GRID_GAP = 18;
    const ROOT_PAGER_HEIGHT = 58;
    const SECTION_LABELS = {
        drive: "Мой диск",
        recent: "Недавние",
        favorites: "Избранное",
        shared: "Поделились",
        trash: "Корзина",
        settings: "Аккаунт",
    };
    const SVG_ICONS = {
        cloud: '<path d="M7.5 18.5h9a4.5 4.5 0 0 0 .5-8.97 6 6 0 0 0-11.25 1.9A3.6 3.6 0 0 0 7.5 18.5Z"/>',
        folder: '<path d="M3.5 7.5h6l2 2h9v8.8a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2Z"/>',
        "folder-open": '<path d="M3.5 9V7.5h6l2 2h7a2 2 0 0 1 2 2v1"/><path d="m4.5 12.5 1.2 6.2a2.2 2.2 0 0 0 2.2 1.8h9.5a2.2 2.2 0 0 0 2.1-1.6l1.7-6.4Z"/>',
        "folder-plus": '<path d="M3.5 7.5h6l2 2h9v8.8a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2Z"/><path d="M12 13.5v4M10 15.5h4"/>',
        file: '<path d="M7 3.5h6.5L18 8v12.5H7Z"/><path d="M13.5 3.5V8H18"/>',
        "file-lines": '<path d="M7 3.5h6.5L18 8v12.5H7Z"/><path d="M13.5 3.5V8H18M9.5 12h5M9.5 15h5M9.5 18h3"/>',
        "file-pdf": '<path d="M7 3.5h6.5L18 8v12.5H7Z"/><path d="M13.5 3.5V8H18M9 16h6M9 13h6"/>',
        "file-image": '<path d="M7 3.5h6.5L18 8v12.5H7Z"/><path d="M13.5 3.5V8H18M9 17l2.2-2.2 1.6 1.6 1-1 1.7 1.6M10 11h.1"/>',
        "file-video": '<path d="M7 3.5h6.5L18 8v12.5H7Z"/><path d="M13.5 3.5V8H18M10 13l5 3-5 3Z"/>',
        "file-audio": '<path d="M7 3.5h6.5L18 8v12.5H7Z"/><path d="M13.5 3.5V8H18M11 17.5V11l5-1v6.5M11 17.5a1.8 1.8 0 1 1-1.8-1.8 1.8 1.8 0 0 1 1.8 1.8ZM16 16.5a1.8 1.8 0 1 1-1.8-1.8 1.8 1.8 0 0 1 1.8 1.8Z"/>',
        image: '<path d="M4.5 6.5h15v11h-15Z"/><path d="m6.5 16 4.2-4.2 3.1 3.1 1.7-1.7 2.7 2.8"/><path d="M15.8 9.4h.1"/>',
        video: '<path d="M4.5 7.5h10v9h-10Z"/><path d="m14.5 11 5-3v8l-5-3Z"/>',
        "file-zipper": '<path d="M7 3.5h6.5L18 8v12.5H7Z"/><path d="M13.5 3.5V8H18M10.4 4h2M10.4 6h2M10.4 8h2M10.4 10h2M11.4 13v3"/>',
        cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="M12 12 4 7.5M12 12l8-4.5M12 12v9"/>',
        sliders: '<path d="M4 7h6M14 7h6M12 5v4M4 17h6M14 17h6M12 15v4M4 12h2M10 12h10M8 10v4"/>',
        grip: '<path d="M8 5.5h.1M12 5.5h.1M16 5.5h.1M8 12h.1M12 12h.1M16 12h.1M8 18.5h.1M12 18.5h.1M16 18.5h.1"/>',
        list: '<path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.1M4 12h.1M4 17.5h.1"/>',
        "hard-drive": '<path d="M5 5h14l2 8v5.5H3V13Z"/><path d="M3 13h18M7 17h.1M10 17h.1"/>',
        clock: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"/><path d="M12 7.5v5l3.3 2"/>',
        star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 4 1 5.6-5-2.7-5 2.7 1-5.6-4-4 5.6-.8Z"/>',
        users: '<path d="M16 18.5c0-2.2-1.8-4-4-4s-4 1.8-4 4"/><path d="M12 11.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 18.5c0-1.7-1-3.1-2.5-3.7M16.8 6.2a2.6 2.6 0 0 1 0 4.6"/>',
        trash: '<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13M10.5 10.5v6M13.5 10.5v6"/>',
        search: '<path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z"/><path d="m16 16 4 4"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        bell: '<path d="M18 9.5a6 6 0 0 0-12 0c0 7-2 7-2 8h16c0-1-2-1-2-8Z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
        moon: '<path d="M20 14.7A8.4 8.4 0 0 1 9.3 4 8.7 8.7 0 1 0 20 14.7Z"/>',
        sun: '<path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
        user: '<path d="M12 12.5a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Z"/><path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/>',
        gift: '<path d="M4 10h16v10H4Z"/><path d="M3 7h18v3H3ZM12 7v13M12 7H8.8a2 2 0 1 1 1.5-3.3L12 7Zm0 0h3.2a2 2 0 1 0-1.5-3.3L12 7Z"/>',
        "cloud-arrow-up": '<path d="M7.5 18.5h9a4.5 4.5 0 0 0 .5-8.97 6 6 0 0 0-11.25 1.9A3.6 3.6 0 0 0 7.5 18.5Z"/><path d="M12 17V9.5M9 12.5l3-3 3 3"/>',
        "layer-group": '<path d="m12 3 8 4-8 4-8-4Z"/><path d="m4 12 8 4 8-4"/><path d="m4 17 8 4 8-4"/>',
        "paper-plane": '<path d="m21 4-8 17-3-7-7-3Z"/><path d="m21 4-11 10"/>',
        "shield-halved": '<path d="M12 3.5 19 6v5.4c0 4.2-2.8 7.3-7 9.1-4.2-1.8-7-4.9-7-9.1V6Z"/><path d="M12 3.5v17"/>',
        database: '<path d="M5 6.5c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3Z"/><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
        bolt: '<path d="M13 2.8 5.8 13h5.3L10 21.2 18.2 10h-5.4Z"/>',
        lock: '<path d="M7 10h10v10H7Z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
        rocket: '<path d="M13.5 4.2c2.4-.8 4.5-.4 6.3.9.7 2 .4 4.1-.8 6.3l-5.6 5.6-5.4-5.4Z"/><path d="m7 14-2.5 5.5L10 17M10 7 4.5 9.5 8 13M15 8.5h.1"/>',
        "ellipsis-vertical": '<path d="M12 5.5h.1M12 12h.1M12 18.5h.1"/>',
        pen: '<path d="m4 20 4.6-1 10-10a2.1 2.1 0 0 0-3-3l-10 10Z"/><path d="m14.5 6.5 3 3"/>',
        download: '<path d="M12 4v10M8 10l4 4 4-4"/><path d="M5 20h14"/>',
        "chevron-right": '<path d="m9 5 7 7-7 7"/>',
        "chevron-down": '<path d="m6 9 6 6 6-6"/>',
        "arrow-down-wide-short": '<path d="M4 6h16M7 12h10M10 18h4"/><path d="M18 14v7M15 18l3 3 3-3"/>',
        check: '<path d="m5 12 4 4 10-10"/>',
        link: '<path d="M9.5 14.5 14.5 9.5"/><path d="M8 10.5 6.7 11.8a4 4 0 1 0 5.6 5.6l1.2-1.2"/><path d="m10.5 8 1.2-1.2a4 4 0 1 1 5.6 5.6L16 13.5"/>',
        xmark: '<path d="M6 6l12 12M18 6 6 18"/>',
    };

    const SORT_LABELS = {
        "date-desc": "По дате изменения",
        "name-asc": "По имени",
        "size-desc": "По размеру",
        "type-asc": "По типу",
    };

    const DEMO_FOLDERS = [
        { id: 1, parent_id: null, name: "Проекты", updated_at: "2026-05-21T12:30:00", favorite: true, shared: true, owner: "Алексей П.", activity: "12 файлов обновлены сегодня" },
        { id: 2, parent_id: null, name: "Дизайн", updated_at: "2026-05-20T16:10:00", favorite: false, shared: true, owner: "Мария И.", activity: "Мария добавила макеты" },
        { id: 3, parent_id: null, name: "Документы", updated_at: "2026-05-19T09:45:00", favorite: false, shared: false, owner: "Алексей П.", activity: "Открыт вчера" },
        { id: 21, parent_id: 1, name: "Клиент A", updated_at: "2026-05-21T09:00:00", favorite: false, shared: true, owner: "Алексей П.", activity: "Готовится презентация" },
        { id: 22, parent_id: 1, name: "Рендеры", updated_at: "2026-05-20T18:20:00", favorite: true, shared: false, owner: "Алексей П.", activity: "3 файла синхронизированы" },
        { id: 31, parent_id: 2, name: "UI-kit", updated_at: "2026-05-18T18:20:00", favorite: false, shared: true, owner: "Мария И.", activity: "Команда смотрела сегодня" },
    ];

    const DEMO_FILES = [
        { id: 11, parent_id: null, original_filename: "Презентация.pptx", file_size_mb: 12.4, uploaded_at: "2026-05-21T10:00:00", favorite: true, shared: true, owner: "Алексей П.", activity: "Открыта 15 минут назад" },
        { id: 12, parent_id: null, original_filename: "Отчет Q1.pdf", file_size_mb: 2.4, uploaded_at: "2026-05-20T15:40:00", favorite: false, shared: false, owner: "Алексей П.", activity: "Загружен вчера" },
        { id: 13, parent_id: null, original_filename: "Архив.zip", file_size_mb: 45.6, uploaded_at: "2026-05-19T11:30:00", favorite: false, shared: false, owner: "Алексей П.", activity: "Готов к скачиванию" },
        { id: 14, parent_id: null, original_filename: "Фото_001.jpg", file_size_mb: 3.2, uploaded_at: "2026-05-18T14:20:00", favorite: true, shared: false, owner: "Алексей П.", activity: "Добавлено в избранное" },
        { id: 15, parent_id: null, original_filename: "Фото_002.jpg", file_size_mb: 2.1, uploaded_at: "2026-05-18T14:10:00", favorite: false, shared: true, owner: "Дмитрий С.", activity: "Доступ по ссылке" },
        { id: 16, parent_id: null, original_filename: "Видео.mp4", file_size_mb: 15.8, uploaded_at: "2026-05-17T19:00:00", favorite: false, shared: true, owner: "Алексей П.", activity: "Просмотрено сегодня" },
        { id: 17, parent_id: null, original_filename: "Данные.xlsx", file_size_mb: 8.7, uploaded_at: "2026-05-16T12:20:00", favorite: true, shared: false, owner: "Алексей П.", activity: "Автосохранение включено" },
        { id: 18, parent_id: null, original_filename: "Документ.docx", file_size_mb: 1.2, uploaded_at: "2026-05-15T09:10:00", favorite: false, shared: false, owner: "Алексей П.", activity: "Редактировался вчера" },
        { id: 41, parent_id: 1, original_filename: "Коммерческое предложение.pdf", file_size_mb: 5.8, uploaded_at: "2026-05-21T08:25:00", favorite: true, shared: true, owner: "Алексей П.", activity: "Отправлено клиенту" },
        { id: 42, parent_id: 1, original_filename: "Смета.xlsx", file_size_mb: 1.7, uploaded_at: "2026-05-20T17:12:00", favorite: false, shared: true, owner: "Алексей П.", activity: "Мария оставила комментарий" },
        { id: 43, parent_id: 22, original_filename: "render_final.jpg", file_size_mb: 6.4, uploaded_at: "2026-05-20T18:20:00", favorite: true, shared: false, owner: "Алексей П.", activity: "Синхронизировано" },
        { id: 44, parent_id: null, original_filename: "черновик.pdf", file_size_mb: 1.9, uploaded_at: "2026-03-12T10:00:00", deleted: true, favorite: false, shared: false, owner: "Алексей П.", activity: "В корзине 4 дня" },
        { id: 45, parent_id: null, original_filename: "old_archive.zip", file_size_mb: 18.4, uploaded_at: "2026-03-10T10:00:00", deleted: true, favorite: false, shared: false, owner: "Алексей П.", activity: "В корзине 6 дней" },
    ];

    function isDemoMode() {
        return new URLSearchParams(location.search).get("demo") === "1";
    }

    function iconNameFromClass(node) {
        var cls = Array.from(node.classList || []);
        var name = cls.find(function (x) { return x.indexOf("fa-") === 0 && x !== "fas"; });
        return name ? name.replace(/^fa-/, "") : "";
    }

    function enhanceIcons(root) {
        (root || document).querySelectorAll("i.fas").forEach(function (node) {
            var name = iconNameFromClass(node);
            var paths = SVG_ICONS[name];
            if (!paths) return;
            node.dataset.svgReady = "1";
            node.innerHTML =
                '<svg class="ld-svg-icon ld-svg-icon--' +
                escapeHtml(name) +
                '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
                paths +
                "</svg>";
        });
    }

    const $ = function (id) {
        return document.getElementById(id);
    };

    function loginReturnUrl() {
        var host = (location.hostname || "").toLowerCase();
        if (host.indexOf("cloud.") === 0 || host === "cloud.lbl3d.info") {
            return "https://cloud.lbl3d.info/app/";
        }
        return location.origin + location.pathname + location.search;
    }

    function goLogin() {
        window.location.href =
            "/pages/auth/login.html?return=" + encodeURIComponent(loginReturnUrl());
    }

    function consumeTokenFromHash() {
        var hash = (location.hash || "").replace(/^#/, "");
        if (!hash) return false;
        var params = new URLSearchParams(hash);
        var t = params.get("lbl_token");
        if (!t) return false;
        localStorage.setItem("authToken", t);
        if (typeof api !== "undefined" && api.setToken) api.setToken(t);
        history.replaceState(null, "", location.pathname + location.search);
        return true;
    }

    function hasLocalToken() {
        return !!(localStorage.getItem("authToken") || localStorage.getItem("token"));
    }

    function currentAuthHeaders() {
        var headers = { Accept: "application/json" };
        var t = localStorage.getItem("authToken") || localStorage.getItem("token");
        if (t) headers.Authorization = "Bearer " + t;
        return headers;
    }

    function driveApiGet(path) {
        if (typeof api !== "undefined" && api.get) return api.get(path);
        return fetch("/api" + path, {
            credentials: "include",
            headers: currentAuthHeaders(),
        }).then(function (r) {
            if (!r.ok) throw new Error("request failed");
            return r.json();
        });
    }

    function userDisplayName(me) {
        me = me || state.user || {};
        return (
            me.full_name ||
            (me.first_name && me.last_name ? me.first_name + " " + me.last_name : "") ||
            me.first_name ||
            me.username ||
            me.email ||
            "Аккаунт"
        );
    }

    function applyUserHeader(me) {
        state.user = me || state.user || {};
        var name = userDisplayName(state.user);
        var email = state.user.email || "Аккаунт подключен к личному облаку";
        var letter = (name.charAt(0) || "A").toUpperCase();
        var profile = $("linkProfile");
        if (profile) {
            profile.href = "#";
            profile.dataset.section = "settings";
            var topAvatar = $("topAvatar");
            if (topAvatar) {
                topAvatar.textContent = letter;
            } else {
                profile.innerHTML =
                    '<span class="ld-avatar">' + escapeHtml(letter) + "</span><span>" + escapeHtml(name) + "</span>";
                enhanceIcons(profile);
            }
        }
        var profileName = $("profileName");
        var profileEmail = $("profileEmail");
        var profileAvatar = $("profileAvatarLarge");
        if (profileName) profileName.textContent = name;
        if (profileEmail) profileEmail.textContent = email;
        if (profileAvatar) profileAvatar.textContent = letter;
        if (state.user.two_factor_enabled !== undefined) {
            updateProfile2faUi(!!state.user.two_factor_enabled);
        }
    }

    function ensureSession() {
        if (isDemoMode()) return Promise.resolve(true);
        consumeTokenFromHash();
        if (hasLocalToken()) return Promise.resolve(true);
        return fetch("/api/me", { credentials: "include", headers: { Accept: "application/json" } })
            .then(function (r) {
                if (!r.ok) throw new Error("unauthorized");
                return r.json();
            })
            .then(function () {
                return true;
            })
            .catch(function () {
                goLogin();
                return false;
            });
    }

    function fileIcon(name, isFolder) {
        if (isFolder) return "fa-folder";
        const ext = (name.split(".").pop() || "").toLowerCase();
        const map = {
            pdf: "fa-file-pdf",
            zip: "fa-file-zipper",
            rar: "fa-file-zipper",
            "7z": "fa-file-zipper",
            png: "fa-file-image",
            jpg: "fa-file-image",
            jpeg: "fa-file-image",
            webp: "fa-file-image",
            gif: "fa-file-image",
            stl: "fa-cube",
            obj: "fa-cube",
            "3mf": "fa-cube",
            mp4: "fa-file-video",
            webm: "fa-file-video",
            mp3: "fa-file-audio",
            wav: "fa-file-audio",
        };
        return map[ext] || "fa-file";
    }

    function fileToneClass(name, isFolder) {
        if (isFolder) return "ld-file--folder";
        const ext = (name.split(".").pop() || "").toLowerCase();
        if (ext === "link") return "ld-file--link";
        if (ext === "pdf") return "ld-file--pdf";
        if (["zip", "rar", "7z"].indexOf(ext) >= 0) return "ld-file--zip";
        if (["png", "jpg", "jpeg", "webp", "gif", "svg", "ico"].indexOf(ext) >= 0) return "ld-file--img";
        if (["stl", "obj", "3mf"].indexOf(ext) >= 0) return "ld-file--3d";
        if (["mp4", "webm", "mov", "avi"].indexOf(ext) >= 0) return "ld-file--vid";
        if (["mp3", "wav", "ogg"].indexOf(ext) >= 0) return "ld-file--aud";
        if (["doc", "docx", "txt", "rtf", "odt"].indexOf(ext) >= 0) return "ld-file--doc";
        if (["xls", "xlsx", "csv", "ods"].indexOf(ext) >= 0) return "ld-file--sheet";
        if (["ppt", "pptx", "odp"].indexOf(ext) >= 0) return "ld-file--slides";
        if (["js", "ts", "json", "html", "css", "py", "php", "xml"].indexOf(ext) >= 0) return "ld-file--code";
        return "ld-file--file";
    }

    function fileLabel(name, isFolder) {
        if (isFolder) return "";
        const ext = (name.split(".").pop() || "").toUpperCase();
        if (["JPG", "JPEG", "PNG", "WEBP", "GIF"].indexOf(ext) >= 0) return "";
        if (ext === "PPTX" || ext === "PPT") return "P";
        if (ext === "XLSX" || ext === "XLS") return "X";
        if (ext === "DOCX" || ext === "DOC") return "W";
        if (ext === "MP4" || ext === "WEBM" || ext === "MOV") return "▶";
        if (ext === "SVG") return "◇";
        if (ext === "LINK") return "↗";
        return ext.slice(0, 4) || "···";
    }

    function fileAsset(name, isFolder) {
        const base = "/assets/cloud/";
        if (isFolder) {
            const n = name.toLowerCase();
            if (n.indexOf("диз") >= 0 || n.indexOf("design") >= 0) return base + "drive-icon-folder-purple.png";
            if (n.indexOf("док") >= 0 || n.indexOf("doc") >= 0) return base + "drive-icon-folder-blue.png";
            return base + "drive-icon-folder-yellow.png";
        }
        const ext = (name.split(".").pop() || "").toLowerCase();
        if (ext === "pdf") return base + "drive-icon-pdf.png";
        if (["zip", "rar", "7z"].indexOf(ext) >= 0) return base + "drive-icon-zip.png";
        if (["ppt", "pptx"].indexOf(ext) >= 0) return base + "drive-icon-ppt.png";
        if (["xls", "xlsx"].indexOf(ext) >= 0) return base + "drive-icon-xlsx.png";
        if (["doc", "docx"].indexOf(ext) >= 0) return base + "drive-icon-docx.png";
        if (["png", "jpg", "jpeg", "webp", "gif"].indexOf(ext) >= 0) return base + "drive-thumb-mountain.png";
        if (["mp4", "webm", "mov"].indexOf(ext) >= 0) return base + "drive-thumb-video.png";
        return "";
    }

    function isImageFile(name) {
        var ext = (String(name || "").split(".").pop() || "").toLowerCase();
        return ["png", "jpg", "jpeg", "webp", "gif"].indexOf(ext) >= 0;
    }

    function drivePreviewUrl(fileId) {
        var token = localStorage.getItem("authToken") || localStorage.getItem("token");
        var url = "/api/drive/files/" + encodeURIComponent(String(fileId)) + "/preview";
        if (token) url += "?token=" + encodeURIComponent(token);
        return url;
    }

    function itemKind(name, type) {
        if (type === "folder") return "folder";
        const ext = (name.split(".").pop() || "").toLowerCase();
        if (["png", "jpg", "jpeg", "webp", "gif"].indexOf(ext) >= 0) return "image";
        if (["mp4", "webm", "mov"].indexOf(ext) >= 0) return "video";
        if (["zip", "rar", "7z"].indexOf(ext) >= 0) return "archive";
        if (["pdf", "ppt", "pptx", "doc", "docx", "xls", "xlsx"].indexOf(ext) >= 0) return "document";
        return "file";
    }

    function matchesKind(item) {
        if (state.kind === "all") return true;
        if (state.kind === "file") return item.type === "file";
        return itemKind(item.name, item.type) === state.kind;
    }

    function sortRenderableItems(items) {
        return items.slice().sort(function (a, b) {
            if (a.type !== b.type && state.sort !== "size-desc") return a.type === "folder" ? -1 : 1;
            if (state.sort === "name-asc") return a.name.localeCompare(b.name, "ru");
            if (state.sort === "size-desc") return Number(b.size_mb || 0) - Number(a.size_mb || 0);
            if (state.sort === "type-asc") {
                return itemKind(a.name, a.type).localeCompare(itemKind(b.name, b.type), "ru") || a.name.localeCompare(b.name, "ru");
            }
            return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
        });
    }

    function cloneDemoItem(item) {
        return Object.assign({}, item);
    }

    function ensureDemoStore() {
        if (!state.demoStore) {
            state.demoStore = {
                folders: DEMO_FOLDERS.map(cloneDemoItem),
                files: DEMO_FILES.map(cloneDemoItem),
                nextFolderId: 1000,
                nextFileId: 2000,
            };
        }
        return state.demoStore;
    }

    function folderPath(folderId) {
        var store = ensureDemoStore();
        var path = [];
        var current = folderId;
        var guard = 0;
        while (current != null && guard < 20) {
            var f = store.folders.find(function (x) { return x.id === current; });
            if (!f) break;
            path.unshift({ id: f.id, name: f.name });
            current = f.parent_id == null ? null : f.parent_id;
            guard += 1;
        }
        return [{ id: null, name: SECTION_LABELS[state.section] || "Мой диск" }].concat(path);
    }

    function normalizeFolder(folder) {
        var store = ensureDemoStore();
        var count = store.folders.filter(function (x) { return !x.deleted && x.parent_id === folder.id; }).length +
            store.files.filter(function (x) { return !x.deleted && x.parent_id === folder.id; }).length;
        return Object.assign({}, folder, {
            count: count,
            updated_at: folder.updated_at || new Date().toISOString(),
        });
    }

    function sortDemoData(data) {
        function valueDate(x) {
            return new Date(x.uploaded_at || x.updated_at || 0).getTime();
        }
        function valueName(x) {
            return (x.name || x.original_filename || "").toLowerCase();
        }
        function valueSize(x) {
            return Number(x.file_size_mb || 0);
        }
        function typeName(x) {
            return x.original_filename ? itemKind(x.original_filename, "file") : "folder";
        }
        var sorter = function (a, b) {
            if (state.sort === "name-asc") return valueName(a).localeCompare(valueName(b), "ru");
            if (state.sort === "size-desc") return valueSize(b) - valueSize(a);
            if (state.sort === "type-asc") return typeName(a).localeCompare(typeName(b), "ru") || valueName(a).localeCompare(valueName(b), "ru");
            return valueDate(b) - valueDate(a);
        };
        data.folders.sort(sorter);
        data.files.sort(sorter);
        return data;
    }

    function demoBrowse() {
        var store = ensureDemoStore();
        var folders = [];
        var files = [];
        if (state.section === "recent") {
            folders = [];
            files = store.files.filter(function (x) { return !x.deleted; });
        } else if (state.section === "favorites") {
            folders = store.folders.filter(function (x) { return !x.deleted && x.favorite; });
            files = store.files.filter(function (x) { return !x.deleted && x.favorite; });
        } else if (state.section === "shared") {
            folders = store.folders.filter(function (x) { return !x.deleted && x.shared; });
            files = store.files.filter(function (x) { return !x.deleted && x.shared; });
        } else if (state.section === "trash") {
            folders = store.folders.filter(function (x) { return x.deleted; });
            files = store.files.filter(function (x) { return x.deleted; });
        } else if (state.section === "settings") {
            folders = [
                { id: 9001, name: "Безопасность", parent_id: null, updated_at: "2026-05-22T09:00:00", owner: "LBL Cloud", activity: "AES-256 и контроль сессий" },
                { id: 9002, name: "Доступ", parent_id: null, updated_at: "2026-05-22T09:00:00", owner: "LBL Cloud", activity: "Ссылки, команды и роли" },
                { id: 9003, name: "Тариф", parent_id: null, updated_at: "2026-05-22T09:00:00", owner: "LBL Cloud", activity: "5 ГБ бесплатно" },
            ];
            files = [
                { id: 9004, original_filename: "политика-доступа.docx", file_size_mb: 0.8, uploaded_at: "2026-05-20T10:00:00", owner: "LBL Cloud", activity: "Шаблон правил доступа" },
                { id: 9005, original_filename: "история-активности.xlsx", file_size_mb: 1.4, uploaded_at: "2026-05-19T10:00:00", owner: "LBL Cloud", activity: "Журнал действий" },
            ];
        } else {
            folders = store.folders.filter(function (x) { return !x.deleted && x.parent_id === state.folderId; });
            files = store.files.filter(function (x) { return !x.deleted && x.parent_id === state.folderId; });
        }
        var used = store.files.reduce(function (sum, file) {
            return sum + (file.deleted ? 0 : Number(file.file_size_mb || 0));
        }, 1620);
        return sortDemoData({
            breadcrumbs: state.section === "drive" ? folderPath(state.folderId) : [{ id: null, name: SECTION_LABELS[state.section] || "Мой диск" }],
            storage_used_mb: used,
            storage_limit_mb: 5120,
            folders: folders.map(normalizeFolder),
            files: files.map(cloneDemoItem),
        });
    }

    function formatSize(mb) {
        if (mb >= 1024) return (mb / 1024).toFixed(2) + " ГБ";
        return mb.toFixed(2) + " МБ";
    }

    function formatBytes(bytes) {
        bytes = Number(bytes) || 0;
        if (bytes < 1024) return bytes + " Б";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
        if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " МБ";
        return (bytes / 1024 / 1024 / 1024).toFixed(2) + " ГБ";
    }

    function formatSpeed(bytesPerSec) {
        bytesPerSec = Number(bytesPerSec) || 0;
        if (bytesPerSec <= 0) return "—";
        var cap = 120 * 1024 * 1024;
        if (bytesPerSec > cap) bytesPerSec = cap;
        if (bytesPerSec < 1024) return Math.round(bytesPerSec) + " Б/с";
        if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + " КБ/с";
        return (bytesPerSec / 1024 / 1024).toFixed(1) + " МБ/с";
    }

    function formatEta(loaded, total, bytesPerSec) {
        if (!bytesPerSec || bytesPerSec <= 0 || !total || loaded >= total) return "";
        var sec = (total - loaded) / bytesPerSec;
        if (sec < 3) return "почти готово";
        if (sec < 60) return "~" + Math.ceil(sec) + " сек";
        if (sec < 3600) return "~" + Math.ceil(sec / 60) + " мин";
        return "~" + (sec / 3600).toFixed(1) + " ч";
    }

    function formatUploadSubline(loaded, total, bytesPerSec, phase, mode) {
        if (phase === "connect") return "Подключение…";
        if (!total) return "";
        var loadedBytes = loaded != null ? loaded : 0;
        if (phase === "init" && mode === "chunks") return "Подключение…";
        if (phase === "init") return "Подготовка…";
        var line = formatBytes(loadedBytes) + " из " + formatBytes(total);
        if (bytesPerSec > 0 && loadedBytes > 0 && loadedBytes < total) {
            line += " · " + formatSpeed(bytesPerSec);
            var eta = formatEta(loadedBytes, total, bytesPerSec);
            if (eta) line += " · " + eta;
        }
        return line;
    }

    var uploadProgressState = typeof WeakMap !== "undefined" ? new WeakMap() : null;
    var uploadProgressRaf = 0;
    var uploadProgressPending = null;

    function updateStorage(used, limit) {
        const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
        var pctEl = $("storagePct");
        if (pctEl) pctEl.textContent = pct + "%";
        $("storageBar").style.width = pct + "%";
        $("storageMeta").textContent = formatSize(used) + " из " + formatSize(limit);
        var ring = $("storageRing");
        if (ring) ring.style.strokeDashoffset = String(STORAGE_CIRC * (1 - pct / 100));
        var settingsStorage = $("settingsStorageText");
        var profileStorage = $("profileStorageTitle");
        if (settingsStorage) settingsStorage.textContent = formatSize(used) + " из " + formatSize(limit) + " занято";
        if (profileStorage) profileStorage.textContent = pct + "% занято";
    }

    function updateBillingUi(status) {
        var active = status && status.active && status.plan_id !== "free";
        var planName = active ? (status.plan_name || status.plan_id || "Cloud Pro") : "Бесплатный Cloud";
        var storage = status && status.storage_gb ? status.storage_gb + " ГБ" : "5 ГБ";
        var until = status && status.paid_until
            ? new Date(status.paid_until).toLocaleDateString("ru")
            : "";
        var meta = active
            ? storage + (until ? " · активен до " + until : " · активен")
            : storage + " · можно увеличить в любой момент";
        var sideLabel = $("planCardLabel");
        var sideMeta = $("planCardMeta");
        var sideBtn = $("planCardBtn");
        var profilePlan = $("profilePlanName");
        var profilePlanMeta = $("profilePlanMeta");
        if (sideLabel) sideLabel.textContent = "Тариф: " + planName;
        if (sideMeta) sideMeta.textContent = meta;
        if (sideBtn) sideBtn.textContent = active ? "Управлять тарифом" : "Увеличить место";
        if (profilePlan) profilePlan.textContent = planName;
        if (profilePlanMeta) profilePlanMeta.textContent = meta;
    }

    function loadBillingStatus() {
        if (isDemoMode()) {
            updateBillingUi(null);
            return Promise.resolve();
        }
        return driveApiGet("/cloud/billing/status")
            .then(updateBillingUi)
            .catch(function () {
                updateBillingUi(null);
            });
    }

    var profileSecurityInited = false;
    var profile2faAction = null;

    function driveApiCall(method, path, body) {
        if (typeof api !== "undefined") {
            if (method === "GET" && api.get) return api.get(path);
            if (method === "POST" && api.post) return api.post(path, body || {});
            if (method === "PUT" && api.put) return api.put(path, body || {});
        }
        var opts = {
            method: method,
            credentials: "include",
            headers: Object.assign({ Accept: "application/json" }, currentAuthHeaders()),
        };
        if (body !== undefined) {
            opts.headers["Content-Type"] = "application/json";
            opts.body = JSON.stringify(body);
        }
        try {
            var cm = document.cookie.match(/(?:^|; )lbl_csrf=([^;]*)/);
            if (cm && method !== "GET") {
                opts.headers["X-CSRF-Token"] = decodeURIComponent(cm[1]);
            }
        } catch (e) { /* noop */ }
        return fetch("/api" + path, opts).then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok) {
                    throw new Error((data && (data.detail || data.message)) || "Ошибка запроса");
                }
                return data;
            });
        });
    }

    function setProfileSecurityStatus(el, message, kind) {
        if (!el) return;
        el.textContent = message || "";
        el.classList.remove("is-error", "is-success", "is-info");
        if (kind) el.classList.add("is-" + kind);
    }

    function hideProfile2faCodeBlock() {
        profile2faAction = null;
        var block = $("profile2faCodeBlock");
        var input = $("profile2faCode");
        var hint = $("profile2faHint");
        if (block) block.classList.add("is-hidden");
        if (input) input.value = "";
        if (hint) hint.textContent = "";
    }

    function showProfile2faCodeBlock(action, hintText) {
        profile2faAction = action;
        var block = $("profile2faCodeBlock");
        var hint = $("profile2faHint");
        if (block) block.classList.remove("is-hidden");
        if (hint) hint.textContent = hintText || "Введите 6-значный код из письма";
        var input = $("profile2faCode");
        if (input) {
            input.focus();
            input.select();
        }
    }

    function updateProfile2faUi(enabled) {
        var badge = $("profile2faBadge");
        var btn = $("profile2faToggleBtn");
        var desc = $("profile2faDesc");
        if (badge) {
            badge.textContent = enabled ? "Включено" : "Выключено";
            badge.classList.toggle("ld-pill--on", !!enabled);
            badge.classList.toggle("ld-pill--off", !enabled);
        }
        if (btn) {
            btn.textContent = enabled ? "Выключить" : "Включить";
            btn.classList.toggle("ld-btn--primary", !enabled);
            btn.classList.toggle("ld-btn--soft", !!enabled);
        }
        if (desc) {
            desc.textContent = enabled
                ? "При входе запрашивается код с email"
                : "Код подтверждения при каждом входе";
        }
        if (!profile2faAction) hideProfile2faCodeBlock();
    }

    function parseSessionDevice(item) {
        var ua = item.user_agent || "";
        var browser = "Браузер";
        if (ua.indexOf("Edg") >= 0) browser = "Edge";
        else if (ua.indexOf("Chrome") >= 0) browser = "Chrome";
        else if (ua.indexOf("Firefox") >= 0) browser = "Firefox";
        else if (ua.indexOf("Safari") >= 0) browser = "Safari";
        else if (ua.indexOf("Opera") >= 0 || ua.indexOf("OPR") >= 0) browser = "Opera";

        var device = item.device_info || "";
        if (!device || device === "Неизвестно" || device === ua) {
            if (ua.indexOf("Windows") >= 0) device = "Windows · " + browser;
            else if (ua.indexOf("Mac OS") >= 0 || ua.indexOf("Macintosh") >= 0) device = "macOS · " + browser;
            else if (ua.indexOf("Android") >= 0) device = "Android · " + browser;
            else if (ua.indexOf("iPhone") >= 0 || ua.indexOf("iPad") >= 0) device = "iOS · " + browser;
            else if (ua.indexOf("Linux") >= 0) device = "Linux · " + browser;
            else device = browser;
        }
        return device;
    }

    function renderProfileLoginHistory(items) {
        var list = $("profileLoginHistory");
        if (!list) return;
        if (!items || !items.length) {
            list.innerHTML = '<li class="ld-session-list__empty">История входов пуста</li>';
            return;
        }
        list.innerHTML = items
            .map(function (item) {
                var when = item.login_at ? new Date(item.login_at).toLocaleString("ru-RU") : "";
                var device = escapeHtml(parseSessionDevice(item));
                var location = escapeHtml(item.location || "Неизвестно");
                var ip = escapeHtml(item.ip_address || "—");
                var current = item.is_current ? " is-current" : "";
                var badge = item.is_current ? " · текущая сессия" : "";
                return (
                    '<li class="' +
                    current +
                    '"><strong>' +
                    device +
                    badge +
                    "</strong><span>" +
                    location +
                    " · IP " +
                    ip +
                    "</span><span>" +
                    escapeHtml(when) +
                    "</span></li>"
                );
            })
            .join("");
    }

    function loadProfileLoginHistory() {
        var list = $("profileLoginHistory");
        if (!list) return Promise.resolve();
        if (isDemoMode()) {
            renderProfileLoginHistory([
                {
                    login_at: new Date().toISOString(),
                    user_agent: "Windows Chrome",
                    location: "Москва",
                    ip_address: "127.0.0.1",
                    is_current: true,
                },
            ]);
            return Promise.resolve();
        }
        list.innerHTML = '<li class="ld-session-list__empty">Загружаем историю входов…</li>';
        return driveApiCall("GET", "/security/login-history?limit=8")
            .then(renderProfileLoginHistory)
            .catch(function () {
                list.innerHTML = '<li class="ld-session-list__empty">Не удалось загрузить историю</li>';
            });
    }

    function loadProfileAccount() {
        if (isDemoMode()) {
            updateProfile2faUi(false);
            loadProfileLoginHistory();
            return Promise.resolve();
        }
        return driveApiCall("GET", "/me")
            .then(function (me) {
                applyUserHeader(me);
                updateProfile2faUi(!!me.two_factor_enabled);
            })
            .catch(function () {
                updateProfile2faUi(!!(state.user && state.user.two_factor_enabled));
            })
            .then(loadProfileLoginHistory);
    }

    function initProfileSecurity() {
        if (profileSecurityInited) return;
        profileSecurityInited = true;

        var toggleBtn = $("profile2faToggleBtn");
        if (toggleBtn) {
            toggleBtn.addEventListener("click", function () {
                if (isDemoMode()) {
                    showToast("2FA доступна после входа в аккаунт");
                    return;
                }
                var enabled = state.user && state.user.two_factor_enabled;
                toggleBtn.disabled = true;
                if (enabled) {
                    if (!window.confirm("Выключить двухфакторную аутентификацию? Безопасность аккаунта снизится.")) {
                        toggleBtn.disabled = false;
                        return;
                    }
                    driveApiCall("POST", "/2fa/disable", {})
                        .then(function (res) {
                            if (res.requires_code) {
                                showProfile2faCodeBlock("disable", res.message || "Код отправлен на email");
                                showToast("Код отправлен на почту");
                            } else {
                                state.user = state.user || {};
                                state.user.two_factor_enabled = false;
                                updateProfile2faUi(false);
                                showToast("2FA выключена");
                            }
                        })
                        .catch(function (err) {
                            showToast(err.message || "Не удалось выключить 2FA");
                        })
                        .finally(function () {
                            toggleBtn.disabled = false;
                        });
                } else {
                    driveApiCall("POST", "/2fa/enable", {})
                        .then(function (res) {
                            showProfile2faCodeBlock("enable", res.message || "Код отправлен на email");
                            showToast("Код отправлен на почту");
                        })
                        .catch(function (err) {
                            showToast(err.message || "Не удалось включить 2FA");
                        })
                        .finally(function () {
                            toggleBtn.disabled = false;
                        });
                }
            });
        }

        var confirmBtn = $("profile2faConfirmBtn");
        if (confirmBtn) {
            confirmBtn.addEventListener("click", function () {
                var code = (($("profile2faCode") && $("profile2faCode").value) || "").replace(/\D/g, "");
                if (code.length !== 6) {
                    showToast("Введите 6-значный код");
                    return;
                }
                confirmBtn.disabled = true;
                var path = profile2faAction === "disable" ? "/2fa/disable" : "/2fa/verify";
                driveApiCall("POST", path, { code: code })
                    .then(function (res) {
                        state.user = state.user || {};
                        state.user.two_factor_enabled =
                            res.two_factor_enabled !== undefined
                                ? !!res.two_factor_enabled
                                : profile2faAction !== "disable";
                        hideProfile2faCodeBlock();
                        updateProfile2faUi(state.user.two_factor_enabled);
                        showToast(profile2faAction === "disable" ? "2FA выключена" : "2FA включена");
                    })
                    .catch(function (err) {
                        showToast(err.message || "Неверный код");
                    })
                    .finally(function () {
                        confirmBtn.disabled = false;
                    });
            });
        }

        var codeInput = $("profile2faCode");
        if (codeInput) {
            codeInput.addEventListener("keydown", function (e) {
                if (e.key === "Enter") {
                    e.preventDefault();
                    if (confirmBtn) confirmBtn.click();
                }
            });
        }

        var pwdForm = $("profilePasswordForm");
        if (pwdForm) {
            pwdForm.addEventListener("submit", function (e) {
                e.preventDefault();
                if (isDemoMode()) {
                    showToast("Смена пароля доступна после входа");
                    return;
                }
                var current = pwdForm.querySelector('[name="current"]');
                var next = pwdForm.querySelector('[name="new"]');
                var confirm = pwdForm.querySelector('[name="confirm"]');
                var statusEl = $("profilePasswordStatus");
                var currentVal = current ? current.value : "";
                var newVal = next ? next.value : "";
                var confirmVal = confirm ? confirm.value : "";
                if (!currentVal) {
                    setProfileSecurityStatus(statusEl, "Введите текущий пароль", "error");
                    return;
                }
                if (newVal.length < 8) {
                    setProfileSecurityStatus(statusEl, "Новый пароль — минимум 8 символов", "error");
                    return;
                }
                if (newVal !== confirmVal) {
                    setProfileSecurityStatus(statusEl, "Пароли не совпадают", "error");
                    return;
                }
                var submitBtn = pwdForm.querySelector('[type="submit"]');
                if (submitBtn) submitBtn.disabled = true;
                setProfileSecurityStatus(statusEl, "Сохраняем…", "info");
                driveApiCall("PUT", "/change-password", {
                    current_password: currentVal,
                    new_password: newVal,
                })
                    .then(function (res) {
                        setProfileSecurityStatus(statusEl, res.message || "Пароль изменён", "success");
                        pwdForm.reset();
                        if (res.logout_required) {
                            setTimeout(goLogin, 1800);
                        }
                    })
                    .catch(function (err) {
                        setProfileSecurityStatus(statusEl, err.message || "Не удалось сменить пароль", "error");
                    })
                    .finally(function () {
                        if (submitBtn) submitBtn.disabled = false;
                    });
            });
        }

        var logoutAllBtn = $("profileLogoutAllBtn");
        if (logoutAllBtn) {
            logoutAllBtn.addEventListener("click", function () {
                if (isDemoMode()) {
                    showToast("Доступно после входа в аккаунт");
                    return;
                }
                if (!window.confirm("Выйти на всех устройствах, кроме текущего?")) return;
                logoutAllBtn.disabled = true;
                driveApiCall("POST", "/logout-all-sessions", {})
                    .then(function (res) {
                        showToast(res.message || "Сессии закрыты");
                        loadProfileLoginHistory();
                    })
                    .catch(function (err) {
                        showToast(err.message || "Не удалось закрыть сессии");
                    })
                    .finally(function () {
                        logoutAllBtn.disabled = false;
                    });
            });
        }
    }

    function setUploadsUiVisible(visible) {
        var shell = $("driveShell");
        var dock = $("uploadsPanel");
        var fab = $("uploadsFab");
        var list = $("uploadsList");
        var hasItems = !!(list && list.children.length);
        if (shell) shell.classList.toggle("is-uploading", visible);
        if (dock) {
            dock.classList.toggle("is-hidden", !visible);
            if (visible) dock.classList.remove("is-collapsed");
        }
        if (fab) {
            if (!visible) {
                fab.classList.toggle("is-hidden", !hasItems);
            } else if (visible && dock && dock.classList.contains("is-collapsed")) {
                fab.classList.remove("is-hidden");
            } else {
                fab.classList.add("is-hidden");
            }
        }
    }

    function updateUploadsCount() {
        var list = $("uploadsList");
        var n = list ? list.children.length : 0;
        var active = list
            ? list.querySelectorAll(".ld-up-item.is-active, .ld-up-item.is-uploading").length
            : 0;
        var done = list ? list.querySelectorAll(".ld-up-item.is-done").length : 0;
        var errors = list ? list.querySelectorAll(".ld-up-item.is-error").length : 0;
        var countEl = $("uploadsCount");
        var badge = $("uploadsFabBadge");
        var fab = $("uploadsFab");
        if (countEl) countEl.textContent = String(n);
        if (badge) {
            if (active > 0) {
                badge.textContent = String(active);
                badge.classList.remove("is-success");
            } else if (n > 0 && done > 0 && errors === 0) {
                badge.textContent = "✓";
                badge.classList.add("is-success");
            } else {
                badge.textContent = String(n);
                badge.classList.remove("is-success");
            }
        }
        if (fab && $("uploadsPanel") && $("uploadsPanel").classList.contains("is-hidden")) {
            fab.classList.toggle("is-hidden", n === 0);
        }
    }

    function renderBreadcrumbs(crumbs) {
        const el = $("breadcrumbs");
        el.innerHTML = "";
        crumbs.forEach(function (c, i) {
            if (i > 0) {
                const sep = document.createElement("span");
                sep.className = "sep";
                sep.textContent = "/";
                el.appendChild(sep);
            }
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = c.name;
            if (c.id == null && i === 0) btn.classList.add("is-root");
            btn.dataset.id = c.id == null ? "" : String(c.id);
            btn.addEventListener("click", function () {
                state.folderId = c.id == null ? null : parseInt(c.id, 10);
                state.page = 1;
                resetWorkspaceScroll();
                loadBrowse();
            });
            el.appendChild(btn);
        });
    }

    function itemKey(type, id) {
        return type + ":" + String(id);
    }

    function findCurrentItem(type, id) {
        return (state.currentItems || []).find(function (item) {
            return item.type === type && String(item.id) === String(id);
        });
    }

    function itemKindLabel(item) {
        if (!item) return "Файл";
        if (item.type === "folder") return "Папка";
        var kind = itemKind(item.name, item.type);
        return {
            image: "Изображение",
            video: "Видео",
            archive: "Архив",
            document: "Документ",
            file: "Файл",
        }[kind] || "Файл";
    }

    function itemAccessLabel(item) {
        if (!item) return "Только вы";
        if (item.shared) return "Доступ по ссылке";
        return "Только вы";
    }

    function selectionPreviewHtml(item) {
        if (!item) return "";
        var asset = fileAsset(item.name, item.type === "folder");
        var icon = fileIcon(item.name, item.type === "folder");
        var label = fileLabel(item.name, item.type === "folder");
        return (
            '<div class="ld-inspector__art ' +
            fileToneClass(item.name, item.type === "folder") +
            '">' +
            (asset ? '<img src="' + asset + '" alt="" loading="lazy">' : '<i class="fas ' + icon + '"></i>') +
            (label ? '<span>' + escapeHtml(label) + "</span>" : "") +
            "</div>"
        );
    }

    function setSelected(type, id) {
        var item = findCurrentItem(type, id);
        if (!item) {
            clearSelection();
            return;
        }
        state.selected = { type: type, id: id };
        document.querySelectorAll(".ld-file").forEach(function (node) {
            node.classList.toggle("is-selected", node.dataset.type === type && String(node.dataset.id) === String(id));
        });
        renderSelectionUi(item);
    }

    function clearSelection() {
        state.selected = null;
        document.querySelectorAll(".ld-file.is-selected").forEach(function (node) {
            node.classList.remove("is-selected");
        });
        var bar = $("selectionBar");
        var inspector = $("driveInspector");
        if (bar) bar.classList.add("is-hidden");
        if (inspector) inspector.classList.add("is-hidden");
    }

    function renderSelectionUi(item) {
        var bar = $("selectionBar");
        var inspector = $("driveInspector");
        if (!item || !bar || !inspector) return;
        var icon = bar.querySelector(".ld-selection-bar__icon");
        var name = $("selectionName");
        var meta = $("selectionMeta");
        if (icon) {
            icon.innerHTML = '<i class="fas ' + fileIcon(item.name, item.type === "folder") + '"></i>';
            enhanceIcons(icon);
        }
        if (name) name.textContent = item.name;
        if (meta) meta.textContent = itemKindLabel(item) + " · " + item.meta;
        $("inspectorPreview").innerHTML = selectionPreviewHtml(item);
        $("inspectorKind").textContent = itemKindLabel(item);
        $("inspectorName").textContent = item.name;
        $("inspectorMeta").textContent = item.meta || "Без размера";
        $("inspectorOwner").textContent = item.owner || "Алексей П.";
        $("inspectorAccess").textContent = itemAccessLabel(item);
        $("inspectorActivity").textContent = item.activity || "Синхронизировано";
        enhanceIcons(inspector);
        bar.classList.remove("is-hidden");
        inspector.classList.remove("is-hidden");
    }

    function restoreSelectionIfPossible() {
        if (!state.selected) {
            clearSelection();
            return;
        }
        var item = findCurrentItem(state.selected.type, state.selected.id);
        if (item) renderSelectionUi(item);
        else clearSelection();
    }

    function bindFileEvents(node) {
        if (node.dataset.static === "upload") {
            node.addEventListener("click", function () {
                var input = $("fileInput");
                if (input) input.click();
            });
            return;
        }
        node.tabIndex = 0;
        node.addEventListener("click", function () {
            if (node.dataset.type === "folder") {
                state.folderId = parseInt(node.dataset.id, 10);
                state.page = 1;
                clearSelection();
                resetWorkspaceScroll();
                loadBrowse();
                return;
            }
            setSelected(node.dataset.type, parseInt(node.dataset.id, 10));
        });
        node.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                if (node.dataset.type === "folder") {
                    state.folderId = parseInt(node.dataset.id, 10);
                    state.page = 1;
                    clearSelection();
                    resetWorkspaceScroll();
                    loadBrowse();
                    return;
                }
                setSelected(node.dataset.type, parseInt(node.dataset.id, 10));
            }
        });
        node.addEventListener("dblclick", function () {
            const type = node.dataset.type;
            const id = parseInt(node.dataset.id, 10);
            if (type === "folder") {
                state.folderId = id;
                state.page = 1;
                resetWorkspaceScroll();
                loadBrowse();
            } else {
                downloadFile(id);
            }
        });
        var menuBtn = node.querySelector(".ld-file__menu");
        if (menuBtn) {
            menuBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                openContextMenu(
                    node.dataset.type,
                    parseInt(node.dataset.id, 10),
                    node.querySelector(".ld-file__name").textContent,
                    e
                );
            });
        }
        node.addEventListener("contextmenu", function (e) {
            e.preventDefault();
            openContextMenu(
                node.dataset.type,
                parseInt(node.dataset.id, 10),
                node.querySelector(".ld-file__name").textContent,
                e
            );
        });
    }

    function shouldPaginateRoot() {
        if (state.view === "grid") return false;
        return state.folderId == null && state.section !== "settings";
    }

    function rootPageSize() {
        if (!shouldPaginateRoot()) return Number.MAX_SAFE_INTEGER;
        return 40;
    }

    function pageItems(items) {
        if (!shouldPaginateRoot()) return items;
        var pageSize = rootPageSize();
        var totalPages = Math.max(1, Math.ceil(items.length / pageSize));
        state.page = Math.min(Math.max(1, state.page || 1), totalPages);
        var start = (state.page - 1) * pageSize;
        return items.slice(start, start + pageSize);
    }

    function renderPager(total) {
        var pager = $("drivePager");
        if (!pager) return;
        var pageSize = rootPageSize();
        if (!shouldPaginateRoot() || total <= pageSize) {
            pager.classList.add("is-hidden");
            pager.innerHTML = "";
            return;
        }
        var totalPages = Math.max(1, Math.ceil(total / pageSize));
        state.page = Math.min(Math.max(1, state.page || 1), totalPages);
        var start = (state.page - 1) * pageSize + 1;
        var end = Math.min(total, state.page * pageSize);
        pager.classList.remove("is-hidden");
        pager.innerHTML =
            '<span class="ld-pager__meta">' + start + "-" + end + " из " + total + "</span>" +
            '<div class="ld-pager__controls">' +
            '<button type="button" data-page-action="prev" ' + (state.page <= 1 ? "disabled" : "") + ' aria-label="Предыдущая страница"><i class="fas fa-chevron-right"></i></button>' +
            '<strong>Стр. ' + state.page + " / " + totalPages + "</strong>" +
            '<button type="button" data-page-action="next" ' + (state.page >= totalPages ? "disabled" : "") + ' aria-label="Следующая страница"><i class="fas fa-chevron-right"></i></button>' +
            "</div>";
        enhanceIcons(pager);
        pager.querySelectorAll("[data-page-action]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                if (btn.dataset.pageAction === "prev") state.page -= 1;
                if (btn.dataset.pageAction === "next") state.page += 1;
                clearSelection();
                renderGrid(state.lastBrowseData || { folders: [], files: [] });
                resetWorkspaceScroll();
            });
        });
    }

    function ownerInitials(owner) {
        var parts = String(owner || "A").trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
        return (parts[0].charAt(0) || "A").toUpperCase();
    }

    function fileReasonText(it) {
        if (it.activity) return it.activity;
        if (it.updated_at) {
            return "Изменён · " + new Date(it.updated_at).toLocaleDateString("ru-RU");
        }
        return "В вашем облаке";
    }

    function folderLocationLabel() {
        if (state.folderId == null) return "Мой диск";
        var crumbs = folderPath(state.folderId);
        var last = crumbs[crumbs.length - 1];
        return last && last.name ? last.name : "Мой диск";
    }

    function updateDriveStats(total) {
        var stats = $("driveStats");
        var countEl = $("driveFilesCount");
        if (countEl) countEl.textContent = total > 0 ? String(total) : "";
        if (!stats) return;
        if (state.section === "settings") {
            stats.innerHTML = "";
            return;
        }
        var folders = 0;
        var files = 0;
        (state.currentItems || []).forEach(function (it) {
            if (it.type === "folder") folders += 1;
            else files += 1;
        });
        stats.innerHTML =
            '<span class="ld-stat"><strong>' +
            total +
            "</strong> в разделе</span>" +
            (folders
                ? '<span class="ld-stat"><i class="fas fa-folder"></i> ' + folders + " папок</span>"
                : "") +
            (files ? '<span class="ld-stat"><i class="fas fa-file"></i> ' + files + " файлов</span>" : "") +
            '<span class="ld-stat"><i class="fas fa-lock"></i> Шифрование AES</span>';
        enhanceIcons(stats);
    }

    function renderSuggestedFolders() {
        var block = $("driveSuggest");
        if (block) block.classList.add("is-hidden");
    }

    function renderFileRow(it, idx, selected) {
        const icon = fileIcon(it.name, it.type === "folder");
        const tone = fileToneClass(it.name, it.type === "folder");
        const label = fileLabel(it.name, it.type === "folder");
        const asset = it.preview_url || fileAsset(it.name, it.type === "folder");
        const owner = it.owner || "Вы";
        const reason = escapeHtml(fileReasonText(it));
        const folderLabel = escapeHtml(folderLocationLabel());

        if (state.view === "list") {
            return (
                '<article class="ld-file ' +
                tone +
                (selected ? " is-selected" : "") +
                '" style="--i:' +
                idx +
                '" data-type="' +
                it.type +
                '" data-id="' +
                it.id +
                '" aria-selected="' +
                (selected ? "true" : "false") +
                '">' +
                '<div class="ld-file__name">' +
                '<div class="ld-file__icon' +
                (asset ? " has-asset" : "") +
                '" data-label="' +
                escapeHtml(label) +
                '">' +
                (asset ? '<img class="ld-file__asset" src="' + asset + '" alt="" loading="lazy">' : "") +
                '<i class="fas ' +
                icon +
                '"></i></div>' +
                "<span>" +
                escapeHtml(it.name) +
                "</span></div>" +
                '<div class="ld-file__reason">' +
                reason +
                "</div>" +
                '<div class="ld-file__owner"><span class="ld-file__owner-avatar">' +
                escapeHtml(ownerInitials(owner)) +
                '</span><span>' +
                escapeHtml(owner) +
                "</span></div>" +
                '<div class="ld-file__folder"><i class="fas fa-folder"></i> ' +
                folderLabel +
                "</div>" +
                '<button type="button" class="ld-file__menu" aria-label="Действия"><i class="fas fa-ellipsis-vertical"></i></button>' +
                '<div class="ld-file__badges">' +
                (it.favorite ? '<span title="В избранном"><i class="fas fa-star"></i></span>' : "") +
                (it.shared ? '<span title="Доступ по ссылке"><i class="fas fa-link"></i></span>' : "") +
                "</div></article>"
            );
        }

        return (
            '<article class="ld-file ' +
            tone +
            (selected ? " is-selected" : "") +
            '" style="--i:' +
            idx +
            '" data-type="' +
            it.type +
            '" data-id="' +
            it.id +
            '" aria-selected="' +
            (selected ? "true" : "false") +
            '">' +
            '<button type="button" class="ld-file__menu" aria-label="Действия"><i class="fas fa-ellipsis-vertical"></i></button>' +
            '<div class="ld-file__badges">' +
            (it.favorite ? '<span title="В избранном"><i class="fas fa-star"></i></span>' : "") +
            (it.shared ? '<span title="Доступ по ссылке"><i class="fas fa-link"></i></span>' : "") +
            "</div>" +
            '<div class="ld-file__icon' +
            (asset ? " has-asset" : "") +
            '" data-label="' +
            escapeHtml(label) +
            '">' +
            (asset ? '<img class="ld-file__asset" src="' + asset + '" alt="" loading="lazy">' : "") +
            '<i class="fas ' +
            icon +
            '"></i></div>' +
            '<div class="ld-file__body">' +
            '<div class="ld-file__name">' +
            escapeHtml(it.name) +
            "</div>" +
            (it.meta ? '<div class="ld-file__meta">' + escapeHtml(it.meta) + "</div>" : "") +
            "</div></article>"
        );
    }

    function renderGrid(data) {
        const grid = $("driveGrid");
        const empty = $("driveEmpty");
        const loading = $("driveLoading");
        const workspace = document.querySelector(".ld-workspace");
        loading.classList.add("is-hidden");
        state.lastBrowseData = data;
        renderSuggestedFolders(data);
        const items = [];
        (data.folders || []).forEach(function (f) {
            items.push({
                type: "folder",
                id: f.id,
                name: f.name,
                meta: f.count ? f.count + " объектов" : "Папка",
                updated_at: f.updated_at || new Date().toISOString(),
                size_mb: 0,
                favorite: !!f.favorite,
                shared: !!f.shared,
                owner: f.owner || "Алексей П.",
                activity: f.activity || "Папка синхронизирована",
            });
        });
        (data.files || []).forEach(function (f) {
            items.push({
                type: "file",
                id: f.id,
                name: f.original_filename,
                updated_at: f.uploaded_at || f.updated_at || new Date().toISOString(),
                size_mb: Number(f.file_size_mb || 0),
                favorite: !!f.favorite,
                shared: !!f.shared,
                owner: f.owner || "Алексей П.",
                activity: f.activity || "Файл синхронизирован",
                preview_url: isImageFile(f.original_filename) ? drivePreviewUrl(f.id) : "",
                meta:
                    formatSize(f.file_size_mb) +
                    (f.uploaded_at ? " · " + new Date(f.uploaded_at).toLocaleDateString("ru-RU") : ""),
            });
        });
        const visibleItems = sortRenderableItems(items.filter(matchesKind));
        state.currentItems = visibleItems;
        if (workspace) {
            workspace.classList.toggle("is-folder-scroll", state.folderId != null);
            workspace.classList.toggle("is-root-paged", shouldPaginateRoot());
        }
        if (!visibleItems.length) {
            grid.innerHTML = state.view === "list" ? '<div class="ld-table-head" role="row"><span>Название</span><span>Почему предложено</span><span>Владелец</span><span>Папка</span><span></span></div>' : "";
            empty.classList.remove("is-hidden");
            renderPager(0);
            updateDriveStats(0);
            clearSelection();
            syncSectionUi();
            return;
        }
        empty.classList.add("is-hidden");
        grid.className = "ld-files view-" + state.view;
        var visiblePageItems = pageItems(visibleItems);
        var includeUploadCard = (state.folderId != null || !shouldPaginateRoot()) && state.view !== "list";
        var tableHead =
            state.view === "list"
                ? '<div class="ld-table-head" role="row">' +
                  "<span>Название</span><span>Почему предложено</span><span>Владелец</span><span>Папка</span><span></span>" +
                  "</div>"
                : "";
        grid.innerHTML =
            tableHead +
            visiblePageItems
            .map(function (it, idx) {
                const selected = state.selected && state.selected.type === it.type && String(state.selected.id) === String(it.id);
                return renderFileRow(it, idx, selected);
            })
            .join("") +
            (includeUploadCard ?
            '<article class="ld-file ld-file--upload" data-static="upload" style="--i:' +
            visiblePageItems.length +
            '">' +
            '<div class="ld-file__icon has-asset"><img class="ld-file__asset" src="/assets/cloud/drive-icon-upload.png" alt="" loading="lazy"><i class="fas fa-cloud-arrow-up"></i></div>' +
            '<div class="ld-file__body"><div class="ld-file__name">Загрузить файлы</div>' +
            '<div class="ld-file__meta">Перетащите файлы сюда</div></div></article>' : "");

        grid.querySelectorAll(".ld-file").forEach(bindFileEvents);
        enhanceIcons(grid);
        renderPager(visibleItems.length);
        updateDriveStats(visibleItems.length);
        restoreSelectionIfPossible();
        syncSectionUi();
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function loadBrowse() {
        syncSectionUi();
        if (state.section === "settings") {
            clearSelection();
            var loadingEl = $("driveLoading");
            var emptyEl = $("driveEmpty");
            var pagerEl = $("drivePager");
            if (loadingEl) loadingEl.classList.add("is-hidden");
            if (emptyEl) emptyEl.classList.add("is-hidden");
            if (pagerEl) pagerEl.classList.add("is-hidden");
            loadBillingStatus();
            loadProfileAccount();
            return;
        }
        $("driveLoading").classList.remove("is-hidden");
        $("driveEmpty").classList.add("is-hidden");
        const q = ($("driveSearch").value || "").trim();
        if (isDemoMode()) {
            setTimeout(function () {
                const data = demoBrowse();
                if (q) {
                    const needle = q.toLowerCase();
                    data.folders = data.folders.filter(function (x) { return x.name.toLowerCase().indexOf(needle) >= 0; });
                    data.files = data.files.filter(function (x) { return x.original_filename.toLowerCase().indexOf(needle) >= 0; });
                }
                renderBreadcrumbs(data.breadcrumbs);
                renderGrid(data);
                updateStorage(data.storage_used_mb, data.storage_limit_mb);
            }, 180);
            return;
        }
        let url = "/drive/browse?";
        if (state.folderId != null) url += "folder_id=" + state.folderId + "&";
        if (q) url += "q=" + encodeURIComponent(q);
        api.get(url)
            .then(function (data) {
                renderBreadcrumbs(data.breadcrumbs || []);
                renderGrid(data);
                updateStorage(data.storage_used_mb || 0, data.storage_limit_mb || 5120);
            })
            .catch(function (err) {
                $("driveLoading").innerHTML =
                    '<p style="color:#ef4444">' + escapeHtml(err.message || "Ошибка") + "</p>";
            });
    }

    function loadConfig() {
        if (isDemoMode()) {
            return Promise.resolve({ cloud_free_gb: 5, max_file_mb: 1024 });
        }
        return api.get("/drive/config").then(function (cfg) {
            state.config = cfg;
            return cfg;
        });
    }

    var DOWNLOAD_NATIVE_MIN_BYTES = 128 * 1024 * 1024;

    function findDriveFileById(fileId) {
        var data = state.lastBrowseData;
        if (!data || !data.files) return null;
        var id = Number(fileId);
        for (var i = 0; i < data.files.length; i++) {
            if (Number(data.files[i].id) === id) return data.files[i];
        }
        return null;
    }

    function parseContentDispositionFilename(disp) {
        if (!disp) return "";
        var m = /filename\*=UTF-8''([^;]+)/i.exec(disp);
        if (m) {
            try {
                return decodeURIComponent(m[1].trim());
            } catch (e) {
                return m[1].trim();
            }
        }
        m = /filename="([^"]+)"/i.exec(disp);
        if (m) return m[1];
        m = /filename=([^;]+)/i.exec(disp);
        return m ? m[1].replace(/['"]/g, "").trim() : "";
    }

    function saveDownloadBlob(blob, fileName) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fileName || "file";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () {
            URL.revokeObjectURL(a.href);
        }, 60000);
    }

    function triggerNativeDownload(fileId, token, fileName) {
        var url = "/api/drive/files/" + encodeURIComponent(String(fileId)) + "/download";
        if (token) {
            url += "?token=" + encodeURIComponent(token);
        }
        var a = document.createElement("a");
        a.href = url;
        a.rel = "noopener";
        if (fileName) a.setAttribute("download", fileName);
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast(fileName ? "Скачивание: " + fileName : "Скачивание началось");
    }

    function addDownloadJob(fileName, totalBytes) {
        showUploadsPanel();
        var li = document.createElement("li");
        li.className = "ld-up-item ld-up-item--download";
        li.dataset.job = "dl-" + String(Date.now()) + Math.random();
        li.dataset.total = String(totalBytes || 0);
        li.innerHTML =
            '<div class="ld-up-item__icon"><i class="fas fa-download"></i></div>' +
            '<div class="ld-up-item__body">' +
            '<div class="ld-up-item__top">' +
            '<span class="ld-up-item__name" title="' +
            escapeHtml(fileName) +
            '">' +
            escapeHtml(fileName) +
            "</span>" +
            '<span class="ld-up-item__pct">0%</span>' +
            "</div>" +
            '<div class="ld-up-item__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
            "<span></span></div>" +
            '<p class="ld-up-item__sub">Подключение…</p>' +
            "</div>";
        $("uploadsList").appendChild(li);
        li.classList.add("is-active");
        setUploadProgressState(li, { lastTime: Date.now(), lastLoaded: 0, speed: 0, started: Date.now() });
        enhanceIcons(li);
        updateUploadsCount();
        return li;
    }

    function downloadFileWithProgress(fileId, token, fileName, totalBytes) {
        var li = addDownloadJob(fileName, totalBytes);
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "/api/drive/files/" + encodeURIComponent(String(fileId)) + "/download");
        if (token) xhr.setRequestHeader("Authorization", "Bearer " + token);
        xhr.withCredentials = true;
        xhr.responseType = "blob";
        xhr.timeout = 0;

        setJobProgress(li, { phase: "connect", mode: "download", pct: 0, loaded: 0, total: totalBytes });

        var lastProgressAt = 0;
        xhr.onprogress = function (e) {
            var now = Date.now();
            var total = e.lengthComputable ? e.total : totalBytes;
            if (total > 0) li.dataset.total = String(total);
            if (!e.loaded && !total) return;
            if (now - lastProgressAt < 50 && e.loaded < total) return;
            lastProgressAt = now;
            var pct = total > 0 ? Math.min(100, Math.round((e.loaded / total) * 100)) : 0;
            setJobProgress(li, {
                phase: "download",
                mode: "download",
                loaded: e.loaded,
                total: total || totalBytes,
                pct: pct,
            });
        };

        xhr.onload = function () {
            if (xhr.status < 200 || xhr.status >= 300) {
                li.classList.add("is-error");
                var subErr = li.querySelector(".ld-up-item__sub");
                if (subErr) subErr.textContent = "Ошибка скачивания";
                alert("Не удалось скачать");
                return;
            }
            var name =
                parseContentDispositionFilename(xhr.getResponseHeader("Content-Disposition")) || fileName || "file";
            var blob = xhr.response;
            var size = blob && blob.size ? blob.size : totalBytes;
            setJobProgress(li, { phase: "download", mode: "download", loaded: size, total: size, pct: 100 });
            li.classList.add("is-done");
            saveDownloadBlob(blob, name);
            updateUploadsCount();
        };

        xhr.onerror = function () {
            li.classList.add("is-error");
            var subErr = li.querySelector(".ld-up-item__sub");
            if (subErr) subErr.textContent = "Сеть недоступна";
            alert("Ошибка скачивания");
        };

        xhr.send();
    }

    function downloadFile(fileId) {
        if (isDemoMode()) {
            showToast("Демо: скачивание запущено");
            return;
        }
        var meta = findDriveFileById(fileId);
        var fileName = (meta && meta.original_filename) || "file";
        var totalBytes =
            meta && meta.file_size_mb != null ? Math.round(Number(meta.file_size_mb) * 1024 * 1024) : 0;
        var token = localStorage.getItem("authToken") || localStorage.getItem("token");
        if (totalBytes >= DOWNLOAD_NATIVE_MIN_BYTES) {
            triggerNativeDownload(fileId, token, fileName);
            return;
        }
        downloadFileWithProgress(fileId, token, fileName, totalBytes);
    }

    function hideContextMenu() {
        var ctx = $("driveCtx");
        if (ctx) {
            ctx.classList.add("is-hidden");
            ctx.setAttribute("aria-hidden", "true");
        }
        state.ctxTarget = null;
    }

    function showToast(message) {
        var toast = $("ldToast");
        if (!toast) return;
        toast.textContent = message;
        toast.classList.remove("is-hidden");
        clearTimeout(state.toastTimer);
        state.toastTimer = setTimeout(function () {
            toast.classList.add("is-hidden");
        }, 2200);
    }

    function getDemoTarget(target) {
        var store = ensureDemoStore();
        var list = target.type === "folder" ? store.folders : store.files;
        return list.find(function (x) { return String(x.id) === String(target.id); });
    }

    function copyShareLink(target) {
        var link = location.origin + "/app/?demo=1&share=" + encodeURIComponent(itemKey(target.type, target.id));
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link).catch(function () {});
        }
        showToast("Ссылка скопирована");
    }

    function renameTarget(target) {
        var current = target.name || "";
        openNameModal({
            title: "Переименовать",
            label: "Новое название",
            value: current,
            apply: "Сохранить",
        }, function (name) {
            if (isDemoMode()) {
                var item = getDemoTarget(target);
                if (!item) return;
                if (target.type === "folder") item.name = name;
                else item.original_filename = name;
                item.updated_at = new Date().toISOString();
                item.uploaded_at = item.uploaded_at || item.updated_at;
                showToast("Название обновлено");
                loadBrowse();
                return;
            }
            if (target.type === "folder") {
                api.patch("/drive/folders/" + target.id, { name: name }).then(loadBrowse);
            } else {
                api.patch("/drive/files/" + target.id, { original_filename: name }).then(loadBrowse);
            }
        });
    }

    function toggleFavoriteTarget(target) {
        if (!isDemoMode()) {
            showToast("Избранное будет подключено к API");
            return;
        }
        var item = getDemoTarget(target);
        if (!item) return;
        item.favorite = !item.favorite;
        item.updated_at = new Date().toISOString();
        showToast(item.favorite ? "Добавлено в избранное" : "Убрано из избранного");
        loadBrowse();
    }

    function deleteTarget(target) {
        if (isDemoMode()) {
            var item = getDemoTarget(target);
            if (!item) return;
            if (state.section === "trash") {
                var store = ensureDemoStore();
                var list = target.type === "folder" ? store.folders : store.files;
                var idx = list.indexOf(item);
                if (idx >= 0) list.splice(idx, 1);
                showToast("Удалено окончательно");
            } else {
                item.deleted = true;
                item.updated_at = new Date().toISOString();
                showToast("Перемещено в корзину");
            }
            clearSelection();
            loadBrowse();
            return;
        }
        if (!confirm('Удалить «' + target.name + '»?')) return;
        if (target.type === "folder") {
            api.delete("/drive/folders/" + target.id).then(loadBrowse).catch(function (e) {
                alert(e.message || "Ошибка");
            });
        } else {
            api.delete("/drive/files/" + target.id).then(loadBrowse);
        }
    }

    function runItemAction(action, target) {
        if (!target) return;
        if (action === "open") {
            if (target.type === "folder") {
                state.folderId = target.id;
                state.section = "drive";
                state.page = 1;
                syncSectionUi();
                clearSelection();
                resetWorkspaceScroll();
                loadBrowse();
            } else downloadFile(target.id);
        } else if (action === "download") {
            if (target.type === "folder") showToast("Папку можно скачать архивом после подключения API");
            else downloadFile(target.id);
        } else if (action === "share") {
            copyShareLink(target);
        } else if (action === "favorite") {
            toggleFavoriteTarget(target);
        } else if (action === "rename") {
            renameTarget(target);
        } else if (action === "delete") {
            deleteTarget(target);
        } else if (action === "close") {
            clearSelection();
        }
    }

    function openContextMenu(type, id, name, ev) {
        var ctx = $("driveCtx");
        if (!ctx) return;
        state.ctxTarget = { type: type, id: id, name: name };
        var isFolder = type === "folder";
        ctx.innerHTML =
            '<button type="button" data-action="open"><i class="fas fa-' +
            (isFolder ? "folder-open" : "download") +
            '"></i> ' +
            (isFolder ? "Открыть" : "Скачать") +
            "</button>" +
            '<button type="button" data-action="share"><i class="fas fa-link"></i> Скопировать ссылку</button>' +
            '<button type="button" data-action="favorite"><i class="fas fa-star"></i> В избранное</button>' +
            '<button type="button" data-action="rename"><i class="fas fa-pen"></i> Переименовать</button>' +
            '<hr><button type="button" data-action="delete" class="is-danger"><i class="fas fa-trash"></i> Удалить</button>';

        ctx.querySelectorAll("button").forEach(function (btn) {
            btn.addEventListener("click", function () {
                runCtxAction(btn.dataset.action);
            });
        });
        enhanceIcons(ctx);

        ctx.classList.remove("is-hidden");
        ctx.setAttribute("aria-hidden", "false");
        var x = ev.clientX;
        var y = ev.clientY;
        ctx.style.left = Math.min(x, window.innerWidth - 220) + "px";
        ctx.style.top = Math.min(y, window.innerHeight - 160) + "px";
    }

    function runCtxAction(action) {
        var t = state.ctxTarget;
        hideContextMenu();
        runItemAction(action, t);
    }

    function closeNameModal() {
        var modal = $("nameModal");
        if (!modal) return;
        modal.classList.add("is-hidden");
        modal.setAttribute("aria-hidden", "true");
        state.nameModalApply = null;
    }

    function openNameModal(options, onApply) {
        var modal = $("nameModal");
        var input = $("nameModalInput");
        if (!modal || !input) {
            var fallback = prompt(options.label || "Название", options.value || "");
            if (fallback && onApply) onApply(fallback.trim());
            return;
        }
        $("nameModalTitle").textContent = options.title || "Название";
        $("nameModalLabel").textContent = options.label || "Название";
        $("nameModalApply").textContent = options.apply || "Готово";
        input.value = options.value || "";
        state.nameModalApply = function () {
            var value = input.value.trim();
            if (!value) {
                input.focus();
                return;
            }
            closeNameModal();
            if (onApply) onApply(value);
        };
        modal.classList.remove("is-hidden");
        modal.setAttribute("aria-hidden", "false");
        setTimeout(function () {
            input.focus();
            input.select();
        }, 30);
    }

    function closeCreateMenu() {
        var menu = $("createMenu");
        var btn = $("btnCreateMain");
        if (menu) menu.classList.add("is-hidden");
        if (btn) btn.setAttribute("aria-expanded", "false");
    }

    function syncViewUi() {
        document.querySelectorAll(".ld-seg button[data-view]").forEach(function (btn) {
            btn.classList.toggle("is-active", btn.dataset.view === state.view);
        });
    }

    function createDocument() {
        closeCreateMenu();
        openNameModal(
            {
                title: "Новый документ",
                label: "Имя файла",
                value: "Новый документ.docx",
                apply: "Создать",
            },
            function (name) {
                if (!/\./.test(name)) name += ".docx";
                if (isDemoMode()) {
                    var store = ensureDemoStore();
                    store.files.push({
                        id: store.nextFileId++,
                        parent_id: state.section === "drive" ? state.folderId : null,
                        original_filename: name,
                        file_size_mb: 0.1,
                        uploaded_at: new Date().toISOString(),
                        favorite: false,
                        shared: false,
                        owner: userDisplayName(state.user),
                        activity: "Создан только что",
                    });
                    showToast("Документ создан");
                    loadBrowse();
                    return;
                }
                showToast("Создание документов будет доступно после подключения API");
            }
        );
    }

    function createShareLink() {
        closeCreateMenu();
        openNameModal(
            {
                title: "Общая ссылка",
                label: "Название для ссылки",
                value: state.folderId ? "Ссылка на папку" : "Ссылка на диск",
                apply: "Создать",
            },
            function (name) {
                var shareKey =
                    state.folderId != null
                        ? itemKey("folder", state.folderId)
                        : "drive:root";
                var link =
                    location.origin +
                    "/app/" +
                    (isDemoMode() ? "?demo=1&" : "?") +
                    "share=" +
                    encodeURIComponent(shareKey);
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(link).catch(function () {});
                }
                if (isDemoMode()) {
                    var store = ensureDemoStore();
                    store.files.push({
                        id: store.nextFileId++,
                        parent_id: state.section === "drive" ? state.folderId : null,
                        original_filename: name + ".link",
                        file_size_mb: 0,
                        uploaded_at: new Date().toISOString(),
                        favorite: false,
                        shared: true,
                        owner: userDisplayName(state.user),
                        activity: "Ссылка создана · только что",
                    });
                    loadBrowse();
                }
                showToast("Ссылка скопирована в буфер");
            }
        );
    }

    function uploadToCurrentFolder() {
        closeCreateMenu();
        if (state.section !== "drive") {
            showToast("Загрузка доступна в разделе «Мой диск»");
            return;
        }
        if (state.folderId == null) {
            showToast("Сначала откройте папку для загрузки");
            return;
        }
        $("fileInput").click();
    }

    function createFolder() {
        closeCreateMenu();
        if (isDemoMode()) {
            openNameModal({
                title: "Новая папка",
                label: "Название папки",
                value: "Новая папка",
                apply: "Создать",
            }, function (name) {
                var store = ensureDemoStore();
                store.folders.push({
                    id: store.nextFolderId++,
                    parent_id: state.section === "drive" ? state.folderId : null,
                    name: name,
                    updated_at: new Date().toISOString(),
                    favorite: false,
                    shared: false,
                    owner: "Алексей П.",
                    activity: "Создана только что",
                });
                showToast("Папка создана");
                loadBrowse();
            });
            return;
        }
        openNameModal({
            title: "Новая папка",
            label: "Название папки",
            value: "Новая папка",
            apply: "Создать",
        }, function (name) {
            api.post("/drive/folders", { name: name, parent_id: state.folderId })
                .then(loadBrowse)
                .catch(function (e) {
                    alert(e.message || "Ошибка");
                });
            });
    }

    function showUploadsPanel() {
        var dock = $("uploadsPanel");
        if (dock) dock.classList.remove("is-collapsed");
        setUploadsUiVisible(true);
    }

    function addUploadJob(file) {
        showUploadsPanel();
        const li = document.createElement("li");
        const total = file.size || 0;
        li.className = "ld-up-item";
        li.dataset.job = String(Date.now()) + Math.random();
        li.dataset.total = String(total);
        li.innerHTML =
            '<div class="ld-up-item__icon"><i class="fas fa-file"></i></div>' +
            '<div class="ld-up-item__body">' +
            '<div class="ld-up-item__top">' +
            '<span class="ld-up-item__name" title="' +
            escapeHtml(file.name) +
            '">' +
            escapeHtml(file.name) +
            "</span>" +
            '<span class="ld-up-item__pct">0%</span>' +
            "</div>" +
            '<div class="ld-up-item__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
            "<span></span></div>" +
            '<p class="ld-up-item__sub">Подготовка…</p>' +
            "</div>";
        $("uploadsList").appendChild(li);
        li.classList.add("is-active");
        if (uploadProgressState) {
            uploadProgressState.set(li, { lastTime: Date.now(), lastLoaded: 0, speed: 0 });
        } else {
            li._uploadProgress = { lastTime: Date.now(), lastLoaded: 0, speed: 0 };
        }
        enhanceIcons(li);
        updateUploadsCount();
        return li;
    }

    function getUploadProgressState(li) {
        if (!li) return null;
        if (uploadProgressState) return uploadProgressState.get(li);
        return li._uploadProgress || null;
    }

    function setUploadProgressState(li, st) {
        if (!li || !st) return;
        if (uploadProgressState) uploadProgressState.set(li, st);
        else li._uploadProgress = st;
    }

    function applyJobProgress(li, progress) {
        if (!li) return;
        var phase = typeof progress === "object" && progress != null ? progress.phase : null;
        var mode = typeof progress === "object" && progress != null ? progress.mode : null;
        var total = typeof progress === "object" && progress != null && progress.total != null
            ? progress.total
            : parseInt(li.dataset.total, 10) || 0;
        var loaded =
            typeof progress === "object" && progress != null && progress.loaded != null
                ? progress.loaded
                : null;
        var pct = typeof progress === "number" ? progress : progress.pct || 0;
        if (loaded != null && total > 0) {
            pct = Math.min(100, Math.round((loaded / total) * 100));
        }
        var now = Date.now();
        var st = getUploadProgressState(li) || {
            lastTime: now,
            lastLoaded: 0,
            speed: 0,
            started: now,
        };
        if (loaded != null && loaded >= st.lastLoaded) {
            var dt = (now - st.lastTime) / 1000;
            if (dt >= 0.05) {
                var instant = (loaded - st.lastLoaded) / dt;
                if (instant >= 0 && instant < 150 * 1024 * 1024) {
                    st.speed = st.speed ? st.speed * 0.7 + instant * 0.3 : instant;
                }
                st.lastTime = now;
                st.lastLoaded = loaded;
            }
            var elapsed = (now - (st.started || now)) / 1000;
            if (elapsed > 0.25 && loaded > 0) {
                var avg = loaded / elapsed;
                st.speed = st.speed ? st.speed * 0.85 + avg * 0.15 : avg;
            }
        }
        setUploadProgressState(li, st);
        var loadedBytes = loaded != null ? loaded : Math.round((pct / 100) * total);
        var bar = li.querySelector(".ld-up-item__bar span");
        var barWrap = li.querySelector(".ld-up-item__bar");
        var pctEl = li.querySelector(".ld-up-item__pct");
        var subEl = li.querySelector(".ld-up-item__sub");

        li.classList.toggle("is-active", pct > 0 && pct < 100);
        li.classList.toggle("is-init", phase === "init" && pct < 1);
        li.classList.toggle("is-uploading", loadedBytes > 0 && pct < 100);
        li.classList.toggle("is-done", pct >= 100);

        if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
        if (barWrap) barWrap.setAttribute("aria-valuenow", String(pct));
        if (pctEl) pctEl.textContent = pct + "%";
        if (subEl) {
            if (pct >= 100) subEl.textContent = formatBytes(total) + " — готово";
            else subEl.textContent = formatUploadSubline(loadedBytes, total, st.speed, phase, mode);
        }
    }

    function flushJobProgress() {
        uploadProgressRaf = 0;
        if (!uploadProgressPending) return;
        var job = uploadProgressPending;
        uploadProgressPending = null;
        applyJobProgress(job.li, job.progress);
    }

    function setJobProgress(li, progress) {
        if (!li) return;
        uploadProgressPending = { li: li, progress: progress };
        if (!uploadProgressRaf) {
            uploadProgressRaf = requestAnimationFrame(flushJobProgress);
        }
    }

    function handleFiles(fileList) {
        if (!fileList || !fileList.length) return;
        if (isDemoMode()) {
            var store = ensureDemoStore();
            Array.from(fileList).forEach(function (file, index) {
                var li = addUploadJob(file);
                var pct = 0;
                var total = file.size || 1200000;
                var timer = setInterval(function () {
                    pct = Math.min(100, pct + 14 + Math.round(Math.random() * 12));
                    setJobProgress(li, {
                        pct: pct,
                        loaded: Math.round((pct / 100) * total),
                        total: total,
                    });
                    if (pct >= 100) {
                        clearInterval(timer);
                        li.classList.add("is-done");
                        store.files.push({
                            id: store.nextFileId++,
                            parent_id: state.section === "drive" ? state.folderId : null,
                            original_filename: file.name,
                            file_size_mb: Math.max(0.01, (file.size || 1400000) / 1024 / 1024),
                            uploaded_at: new Date().toISOString(),
                            favorite: false,
                            shared: false,
                            owner: "Алексей П.",
                            activity: "Загружен только что",
                        });
                        if (index === Array.from(fileList).length - 1) {
                            showToast("Файлы добавлены в облако");
                            loadBrowse();
                        }
                    }
                }, 190 + index * 40);
            });
            return;
        }
        loadConfig().then(function (cfg) {
            LblDriveUpload.uploadMany(fileList, {
                folderId: state.folderId,
                simpleUploadMaxMb: cfg.simple_upload_max_mb || 64,
                chunkSizeMb: cfg.chunk_mb || 16,
                chunkConcurrency: cfg.parallel_uploads || 5,
                parallelFiles: Math.min(cfg.parallel_files || 3, 4),
                onJobStart: function (file) {
                    return addUploadJob(file);
                },
                onJobProgress: function (li, progress) {
                    setJobProgress(li, progress);
                },
                onJobDone: function (li, err) {
                    if (err) {
                        li.classList.add("is-error");
                        var subEl = li.querySelector(".ld-up-item__sub");
                        if (subEl) subEl.textContent = "Ошибка загрузки";
                    } else {
                        li.classList.add("is-done");
                        setJobProgress(li, {
                            pct: 100,
                            loaded: parseInt(li.dataset.total, 10) || 0,
                            total: parseInt(li.dataset.total, 10) || 0,
                        });
                    }
                },
            }).then(function () {
                loadBrowse();
            });
        });
    }

    function initTheme() {
        var triggers = ["themeToggle", "settingsThemeBtn", "settingsThemeBtnTop", "quickTheme"].map($).filter(Boolean);
        if (!triggers.length) return;

        function syncIcon() {
            var dark = document.documentElement.getAttribute("data-theme") === "dark";
            var icon = dark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
            triggers.forEach(function (btn) {
                btn.innerHTML = icon;
                enhanceIcons(btn);
            });
        }

        function toggleTheme() {
            var dark = document.documentElement.getAttribute("data-theme") === "dark";
            if (dark) {
                document.documentElement.removeAttribute("data-theme");
                localStorage.setItem("theme", "light");
            } else {
                document.documentElement.setAttribute("data-theme", "dark");
                localStorage.setItem("theme", "dark");
            }
            syncIcon();
        }

        syncIcon();
        triggers.forEach(function (btn) {
            if (btn.dataset.themeReady === "1") return;
            btn.dataset.themeReady = "1";
            btn.addEventListener("click", toggleTheme);
        });
    }

    function syncSortUi() {
        var label = $("sortLabel");
        var menu = $("sortMenu");
        if (label) label.textContent = SORT_LABELS[state.sort] || SORT_LABELS["date-desc"];
        if (menu) {
            menu.querySelectorAll("[data-sort]").forEach(function (btn) {
                btn.classList.toggle("is-active", btn.dataset.sort === state.sort);
            });
        }
    }

    function closeSortMenu() {
        var menu = $("sortMenu");
        var btn = $("sortBtn");
        if (menu) {
            menu.classList.add("is-hidden");
            menu.setAttribute("aria-hidden", "true");
        }
        if (btn) btn.setAttribute("aria-expanded", "false");
    }

    function resetWorkspaceScroll() {
        var body = $("driveContent");
        if (body) body.scrollTop = 0;
        var main = document.querySelector(".ld-panel--main");
        if (main && window.matchMedia && window.matchMedia("(max-width: 768px)").matches) {
            setTimeout(function () {
                main.scrollIntoView({ block: "start", behavior: "auto" });
            }, 0);
            return;
        }
        try {
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        } catch (e) {
            window.scrollTo(0, 0);
        }
    }

    function syncSectionUi() {
        document.querySelectorAll(".ld-topbar__links [data-section]").forEach(function (b) {
            b.classList.toggle("is-active", b.dataset.section === state.section);
        });
        document.querySelectorAll(".ld-nav__item[data-section]").forEach(function (b) {
            b.classList.toggle("is-active", b.dataset.section === state.section);
        });
        var workspace = document.querySelector(".ld-workspace");
        var shell = $("driveShell");
        var profile = $("driveSettings");
        var filesBlock = $("driveFilesBlock");
        var isProfile = state.section === "settings";
        if (workspace) workspace.classList.toggle("is-profile-mode", isProfile);
        if (shell) shell.classList.toggle("is-profile-mode", isProfile);
        if (profile) profile.classList.toggle("is-hidden", !isProfile);
        if (filesBlock) filesBlock.classList.toggle("is-hidden", isProfile);
        if (isProfile) {
            var root = $("breadcrumbs");
            if (root) root.innerHTML = "";
            loadBillingStatus();
            loadProfileAccount();
        }

        var welcomeTitle = $("driveWelcomeTitle");
        var welcomeSub = $("driveWelcomeSub");
        var filesHeading = $("driveFilesHeading");
        var sectionLabel = SECTION_LABELS[state.section] || "Мой диск";

        if (welcomeTitle) {
            if (isProfile) {
                welcomeTitle.textContent = "Аккаунт LBL Cloud";
            } else if (state.section === "drive" && state.folderId == null) {
                welcomeTitle.textContent = "Добро пожаловать в LBL Cloud";
            } else {
                welcomeTitle.textContent = sectionLabel;
            }
        }
        if (welcomeSub) {
            if (isProfile) {
                welcomeSub.textContent = "Тариф, безопасность и настройки единого входа";
            } else if (state.section === "drive") {
                welcomeSub.textContent = "Файлы, папки и общий доступ в одном рабочем пространстве";
            } else {
                welcomeSub.textContent = "Раздел «" + sectionLabel + "»";
            }
        }
        if (filesHeading) {
            filesHeading.textContent =
                state.section === "drive" && state.folderId == null ? "Рекомендуемые файлы" : sectionLabel;
        }
    }

    function initUploadUi() {
        function openFilePicker() {
            closeCreateMenu();
            $("fileInput").click();
        }

        ["btnUpload", "btnUploadSide", "btnUploadEmpty", "btnUploadTop", "btnUploadWelcome"].forEach(function (id) {
            var el = $(id);
            if (el) el.addEventListener("click", openFilePicker);
        });

        ["btnNewFolder", "btnNewFolderSide", "btnNewFolderEmpty", "btnNewFolderWelcome"].forEach(function (id) {
            var el = $(id);
            if (el) el.addEventListener("click", createFolder);
        });

        var createDoc = $("btnCreateDoc");
        if (createDoc) createDoc.addEventListener("click", createDocument);
        var createLink = $("btnCreateLink");
        if (createLink) createLink.addEventListener("click", createShareLink);
        var folderUpload = $("btnCreateFolderUpload");
        if (folderUpload) folderUpload.addEventListener("click", uploadToCurrentFolder);

        syncViewUi();

        var createBtn = $("btnCreateMain");
        var createMenu = $("createMenu");
        if (createBtn && createMenu) {
            createBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                var open = createMenu.classList.contains("is-hidden");
                createMenu.classList.toggle("is-hidden", !open);
                createBtn.setAttribute("aria-expanded", open ? "true" : "false");
            });
            document.addEventListener("click", function (e) {
                if (!e.target.closest(".ld-create")) {
                    createMenu.classList.add("is-hidden");
                    createBtn.setAttribute("aria-expanded", "false");
                }
            });
        }

        var sidebarToggle = $("sidebarToggle");
        if (sidebarToggle) {
            sidebarToggle.addEventListener("click", function () {
                document.body.classList.toggle("is-sidebar-open");
            });
        }

        var quickUploads = $("quickUploads");
        var fab = $("uploadsFab");
        if (quickUploads && fab) {
            quickUploads.addEventListener("click", function () {
                fab.click();
            });
        }
        var quickTheme = $("quickTheme");
        var themeBtn = $("themeToggle");
        if (quickTheme && themeBtn) {
            quickTheme.addEventListener("click", function () {
                themeBtn.click();
            });
        }

        $("fileInput").addEventListener("change", function (e) {
            handleFiles(e.target.files);
            e.target.value = "";
        });

        function queueSearchLoad(source) {
            var mainSearch = $("driveSearch");
            var topSearch = $("driveSearchTop");
            if (source === topSearch && mainSearch) mainSearch.value = topSearch.value;
            if (source === mainSearch && topSearch) topSearch.value = mainSearch.value;
            state.page = 1;
            clearTimeout(state.searchTimer);
            state.searchTimer = setTimeout(loadBrowse, 350);
        }

        [$("driveSearch"), $("driveSearchTop")].forEach(function (el) {
            if (el) el.addEventListener("input", function () { queueSearchLoad(el); });
        });

        document.querySelectorAll(".ld-seg button[data-view]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                state.view = btn.dataset.view === "list" ? "list" : "grid";
                localStorage.setItem(VIEW_STORAGE_KEY, state.view);
                syncViewUi();
                state.page = 1;
                loadBrowse();
            });
        });

        var sortBtn = $("sortBtn");
        var sortMenu = $("sortMenu");
        if (sortBtn && sortMenu) {
            syncSortUi();
            sortBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                var open = sortMenu.classList.contains("is-hidden");
                sortMenu.classList.toggle("is-hidden", !open);
                sortMenu.setAttribute("aria-hidden", open ? "false" : "true");
                sortBtn.setAttribute("aria-expanded", open ? "true" : "false");
            });
            sortMenu.querySelectorAll("[data-sort]").forEach(function (btn) {
                btn.addEventListener("click", function () {
                    state.sort = btn.dataset.sort || "date-desc";
                    state.page = 1;
                    syncSortUi();
                    closeSortMenu();
                    loadBrowse();
                });
            });
        }

        document.querySelectorAll(".ld-filter-row button[data-kind]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                document.querySelectorAll(".ld-filter-row button[data-kind]").forEach(function (b) {
                    b.classList.remove("is-active");
                });
                btn.classList.add("is-active");
                state.kind = btn.dataset.kind || "all";
                state.page = 1;
                loadBrowse();
            });
        });

        document.querySelectorAll("[data-selection-action]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var action = btn.dataset.selectionAction;
                var target = state.selected ? findCurrentItem(state.selected.type, state.selected.id) : null;
                runItemAction(action, target);
            });
        });

        var inspectorClose = $("inspectorClose");
        if (inspectorClose) inspectorClose.addEventListener("click", clearSelection);

        ["nameModalClose", "nameModalCancel"].forEach(function (id) {
            var el = $(id);
            if (el) el.addEventListener("click", closeNameModal);
        });
        var nameApply = $("nameModalApply");
        if (nameApply) nameApply.addEventListener("click", function () {
            if (state.nameModalApply) state.nameModalApply();
        });
        var nameInput = $("nameModalInput");
        if (nameInput) nameInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter" && state.nameModalApply) state.nameModalApply();
            if (e.key === "Escape") closeNameModal();
        });

        document.querySelectorAll(".ld-nav__item[data-section]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                document.querySelectorAll(".ld-nav__item[data-section]").forEach(function (b) {
                    b.classList.remove("is-active");
                });
                document.querySelectorAll(".ld-topbar__links [data-section]").forEach(function (b) {
                    b.classList.toggle("is-active", b.dataset.section === btn.dataset.section);
                });
                btn.classList.add("is-active");
                state.section = btn.dataset.section || "drive";
                state.folderId = null;
                state.page = 1;
                clearSelection();
                resetWorkspaceScroll();
                loadBrowse();
            });
        });

        document
            .querySelectorAll(
                ".ld-topbar__links [data-section], .ld-profile-chip[data-section], #linkProfile[data-section], [data-section-jump]"
            )
            .forEach(function (link) {
            link.addEventListener("click", function (e) {
                e.preventDefault();
                state.section = link.dataset.section || link.dataset.sectionJump || "drive";
                document.querySelectorAll(".ld-topbar__links [data-section]").forEach(function (b) {
                    b.classList.toggle("is-active", b.dataset.section === state.section);
                });
                document.querySelectorAll(".ld-nav__item[data-section]").forEach(function (b) {
                    b.classList.toggle("is-active", b.dataset.section === state.section);
                });
                state.folderId = null;
                state.page = 1;
                clearSelection();
                resetWorkspaceScroll();
                loadBrowse();
            });
        });

        $("uploadsClose").addEventListener("click", function () {
            var dock = $("uploadsPanel");
            var list = $("uploadsList");
            if (dock) {
                dock.classList.add("is-hidden");
                dock.classList.remove("is-collapsed");
            }
            $("driveShell").classList.remove("is-uploading");
            if (list && list.children.length) {
                $("uploadsFab").classList.remove("is-hidden");
            } else {
                setUploadsUiVisible(false);
            }
            updateUploadsCount();
        });

        var fab = $("uploadsFab");
        if (fab) {
            fab.addEventListener("click", function () {
                $("uploadsPanel").classList.remove("is-collapsed");
                setUploadsUiVisible(true);
                fab.classList.add("is-hidden");
            });
        }

        document.addEventListener("click", function (e) {
            if (!$("driveCtx") || $("driveCtx").classList.contains("is-hidden")) return;
            if (!e.target.closest("#driveCtx")) hideContextMenu();
        });
        document.addEventListener("click", function (e) {
            if (sortMenu && !e.target.closest("#sortControl")) closeSortMenu();
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") hideContextMenu();
            if (e.key === "Escape") closeSortMenu();
        });

        var main = $("driveContent");
        var overlay = $("dropOverlay");
        ["dragenter", "dragover"].forEach(function (ev) {
            main.addEventListener(ev, function (e) {
                e.preventDefault();
                overlay.classList.remove("is-hidden");
            });
        });
        ["dragleave", "drop"].forEach(function (ev) {
            main.addEventListener(ev, function (e) {
                e.preventDefault();
                overlay.classList.add("is-hidden");
            });
        });
        main.addEventListener("drop", function (e) {
            if (e.dataTransfer.files && e.dataTransfer.files.length) {
                handleFiles(e.dataTransfer.files);
            }
        });
    }

    function initCloudHeaderAuth() {
        var hdr = $("hdr-right-auth");
        if (!hdr) return;
        function showAuthed(me) {
            var login = $("cloudLoginBtn");
            if (login) login.classList.add("is-hidden");
            applyUserHeader(me || {});
            initTheme();
        }
        if (isDemoMode()) {
            showAuthed({ first_name: "Алексей", last_name: "П." });
            return;
        }
        fetch("/api/me", { credentials: "include", headers: currentAuthHeaders() })
            .then(function (r) {
                if (r.ok) return r.json().then(showAuthed);
                if (hasLocalToken()) showAuthed();
                else initTheme();
            })
            .catch(function () {
                if (hasLocalToken()) showAuthed();
                else initTheme();
            });
    }

    function init() {
        if (isDemoMode()) document.body.classList.add("is-demo");
        enhanceIcons(document);
        initTheme();
        ensureSession().then(function (ok) {
            if (!ok) return;
            initCloudHeaderAuth();
            initProfileSecurity();
            initUploadUi();
            loadConfig().then(function (cfg) {
                var badge = $("freeQuotaBadge");
                var heroQuota = $("heroFreeQuota");
                if (badge && cfg && cfg.cloud_free_gb) {
                    badge.innerHTML =
                        '<i class="fas fa-gift"></i> ' + Math.round(cfg.cloud_free_gb) + " ГБ бесплатно";
                    enhanceIcons(badge);
                }
                if (heroQuota && cfg && cfg.cloud_free_gb) {
                    heroQuota.textContent = Math.round(cfg.cloud_free_gb) + " ГБ";
                }
                loadBillingStatus();
                loadBrowse();
            });
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
