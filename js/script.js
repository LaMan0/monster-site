/* ============================================
   MONSTER ENERGY — Site concept
   script.js
   (les canettes 3D sont gérées par js/cans3d.js)
   ============================================ */
(function () {
  "use strict";
  const body = document.body;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(pointer: fine)").matches;

  /* ---------- theme de fond selon le parfum visible ---------- */
  function setTheme(name) {
    body.dataset.theme = name;
    document.querySelectorAll(".bgstack > div").forEach((el) =>
      el.classList.toggle("active", el.id === "bg-" + name)
    );
  }

  const flavorSections = document.querySelectorAll(".flavor");
  const flavorObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          setTheme(e.target.dataset.theme);
          body.classList.add("in-flavors");
          updateDots(e.target.id);
        }
      });
    },
    { threshold: 0.45 }
  );
  flavorSections.forEach((s) => flavorObserver.observe(s));

  function backToBase(entries) {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        setTheme("base");
        body.classList.remove("in-flavors");
      }
    });
  }
  new IntersectionObserver(backToBase, { threshold: 0.2 })
    .observe(document.querySelector(".flavors-title"));
  ["blend", "comparatif", "faq", "contact"].forEach((id) => {
    new IntersectionObserver(backToBase, { threshold: 0.15 })
      .observe(document.getElementById(id));
  });

  /* ---------- pastilles de navigation des parfums ---------- */
  const dotsWrap = document.createElement("nav");
  dotsWrap.className = "dots";
  dotsWrap.setAttribute("aria-label", "Navigation parfums");
  flavorSections.forEach((s, i) => {
    const a = document.createElement("a");
    a.href = "#" + s.id;
    a.dataset.for = s.id;
    a.title = "Parfum " + (i + 1);
    a.setAttribute("aria-label", "Aller au parfum " + (i + 1));
    dotsWrap.appendChild(a);
  });
  body.appendChild(dotsWrap);
  function updateDots(id) {
    dotsWrap.querySelectorAll("a").forEach((a) =>
      a.classList.toggle("on", a.dataset.for === id)
    );
  }

  /* ---------- apparition au scroll ---------- */
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          revealObserver.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

  /* ---------- compteurs animes ---------- */
  const countObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        countObserver.unobserve(e.target);
        const target = +e.target.dataset.count;
        const dur = 1400;
        const t0 = performance.now();
        const pretty = (n) =>
          n >= 1000 ? n.toLocaleString("fr-FR") : n.toString();
        (function tick(t) {
          const p = Math.min((t - t0) / dur, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          e.target.textContent = pretty(Math.round(target * eased));
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
      });
    },
    { threshold: 0.6 }
  );
  document.querySelectorAll("[data-count]").forEach((el) =>
    countObserver.observe(el)
  );

  /* ---------- accordéon FAQ ---------- */
  document.querySelectorAll(".faq-item").forEach((item) => {
    const btn = item.querySelector(".faq-q");
    const panel = item.querySelector(".faq-a");
    btn.addEventListener("click", () => {
      const open = item.classList.toggle("open");
      btn.setAttribute("aria-expanded", open);
      panel.style.maxHeight = open ? panel.scrollHeight + "px" : "0px";
      document.querySelectorAll(".faq-item.open").forEach((other) => {
        if (other !== item) {
          other.classList.remove("open");
          other.querySelector(".faq-q").setAttribute("aria-expanded", "false");
          other.querySelector(".faq-a").style.maxHeight = "0px";
        }
      });
    });
  });

  /* ---------- newsletter ---------- */
  const form = document.getElementById("joinForm");
  const input = document.getElementById("joinMail");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) {
      form.classList.add("nok");
      input.placeholder = "FORMAT MAIL INVALIDE";
      input.value = "";
      setTimeout(() => {
        form.classList.remove("nok");
        input.placeholder = "TON ADRESSE MAIL";
      }, 2200);
      return;
    }
    document.getElementById("joinOk").style.display = "block";
    input.value = "";
  });

  /* ---------- header compact + barre de progression ---------- */
  const header = document.getElementById("header");
  const progress = document.getElementById("progress");
  let ticking = false;
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        header.classList.toggle("scrolled", y > 40);
        const max = document.documentElement.scrollHeight - innerHeight;
        progress.style.width = (max > 0 ? (y / max) * 100 : 0) + "%";
        ticking = false;
      });
    },
    { passive: true }
  );

  /* ---------- particules d'etincelles (hero) ---------- */
  const canvas = document.getElementById("embers");
  if (canvas && !reduced) {
    const ctx = canvas.getContext("2d");
    let W, H, running = false;
    const parts = [];
    function resize() {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    }
    resize();
    addEventListener("resize", resize);
    function makeSpark() {
      return {
        x: Math.random() * W,
        y: H + Math.random() * 60,
        r: Math.random() * 2.4 + 0.6,
        vy: Math.random() * 0.9 + 0.5,
        vx: (Math.random() - 0.5) * 0.4,
        a: Math.random() * 0.7 + 0.3,
        flick: Math.random() * Math.PI * 2,
      };
    }
    for (let i = 0; i < 70; i++) parts.push(makeSpark());
    function frame(t) {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.y -= p.vy;
        p.x += p.vx + Math.sin(t / 900 + p.flick) * 0.18;
        if (p.y < -16 || p.x < -16 || p.x > W + 16)
          Object.assign(p, makeSpark(), { y: H + 10 });
        const glow = p.a * (0.55 + 0.45 * Math.sin(t / 300 + p.flick));
        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = "rgba(61,255,28," + glow + ")";
        ctx.fillStyle = "rgba(120,255,80," + glow + ")";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      requestAnimationFrame(frame);
    }
    new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const was = running;
        running = e.isIntersecting;
        if (running && !was) requestAnimationFrame(frame);
      });
    }).observe(canvas);
    running = true;
    requestAnimationFrame(frame);
  }

  /* ---------- curseur custom : l'anneau reste TOUJOURS centre sur le pointeur ---------- */
  const cursor = document.getElementById("cursor");
  if (cursor && finePointer) {
    let cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
    addEventListener(
      "mousemove",
      (e) => {
        tx = e.clientX;
        ty = e.clientY;
      },
      { passive: true }
    );
    (function loop() {
      cx += (tx - cx) * 0.22;
      cy += (ty - cy) * 0.22;
      // on deplace l'enveloppe : le .ring interne est centre en (0,0) via translate(-50%,-50%)
      // donc la taille du cercle n'a aucune importance, il reste pile sur le curseur.
      cursor.style.transform = "translate3d(" + cx + "px," + cy + "px,0)";
      requestAnimationFrame(loop);
    })();
    document
      .querySelectorAll("a, button, .faq-q, .stat, input, .can3d-stage")
      .forEach((el) => {
        el.addEventListener("mouseenter", () => cursor.classList.add("big"));
        el.addEventListener("mouseleave", () => cursor.classList.remove("big"));
      });
  }

  /* NOTE : l'effet de tilt du hero est maintenant géré par la canette 3D
     (js/cans3d.js, attribut data-tilt="mouse"). */

  /* ---------- leger parallaxe : titres geants + canettes ---------- */
  if (!reduced) {
    const giants = document.querySelectorAll(".flavor .giant");
    const cans = document.querySelectorAll(".f-can3d");
    let ptick = false;
    addEventListener(
      "scroll",
      () => {
        if (ptick) return;
        ptick = true;
        requestAnimationFrame(() => {
          const vh = innerHeight;
          giants.forEach((g) => {
            const r = g.parentElement.getBoundingClientRect();
            if (r.bottom < 0 || r.top > vh) return;
            const p = (r.top + r.height / 2 - vh / 2) / vh;
            g.style.transform =
              "translate(-50%, calc(-50% + " + p * 60 + "px))";
          });
          cans.forEach((c) => {
            const r = c.getBoundingClientRect();
            if (r.bottom < 0 || r.top > vh) return;
            const p = (r.top + r.height / 2 - vh / 2) / vh;
            c.style.transform =
              "translateY(" + p * -30 + "px) rotate(" + p * -2 + "deg)";
          });
          ptick = false;
        });
      },
      { passive: true }
    );
  }
})();
