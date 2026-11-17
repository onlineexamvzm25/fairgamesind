/* CRDG SETS responsive stage controller — follows the existing CRDG Rummy mobile model. */
(function () {
  "use strict";
  const DESIGN_WIDTH = 1280;
  const DESIGN_HEIGHT = 720;
  let resizeTimer = null;

  function stage() { return document.getElementById("gameStage"); }
  function isMobileLayout() {
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const landscape = window.matchMedia && window.matchMedia("(orientation: landscape)").matches;
    return window.innerWidth <= 900 || (coarse && landscape);
  }

  function applyLayout() {
    const el = stage();
    if (!el) return;
    const mobile = isMobileLayout();
    if (!mobile) {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      el.style.position = "relative";
      el.style.left = "";
      el.style.top = "";
      el.style.width = "";
      el.style.height = "";
      el.style.minHeight = "";
      el.style.transform = "none";
      el.style.transformOrigin = "";
      return;
    }

    const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    if (!vw || !vh) return;
    const designWidth = Math.max(DESIGN_WIDTH, DESIGN_HEIGHT * (vw / vh));
    const scale = vh / DESIGN_HEIGHT;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    el.style.position = "fixed";
    el.style.left = "50%";
    el.style.top = "50%";
    el.style.width = designWidth + "px";
    el.style.height = DESIGN_HEIGHT + "px";
    el.style.minHeight = DESIGN_HEIGHT + "px";
    el.style.transformOrigin = "center center";
    el.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  function schedule() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyLayout, 100);
  }
  window.addEventListener("load", applyLayout);
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", () => setTimeout(applyLayout, 350));
  if (window.visualViewport) window.visualViewport.addEventListener("resize", schedule);
  applyLayout();
  window.refreshSetsLayout = applyLayout;
})();
