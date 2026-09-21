(function () {
  "use strict";

  // ---------- audio manager ----------
  var audioMap = {};            // audioId -> src
  var keyedNodes = {};          // key -> HTMLAudioElement
  var audioUnlocked = false;
  var pendingAudio = [];
  function armAudioUnlock() {
    if (audioUnlocked) return;
    var unlock = function () {
      audioUnlocked = true;
      var q = pendingAudio.slice(); pendingAudio.length = 0;
      for (var i = 0; i < q.length; i++) { try { q[i](); } catch (e) {} }
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("touchstart", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("touchstart", unlock, true);
    window.addEventListener("keydown", unlock, true);
  }
  function playAudio(audioId, opts) {
    if (!audioId) return;
    var src = audioMap[audioId]; if (!src) return;
    opts = opts || {};
    var key = opts.key || null;
    var start = function () {
      if (key && keyedNodes[key]) { try { keyedNodes[key].pause(); } catch (e) {} }
      var node = new Audio(src);
      node.loop = !!opts.loop;
      node.volume = Math.max(0, Math.min(1, opts.volume == null ? 1 : opts.volume));
      if (key) keyedNodes[key] = node;
      var p = node.play();
      if (p && typeof p.catch === "function") {
        p.catch(function () {
          pendingAudio.push(function () { try { node.play().catch(function(){}); } catch(e){} });
          armAudioUnlock();
        });
      }
    };
    if (audioUnlocked) start();
    else { pendingAudio.push(start); armAudioUnlock(); }
  }
  function stopAudioKey(key) {
    var n = keyedNodes[key]; if (n) { try { n.pause(); } catch (e) {} delete keyedNodes[key]; }
  }


  function hexToRgba(hex, alpha) {
    var h = String(hex || "#000000").replace("#", "");
    var full = h.length === 3 ? h.split("").map(function (c) { return c + c; }).join("") : h;
    var r = parseInt(full.slice(0, 2), 16) || 0;
    var g = parseInt(full.slice(2, 4), 16) || 0;
    var b = parseInt(full.slice(4, 6), 16) || 0;
    var a = Math.max(0, Math.min(1, alpha == null ? 1 : alpha));
    return "rgba(" + r + ", " + g + ", " + b + ", " + a + ")";
  }

  function parseCustomCss(css) {
    var out = {};
    if (!css) return out;
    var cleaned = String(css).replace(/\/\*[\s\S]*?\*\//g, "");
    var parts = cleaned.split(";");
    for (var i = 0; i < parts.length; i++) {
      var idx = parts[i].indexOf(":");
      if (idx < 0) continue;
      var prop = parts[i].slice(0, idx).trim();
      var val = parts[i].slice(idx + 1).trim();
      if (!prop || !val) continue;
      if (/[<>]|expression\(|javascript:/i.test(val)) continue;
      out[prop] = val;
    }
    return out;
  }

  function applyStyle(el, styleObj) {
    for (var k in styleObj) {
      var v = styleObj[k];
      if (v == null) continue;
      el.style.setProperty(k, String(v));
    }
  }

  function applyCustomCss(el, css) {
    var obj = parseCustomCss(css);
    for (var k in obj) el.style.setProperty(k, obj[k]);
  }

  function makeBox(el, extra) {
    var node = document.createElement("div");
    node.style.position = "absolute";
    node.style.left = el.x + "px";
    node.style.top = el.y + "px";
    node.style.width = el.w + "px";
    node.style.height = el.h + "px";
    if (el.rotation) node.style.transform = "rotate(" + el.rotation + "deg)";
    node.style.userSelect = "none";
    if (extra) applyStyle(node, extra);
    return node;
  }

  function customHtmlOverlay(el) {
    if (!el.customHtml) return null;
    var d = document.createElement("div");
    d.style.position = "absolute";
    d.style.inset = "0";
    d.style.pointerEvents = "none";
    d.innerHTML = el.customHtml;
    return d;
  }

  // ---------- trigger / button activation ----------
  function fireTrigger(trigger, siblings, goTo, visited) {
    visited = visited || {};
    if (visited[trigger.id]) return;
    visited[trigger.id] = true;
    var run = function () {
      if (trigger.onFireAudioId) playAudio(trigger.onFireAudioId, { volume: trigger.audioVolume });

      if (trigger.linkedButtonId) {
        for (var i = 0; i < siblings.length; i++) {
          if (siblings[i].id === trigger.linkedButtonId && siblings[i].type === "button") {
            activateButton(siblings[i], siblings, goTo, visited);
            break;
          }
        }
      }
      if (trigger.targetSlideId) goTo(trigger.targetSlideId, trigger.animation);
    };
    if (trigger.delayMs > 0) setTimeout(run, trigger.delayMs);
    else run();
  }

  function activateButton(btn, siblings, goTo, visited) {
    visited = visited || {};
    if (visited[btn.id]) return;
    visited[btn.id] = true;
    if (btn.onClickAudioId) playAudio(btn.onClickAudioId, { volume: btn.audioVolume });

    if (btn.linkedTriggerId) {
      for (var i = 0; i < siblings.length; i++) {
        if (siblings[i].id === btn.linkedTriggerId && siblings[i].type === "trigger") {
          fireTrigger(siblings[i], siblings, goTo, visited);
          return;
        }
      }
    }
    goTo(btn.targetSlideId);
  }

  function findGlobalTrigger(elements) {
    for (var i = 0; i < elements.length; i++) {
      if (elements[i].type === "trigger" && elements[i].clickAnywhere) return elements[i];
    }
    return null;
  }

  // ---------- element renderers ----------
  function renderElement(el, siblings, preview, goTo) {
    if (el.type === "text") {
      var node = makeBox(el, {
        color: el.color,
        "font-size": el.fontSize + "px",
        "font-family": el.fontFamily ? '"' + el.fontFamily + '", Arial, sans-serif' : "",
        "font-weight": el.bold ? 700 : 400,
        "text-align": el.align || "left",
        display: "flex",
        "align-items": "center",
        "justify-content": el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start",
        padding: "4px",
        "line-height": 1.2,
        "white-space": "pre-wrap",
        "word-break": "break-word",
      });
      node.textContent = el.text;
      applyCustomCss(node, el.customCss);
      var oh = customHtmlOverlay(el); if (oh) node.appendChild(oh);
      return node;
    }
    if (el.type === "image") {
      var box = makeBox(el);
      applyCustomCss(box, el.customCss);
      var img = document.createElement("img");
      img.src = el.src; img.alt = ""; img.draggable = false;
      img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:8px;display:block;";
      box.appendChild(img);
      var oh2 = customHtmlOverlay(el); if (oh2) box.appendChild(oh2);
      return box;
    }
    if (el.type === "shape") {
      var s = makeBox(el, {
        background: el.fill,
        "border-radius": el.shape === "ellipse" ? "50%" : el.radius + "px",
      });
      applyCustomCss(s, el.customCss);
      var oh3 = customHtmlOverlay(el); if (oh3) s.appendChild(oh3);
      return s;
    }
    if (el.type === "dialogue") {
      var d = makeBox(el, {
        background: hexToRgba(el.bg, el.bgAlpha),
        "border-radius": el.radius + "px",
        border: el.borderWidth > 0 ? el.borderWidth + "px solid " + el.borderColor : "none",
        color: el.color,
        "font-size": el.fontSize + "px",
        padding: "16px",
        "line-height": 1.4,
        "white-space": "pre-wrap",
        "word-break": "break-word",
        "box-sizing": "border-box",
        "backdrop-filter": el.bgAlpha < 1 ? "blur(4px)" : "",
      });
      if (el.showName && el.name) {
        var nm = document.createElement("div");
        applyStyle(nm, {
          position: "absolute",
          top: "-14px",
          left: "16px",
          background: el.nameBg,
          color: el.nameColor,
          "font-size": Math.max(12, el.fontSize * 0.7) + "px",
          "font-weight": 600,
          padding: "4px 12px",
          "border-radius": (el.radius * 0.6) + "px",
          border: el.borderWidth > 0 ? el.borderWidth + "px solid " + el.borderColor : "none",
          "white-space": "nowrap",
        });
        nm.textContent = el.name;
        d.appendChild(nm);
      }
      var txt = document.createElement("span");
      txt.textContent = el.text;
      d.appendChild(txt);
      applyCustomCss(d, el.customCss);
      var oh4 = customHtmlOverlay(el); if (oh4) d.appendChild(oh4);
      return d;
    }
    if (el.type === "trigger") {
      var t = makeBox(el, {
        background: "transparent",
        "border-radius": "8px",
        cursor: "pointer",
        "pointer-events": el.clickAnywhere ? "none" : "auto",
      });
      applyCustomCss(t, el.customCss);
      t.addEventListener("click", function () { fireTrigger(el, siblings, goTo); });
      var oh5 = customHtmlOverlay(el); if (oh5) t.appendChild(oh5);
      return t;
    }
    if (el.type === "link") {
      var lb = document.createElement("button");
      lb.type = "button";
      applyStyle(lb, {
        position: "absolute",
        left: el.x + "px", top: el.y + "px",
        width: el.w + "px", height: el.h + "px",
        background: el.bg, color: el.color,
        "border-radius": el.radius + "px",
        border: "none",
        "font-size": Math.max(14, Math.min(el.h * 0.45, 28)) + "px",
        "font-weight": 600,
        "box-shadow": "0 4px 14px rgba(0,0,0,0.25)",
        display: "inline-flex",
        "align-items": "center",
        "justify-content": "center",
        gap: "8px",
        padding: "0 16px",
        cursor: "pointer",
      });
      var iconType = el.iconType || "default";
      var iconSize = Math.max(14, Math.min(el.h * 0.5, 32));
      var iconNode = null;
      if (iconType === "default") { iconNode = document.createElement("span"); iconNode.style.fontSize = iconSize + "px"; iconNode.textContent = "🔗"; }
      else if (iconType === "emoji" && el.iconEmoji) { iconNode = document.createElement("span"); iconNode.style.fontSize = iconSize + "px"; iconNode.textContent = el.iconEmoji; }
      else if (iconType === "image" && el.iconSrc) { iconNode = document.createElement("img"); iconNode.src = el.iconSrc; iconNode.style.cssText = "height:" + iconSize + "px;width:" + iconSize + "px;object-fit:contain;display:inline-block;"; iconNode.draggable = false; }
      if (iconNode) lb.appendChild(iconNode);
      var lbl = document.createElement("span"); lbl.textContent = el.label; lb.appendChild(lbl);
      applyCustomCss(lb, el.customCss);
      lb.addEventListener("click", function () {
        if (el.onClickAudioId) playAudio(el.onClickAudioId, { volume: el.audioVolume });
        if (el.url) window.open(el.url, "_blank", "noopener,noreferrer");
      });

      return lb;
    }
    if (el.type === "button") {
      var b = document.createElement("button");
      b.type = "button";
      applyStyle(b, {
        position: "absolute",
        left: el.x + "px", top: el.y + "px",
        width: el.w + "px", height: el.h + "px",
        background: el.bg, color: el.color,
        "border-radius": el.radius + "px",
        border: "none",
        "font-size": Math.max(14, Math.min(el.h * 0.45, 28)) + "px",
        "font-weight": 600,
        "box-shadow": "0 4px 14px rgba(0,0,0,0.25)",
        cursor: "pointer",
      });
      b.textContent = el.label;
      applyCustomCss(b, el.customCss);
      b.addEventListener("click", function () { activateButton(el, siblings, goTo); });
      return b;
    }
    return null;
  }

  // ---------- main player ----------
  function NovaPlayer(project, mountEl) {
    var self = this;
    this.project = project;
    this.mount = mountEl;
    this.scriptsById = {};
    var arr = project.scripts || [];
    for (var i = 0; i < arr.length; i++) this.scriptsById[arr[i].id] = arr[i];
    // Index audio assets for the manager
    audioMap = {};
    var au = project.audio || [];
    for (var ai = 0; ai < au.length; ai++) audioMap[au[ai].id] = au[ai].src;
    this._slideAudioKey = null;


    // Build outer scaled canvas
    this.canvasOuter = document.createElement("div");
    this.canvasOuter.className = "nova-outer";
    this.canvasInner = document.createElement("div");
    this.canvasInner.className = "nova-canvas";
    applyStyle(this.canvasInner, {
      width: project.width + "px",
      height: project.height + "px",
      position: "relative",
      "transform-origin": "center center",
      overflow: "hidden",
    });
    this.canvasOuter.appendChild(this.canvasInner);
    mountEl.appendChild(this.canvasOuter);

    this._fitScale();
    window.addEventListener("resize", function () { self._fitScale(); });

    this.currentSlideId = (project.slides[0] && project.slides[0].id) || null;
    this._rafId = null;
    this._loadingTimer = null;
    if (this.currentSlideId) this.render(this.currentSlideId, "fade");
  }

  NovaPlayer.prototype._fitScale = function () {
    var r = this.mount.getBoundingClientRect();
    var s = Math.min(r.width / this.project.width, r.height / this.project.height);
    this.canvasInner.style.transform = "scale(" + Math.max(0.1, s) + ")";
    // center
    this.canvasOuter.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;";
  };

  NovaPlayer.prototype.goTo = function (slideId, animation) {
    if (!slideId) return;
    for (var i = 0; i < this.project.slides.length; i++) {
      if (this.project.slides[i].id === slideId) {
        this.render(slideId, animation || "fade");
        return;
      }
    }
  };

  var ANIM = {
    "none": "",
    "fade": "nova-anim-fade",
    "zoom-in": "nova-anim-zoom-in",
    "zoom-out": "nova-anim-zoom-out",
    "slide-left": "nova-anim-slide-left",
    "slide-right": "nova-anim-slide-right",
    "slide-up": "nova-anim-slide-up",
    "slide-down": "nova-anim-slide-down",
  };

  NovaPlayer.prototype.render = function (slideId, animation) {
    var self = this;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._loadingTimer) { clearTimeout(this._loadingTimer); this._loadingTimer = null; }
    this._rafId = null;

    var slide = null;
    for (var i = 0; i < this.project.slides.length; i++) if (this.project.slides[i].id === slideId) slide = this.project.slides[i];
    if (!slide) return;
    this.currentSlideId = slideId;

    // Stop previous slide-enter audio, start this slide's if any
    if (this._slideAudioKey) { stopAudioKey(this._slideAudioKey); this._slideAudioKey = null; }
    if (slide.onEnterAudio && slide.onEnterAudio.audioId) {
      this._slideAudioKey = "slide:" + slide.id;
      playAudio(slide.onEnterAudio.audioId, {
        loop: !!slide.onEnterAudio.loop,
        volume: slide.onEnterAudio.volume,
        key: this._slideAudioKey,
      });
    }


    this.canvasInner.innerHTML = "";
    // Clear shorthand FIRST so it doesn't wipe background-image set below.
    this.canvasInner.style.background = "";
    this.canvasInner.style.backgroundImage = "";
    if (slide.backgroundType === "image") {
      applyStyle(this.canvasInner, {
        "background-image": "url(\"" + encodeURI(String(slide.background)) + "\")",
        "background-size": "cover",
        "background-position": "center",
        "background-repeat": "no-repeat",
        "background-color": "#000",
      });
    } else {
      this.canvasInner.style.background = slide.background;
    }

    // anim class
    this.canvasInner.classList.remove.apply(this.canvasInner.classList, Object.values(ANIM).filter(Boolean));
    var ac = ANIM[animation || "fade"];
    if (ac) {
      this.canvasInner.classList.add(ac);
      // restart animation
      void this.canvasInner.offsetWidth;
    }

    // Collect scripts attached to slide / elements
    var attachments = [];
    var ids = slide.scriptIds || [];
    for (var k = 0; k < ids.length; k++) {
      var s = this.scriptsById[ids[k]];
      if (s) attachments.push({ script: s, elementId: null });
    }
    for (var e = 0; e < slide.elements.length; e++) {
      var elx = slide.elements[e];
      var sids = elx.scriptIds || [];
      for (var m = 0; m < sids.length; m++) {
        var s2 = this.scriptsById[sids[m]];
        if (s2) attachments.push({ script: s2, elementId: elx.id });
      }
    }

    // CSS scripts → <style>
    var cssBundle = "";
    for (var ci = 0; ci < attachments.length; ci++) {
      if (attachments[ci].script.language === "css") {
        cssBundle += "/* " + attachments[ci].script.name + " */\n" + (attachments[ci].script.code || "") + "\n\n";
      }
    }
    if (cssBundle) {
      var st = document.createElement("style"); st.textContent = cssBundle; this.canvasInner.appendChild(st);
    }

    // HTML scripts → overlay divs
    for (var hi = 0; hi < attachments.length; hi++) {
      if (attachments[hi].script.language === "html") {
        var ov = document.createElement("div");
        ov.style.cssText = "position:absolute;inset:0;z-index:40;pointer-events:none;";
        ov.innerHTML = attachments[hi].script.code || "";
        this.canvasInner.appendChild(ov);
      }
    }

    // Elements
    var goTo = function (id, anim) { self.goTo(id, anim); };
    var globalTrig = findGlobalTrigger(slide.elements);
    if (globalTrig) {
      this.canvasInner.style.cursor = "pointer";
      this.canvasInner.addEventListener("click", function onBg(ev) {
        if (ev.target === self.canvasInner) fireTrigger(globalTrig, slide.elements, goTo);
      });
    } else {
      this.canvasInner.style.cursor = "";
    }

    for (var n = 0; n < slide.elements.length; n++) {
      var node = renderElement(slide.elements[n], slide.elements, true, goTo);
      if (node) this.canvasInner.appendChild(node);
    }

    // Loading slide auto-advance + progress bar
    if (slide.tag === "loading" && slide.loading && slide.loading.nextSlideId && slide.loading.durationMs > 0) {
      if (slide.loading.showProgressBar) {
        var barWrap = document.createElement("div");
        barWrap.style.cssText = "position:absolute;left:0;right:0;bottom:0;z-index:50;height:6px;background:rgba(0,0,0,0.3);pointer-events:none;";
        var bar = document.createElement("div");
        bar.style.cssText = "height:100%;width:0;background:" + (slide.loading.progressColor || "#7c5cff") + ";animation:novaLoadingBar " + slide.loading.durationMs + "ms linear forwards;";
        barWrap.appendChild(bar);
        this.canvasInner.appendChild(barWrap);
      }
      this._loadingTimer = setTimeout(function () { self.goTo(slide.loading.nextSlideId, slide.loading.animation); }, slide.loading.durationMs);
    }

    // JS scripts: start + update loop
    var jsAtt = attachments.filter(function (a) { return a.script.language === "js"; });
    if (jsAtt.length) {
      var start = performance.now();
      var prev = start;
      var sharedStates = {};
      var finishLoading = function () {
        if (slide.loading && slide.loading.nextSlideId) self.goTo(slide.loading.nextSlideId, slide.loading.animation);
      };
      var makeConsole = function (script) {
        var w = function (level) { return function () {
          var args = Array.prototype.slice.call(arguments);
          (console[level] || console.log).apply(console, ["[" + script.name + "]"].concat(args));
        }; };
        return { log: w("log"), info: w("info"), warn: w("warn"), error: w("error") };
      };
      var makeCtx = function (script, elementId, now) {
        var key = script.id + ":" + (elementId || "slide");
        var state = sharedStates[key] = sharedStates[key] || {};
        var element = null;
        if (elementId) for (var i = 0; i < slide.elements.length; i++) if (slide.elements[i].id === elementId) element = slide.elements[i];
        return {
          slide: slide, project: self.project, element: element, elementId: elementId,
          goTo: goTo, finishLoading: finishLoading, state: state,
          elapsed: (now - start) / 1000, deltaTime: (now - prev) / 1000,
          console: makeConsole(script),
        };
      };
      var compiled = [];
      for (var ji = 0; ji < jsAtt.length; ji++) {
        var sc = jsAtt[ji].script; var eid = jsAtt[ji].elementId;
        var sf = null, uf = null;
        try {
          var sb = sc.startCode != null ? sc.startCode : (sc.code || "");
          if (sb && sb.trim()) sf = new Function("ctx", sb);
        } catch (err) { console.error("[nova] compile start " + sc.name, err); }
        try {
          var ub = sc.updateCode || "";
          if (ub && ub.trim()) uf = new Function("ctx", ub);
        } catch (err) { console.error("[nova] compile update " + sc.name, err); }
        compiled.push({ script: sc, elementId: eid, startFn: sf, updateFn: uf });
      }
      for (var si = 0; si < compiled.length; si++) {
        var c = compiled[si];
        if (!c.startFn) continue;
        try { c.startFn(makeCtx(c.script, c.elementId, start)); }
        catch (err) { console.error("[nova] start error " + c.script.name, err); }
      }
      var hasUpdate = compiled.some(function (x) { return x.updateFn; });
      if (hasUpdate) {
        var tick = function (now) {
          for (var i = 0; i < compiled.length; i++) {
            if (!compiled[i].updateFn) continue;
            try { compiled[i].updateFn(makeCtx(compiled[i].script, compiled[i].elementId, now)); }
            catch (err) { console.error("[nova] update error " + compiled[i].script.name, err); }
          }
          prev = now;
          self._rafId = requestAnimationFrame(tick);
        };
        self._rafId = requestAnimationFrame(tick);
      }
    }
  };

  // ---------- bootstrap ----------
  function boot() {
    fetch("./game.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (project) {
      var mount = document.getElementById("nova-root");
      mount.innerHTML = "";
      new NovaPlayer(project, mount);
    }).catch(function (err) {
      var mount = document.getElementById("nova-root");
      mount.innerHTML = "<div style='color:#fff;font-family:sans-serif;padding:24px'>Failed to load game.json: " + (err && err.message ? err.message : err) + "</div>";
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
