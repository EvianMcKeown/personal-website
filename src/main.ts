import PhotoSwipeLightbox from "photoswipe/lightbox";
import "photoswipe/style.css";

// 1. PHOTOSWIPE INITIALIZATION
const lightbox = new PhotoSwipeLightbox({
  gallery: "#film-gallery",
  children: "a",
  pswpModule: () => import("photoswipe"),
});
lightbox.init();

// 2. FILM RAIL CONTROLS
function setupRail() {
  const rail = document.querySelector("#film-gallery") as HTMLElement | null;
  const prev = document.querySelector("[data-rail-prev]") as HTMLButtonElement | null;
  const next = document.querySelector("[data-rail-next]") as HTMLButtonElement | null;
  if (!rail || !prev || !next) return;

  // Scroll by whole cards so items stay aligned with their snap points.
  const step = () => {
    const item = rail.firstElementChild as HTMLElement | null;
    return item ? item.getBoundingClientRect().width : rail.clientWidth;
  };

  const syncDisabled = () => {
    const max = rail.scrollWidth - rail.clientWidth;
    prev.disabled = rail.scrollLeft <= 1;
    next.disabled = rail.scrollLeft >= max - 1;
  };

  prev.addEventListener("click", () =>
    rail.scrollBy({ left: -step(), behavior: "smooth" }),
  );
  next.addEventListener("click", () =>
    rail.scrollBy({ left: step(), behavior: "smooth" }),
  );
  rail.addEventListener("scroll", syncDisabled, { passive: true });
  window.addEventListener("resize", syncDisabled);
  syncDisabled();
}

setupRail();

// 3. SECTION TRACKING
const SITE_NAME = "Evian McKeown";

function setupSectionTracking() {
  const sections = Array.from(
    document.querySelectorAll("[data-page-title]"),
  ) as HTMLElement[];
  if (!sections.length) return;

  const navLinks = Array.from(
    document.querySelectorAll('.site-nav a[href^="#"]'),
  ) as HTMLAnchorElement[];

  const visible = new Set<HTMLElement>();

  // aria-current is both the accessible signal and the style hook for the
  // thicker underline, so there is only one source of truth for "current".
  const markCurrent = (section: HTMLElement | null) => {
    const hash = section && section.id ? `#${section.id}` : "";
    navLinks.forEach((link) => {
      if (hash && link.hash === hash) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  const apply = () => {
    for (let i = sections.length - 1; i >= 0; i--) {
      const section = sections[i];
      const name = section.dataset.pageTitle;
      if (!visible.has(section) || !name) continue;
      const next = `${name} • ${SITE_NAME}`;
      if (document.title !== next) document.title = next;
      markCurrent(section);
      return;
    }
    markCurrent(null);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const el = entry.target as HTMLElement;
        if (entry.isIntersecting) visible.add(el);
        else visible.delete(el);
      });
      apply();
    },
    { rootMargin: "0px 0px -60% 0px" },
  );

  sections.forEach((el) => observer.observe(el));
}

setupSectionTracking();
