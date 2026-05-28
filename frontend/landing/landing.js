(function () {
    "use strict";

    var LOGIN =
        "/pages/auth/login.html?return=" + encodeURIComponent("/app/");
    var REGISTER =
        "/pages/auth/register.html?return=" + encodeURIComponent("/app/");
    var APP = "/app/";

    function hasToken() {
        return Boolean(localStorage.getItem("authToken") || localStorage.getItem("token"));
    }

    function goCloud(event) {
        if (event) event.preventDefault();
        if (hasToken()) {
            window.location.href = APP;
            return;
        }
        if (event && event.currentTarget && event.currentTarget.hasAttribute("data-lc-register")) {
            window.location.href = REGISTER;
            return;
        }
        var href = event && event.currentTarget && event.currentTarget.getAttribute("href");
        if (href && href.indexOf("/pages/billing") === 0) {
            window.location.href = LOGIN.replace(
                encodeURIComponent("/app/"),
                encodeURIComponent("/pages/billing/")
            );
            return;
        }
        window.location.href = LOGIN;
    }

    document.querySelectorAll("[data-lc-cta], [data-lc-register]").forEach(function (element) {
        element.addEventListener("click", goCloud);
    });

    var header = document.getElementById("siteHeader");
    var progress = document.getElementById("scrollProgress");

    function updateScrollState() {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        var ratio = max > 0 ? window.scrollY / max : 0;
        if (header) header.classList.toggle("is-scrolled", window.scrollY > 12);
        if (progress) progress.style.width = Math.round(ratio * 100) + "%";
    }

    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });

    var menuToggle = document.getElementById("menuToggle");
    var siteNav = document.getElementById("siteNav");

    function closeMenu() {
        if (!menuToggle || !siteNav) return;
        menuToggle.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
        siteNav.classList.remove("is-open");
    }

    if (menuToggle && siteNav) {
        menuToggle.addEventListener("click", function () {
            var open = !siteNav.classList.contains("is-open");
            menuToggle.classList.toggle("is-open", open);
            menuToggle.setAttribute("aria-expanded", String(open));
            siteNav.classList.toggle("is-open", open);
        });

        siteNav.querySelectorAll("a").forEach(function (link) {
            link.addEventListener("click", closeMenu);
        });

        window.addEventListener("keydown", function (event) {
            if (event.key === "Escape") closeMenu();
        });
    }

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var revealItems = document.querySelectorAll(".reveal");

    if (reduced || !("IntersectionObserver" in window)) {
        revealItems.forEach(function (item) {
            item.classList.add("visible");
        });
    } else {
        var observer = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add("visible");
                    observer.unobserve(entry.target);
                });
            },
            { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
        );

        revealItems.forEach(function (item) {
            observer.observe(item);
        });
    }

    var speedValue = document.getElementById("speedValue");
    if (speedValue && !reduced) {
        var speeds = [116, 120, 128, 112, 120];
        var speedIndex = 0;
        window.setInterval(function () {
            speedIndex = (speedIndex + 1) % speeds.length;
            speedValue.textContent = speeds[speedIndex] + " МБ/с";
        }, 2300);
    }

    var heroVisual = document.getElementById("heroVisual");
    var heroWindow = document.getElementById("heroWindow");
    if (heroVisual && heroWindow && !reduced) {
        heroVisual.addEventListener("mousemove", function (event) {
            if (window.innerWidth < 1000) return;
            var rect = heroVisual.getBoundingClientRect();
            var x = (event.clientX - rect.left) / rect.width - 0.5;
            var y = (event.clientY - rect.top) / rect.height - 0.5;
            heroWindow.style.transform =
                "rotateY(" + x * 5 + "deg) rotateX(" + y * -4 + "deg) translateY(-2px)";
        });

        heroVisual.addEventListener("mouseleave", function () {
            heroWindow.style.transform = "";
        });
    }

    var billingButtons = document.querySelectorAll("[data-billing]");
    var prices = document.querySelectorAll("[data-price]");

    billingButtons.forEach(function (button) {
        button.addEventListener("click", function () {
            var billing = button.getAttribute("data-billing") || "month";
            billingButtons.forEach(function (item) {
                item.classList.toggle("active", item === button);
            });
            prices.forEach(function (price) {
                price.textContent = price.getAttribute(billing === "year" ? "data-year" : "data-month");
            });
        });
    });
})();
