/* Based on implementation from https://www.aadishv.dev/music -
    specifically https://github.com/aadishv/html-music/blob/4ef618ea2638a0c435d23f182f7aa10e30757ef6/bundle.ts
    updated for PIXI v8 and fps control */

import * as PIXI from "pixi.js";
import { TwistFilter, KawaseBlurFilter, AdjustmentFilter } from "pixi-filters";
import PhotoSwipeLightbox from "photoswipe/lightbox";
import "photoswipe/style.css";

// 1. PHOTOSWIPE INITIALIZATION
const lightbox = new PhotoSwipeLightbox({
  gallery: "#film-gallery",
  children: "a",
  pswpModule: () => import("photoswipe"),
});
lightbox.init();

// 2. Background
const TARGET_FPS = 15;
const TWIST_ANGLE = -3.5;
const TWIST_RADIUS_RATIO = 0.5625;

class LyricsScene {
  private app: PIXI.Application;
  private backgroundLayer: PIXI.Container;

  // vars associated with sprite texture transitions
  private sprites: PIXI.Sprite[] = [];
  private overlaySprites: PIXI.Sprite[] = [];
  private textures: PIXI.Texture[] = [];
  private currentTextureIndex: number = 0;
  private isTransitioning: boolean = false;
  private transitionElapsed: number = 0;
  private transitionDuration: number = 5000; // in milliseconds
  private renderResolution: number = 0.2;
  private filterPadding: number = 0;
  private twist: TwistFilter | null = null;
  private filterStack: PIXI.Filter[] = [];

  // Transition Queue
  private pendingTextureIndex: number | null = null;

  private reduceMotion: boolean = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  constructor() {
    this.app = new PIXI.Application();
    this.backgroundLayer = new PIXI.Container();
  }

  async init(canvas: HTMLCanvasElement, imageSource: string) {
    /**
     * PIXI V8 BREAKING CHANGE
     * use .init() and await before accessing app.screen or app.renderer
     */
    await this.app.init({
      canvas: canvas,
      resizeTo: canvas,
      backgroundAlpha: 1,
      backgroundColor: 0x000000,
      resolution: 1,
      autoDensity: false,
      antialias: false,
      powerPreference: "low-power",
      preference: "webgl",
    });

    this.app.ticker.maxFPS = TARGET_FPS;

    this.app.stage.addChild(this.backgroundLayer);

    const throttledResize = throttle(() => {
      this.onResize();
    }, 100);

    this.app.renderer.on('resize', throttledResize);
    this.onResize();

    /* preload textures from film gallery
     * use provided imageSource as fallback
     */
    const anchors = Array.from(
      document.querySelectorAll("#film-gallery a"),
    ) as HTMLAnchorElement[];
    const rawsources = anchors.map((a) => a.href).length
      ? anchors.map((a) => a.href)
      : [imageSource];

    const sources = rawsources.map((url) => {
      // regex
      return url.replace(/(\.[\w\d]+)$/, "-small$1");
    });

    this.textures = new Array(sources.length);

    const loadInto = async (index: number) => {
      try {
        const texture: PIXI.Texture = await PIXI.Assets.load(sources[index]);
        texture.source.scaleMode = "linear";
        texture.source.addressMode = "clamp-to-edge";
        this.textures[index] = texture;
        return texture;
      } catch (err) {
        console.warn(`Failed to load texture: ${sources[index]}`, err);
        return null;
      }
    };

    const firstIndex = this.scrollIndex(sources.length);
    let picked = await loadInto(firstIndex);

    for (let i = 0; i < sources.length && !picked; i++) {
      if (i !== firstIndex) picked = await loadInto(i);
    }
    let usedFallback = false;
    if (!picked) {
      const fallback: PIXI.Texture = await PIXI.Assets.load(imageSource);
      this.textures = [fallback];
      picked = fallback;
      usedFallback = true;
    }
    const texture_main: PIXI.Texture = picked;
    this.currentTextureIndex = this.textures.indexOf(texture_main);

    if (!usedFallback) {
      sources.forEach((_, i) => {
        if (!this.textures[i]) void loadInto(i);
      });
    }

    this.sprites = Array(4)
      .fill(null)
      .map(() => new PIXI.Sprite(texture_main));
    this.addSpritesToContainer(this.sprites);

    // Setup Filters
    const blurFilter = [
      new KawaseBlurFilter({ clamp: true }),
      new KawaseBlurFilter({ clamp: true }),
      new KawaseBlurFilter({ clamp: true }),
    ];
    blurFilter[0].quality = 2;
    blurFilter[0].strength = 10;
    blurFilter[0].resolution = this.renderResolution;
    blurFilter[1].quality = 2;
    blurFilter[1].strength = 30;
    blurFilter[1].resolution = this.renderResolution;
    blurFilter[2].quality = 3;
    blurFilter[2].strength = 60;
    blurFilter[2].resolution = this.renderResolution;


    const twist = new TwistFilter({
      angle: TWIST_ANGLE,
      radius: this.app.screen.width * TWIST_RADIUS_RATIO,
      offset: new PIXI.Point(
        this.app.screen.width / 2,
        this.app.screen.height / 2,
      ),
    });
    twist.resolution = this.renderResolution;
    twist.antialias = "off";
    this.twist = twist;

    const adjust = new AdjustmentFilter({
      saturation: 2.8,
      contrast: 1.7,
      brightness: 0.7,
      red: 1,
      green: 252 / 255,
      blue: 247 / 255,
    });
    adjust.resolution = this.renderResolution;

    // Apply the filter stack
    this.filterStack = [adjust, twist, ...blurFilter];
    this.backgroundLayer.filters = this.filterStack;
    this.backgroundLayer.filterArea = this.app.screen;

    this.onResize();

    this.app.ticker.add((ticker) => {
      const speedFactor = 0.75; // Movement speed multiplier
      const n = (ticker.deltaMS / 33.333333) * speedFactor;

      // handle normal + overlay sprites
      const allSprites = [...this.sprites, ...this.overlaySprites];

      if (allSprites.length >= 4) {
        // Rotation
        allSprites.forEach((sprite, i) => {
          if (i % 4 == 0) sprite.rotation += 0.003 * n;
          if (i % 4 == 1) sprite.rotation += 0.008 * n;
          if (i % 4 == 2) sprite.rotation += 0.006 * n;
          if (i % 4 == 3) sprite.rotation += 0.004 * n;
        });

        // Orbit
        const updateOrbit = (sprite: PIXI.Sprite, i: number) => {
          const rad = this.app.screen.width / 4;
          const cenX = this.app.screen.width / 2;
          const cenY = this.app.screen.height / 2;

          if (i % 4 == 2) {
            sprite.x = cenX + rad * Math.cos(sprite.rotation * 0.75);
            sprite.y = cenY + rad * Math.cos(sprite.rotation * 0.75);
          } else if (i % 4 == 3) {
            const offset = (this.app.screen.width / 2) * 0.1;
            sprite.x = cenX + offset + rad * Math.cos(sprite.rotation * 0.75);
            sprite.y = cenY + offset + rad * Math.cos(sprite.rotation * 0.75);
          }
        };

        allSprites.forEach((sprite, i) => updateOrbit(sprite, i));
      }
    });

    // image crossfade
    this.app.ticker.add((ticker) => {
      if (!this.isTransitioning) return;

      this.transitionElapsed += ticker.deltaMS;
      const t = Math.min(this.transitionElapsed / this.transitionDuration, 1);
      //const eased = t * t * (3 - 2 * t);
      const eased = t > 0.5 ? 4 * Math.pow((t - 1), 3) + 1 : 4 * Math.pow(t, 3); // cubic in-out
      //const eased = t  //linear 
      this.overlaySprites.forEach((s) => (s.alpha = eased));
      this.sprites.forEach((s) => (s.alpha = 1 - eased));
      if (t >= 1) {
        // remove old sprites
        this.sprites.forEach((s) => {
          if (s.parent) this.backgroundLayer.removeChild(s);
          // don't destroy textures to allow reuse
          s.destroy({ texture: false });
        });
        this.sprites = this.overlaySprites;
        this.overlaySprites = [];
        this.isTransitioning = false;
        this.transitionElapsed = 0;

        // if transition is queud, start it
        if (this.pendingTextureIndex !== null) {
          const nextIndex = this.pendingTextureIndex;
          this.pendingTextureIndex = null;
          this._startTransition(nextIndex);
        }
      }
    });

    // listen for scroll
    this.setupScrollBasedTextureSwap();

    if (this.reduceMotion) {
      this.app.render();
      this.app.ticker.stop();
    }
  }

  public renderOnce() {
    this.app.render();
  }

  private scrollIndex(count: number) {
    const docElm = document.documentElement;
    const range = docElm.scrollHeight - docElm.clientHeight;
    const pos =
      range > 0 ? (document.body.scrollTop || docElm.scrollTop) / range : 0;
    return Math.min(Math.round(pos * count), count - 1);
  }

  private setupScrollBasedTextureSwap() {
    const anchors = Array.from(
      document.querySelectorAll("#film-gallery a"),
    ) as HTMLAnchorElement[];
    if (!anchors.length || !this.textures.length) return;

    const onscroll = () => {
      const idx = this.scrollIndex(anchors.length);

      // if we're already at/transitioning to this index, cancel any pending
      if (idx === this.currentTextureIndex) {
        this.pendingTextureIndex = null;
        return;
      }

      if (idx !== this.pendingTextureIndex) {
        this.startTextureTransitionTo(idx);
      }
    };

    if (!this.reduceMotion) {
      // throttle scroll position check to every 100ms
      window.addEventListener("scroll", throttle(onscroll, 100));
    }
  }

  private startTextureTransitionTo(index: number) {
    if (!this.isTransitioning) {
      this._startTransition(index);
    } else {
      // queue new index
      this.pendingTextureIndex = index;
    }
  }

  private _startTransition(index: number) {
    if (!this.textures[index]) return;

    this.transitionDuration = 3000;
    this.isTransitioning = true;
    this.transitionElapsed = 0;
    this.currentTextureIndex = index;

    // create overlay sprites with new texture
    this.overlaySprites = this.sprites.map((s) => {
      const ns = new PIXI.Sprite(this.textures[index]);
      ns.anchor.set(s.anchor.x, s.anchor.y);
      ns.position.set(s.position.x, s.position.y);
      ns.rotation = s.rotation;
      ns.width = s.width;
      ns.height = s.height;
      ns.roundPixels = s.roundPixels;
      ns.alpha = 0;
      return ns;
    });

    // add overlay above existing sprites
    this.overlaySprites.forEach((s) => this.backgroundLayer.addChild(s));
  }

  private layoutSprites(sprites: PIXI.Sprite[]) {
    if (sprites.length < 4) return;

    const [t, s, i, r] = sprites;
    const { width, height } = this.app.screen;

    const pad = this.filterPadding * 2;
    const cover = Math.hypot(width + pad, height + pad) * 1.05;

    t.position.set(width / 2, height / 2);
    s.position.set(width / 2.5, height / 2.5);
    i.position.set(width / 2, height / 2);
    r.position.set(width / 2, height / 2);

    t.width = cover;
    t.height = t.width;
    s.width = width * 0.8;
    s.height = s.width;
    i.width = width * 0.5;
    i.height = i.width;
    r.width = width * 0.25;
    r.height = r.width;
  }

  private addSpritesToContainer(sprites: PIXI.Sprite[]) {
    const [t, s, i, r] = sprites;

    sprites.forEach((sprite) => sprite.anchor.set(0.5, 0.5));
    sprites.forEach((sprite) => (sprite.roundPixels = true));

    this.layoutSprites(sprites);

    this.backgroundLayer.addChild(t, s, i, r);
  }

  private twistPadding(radius: number) {
    const { width, height } = this.app.screen;
    const hw = width / 2;
    const hh = height / 2;
    const angle = Math.abs(TWIST_ANGLE);
    const steps = 256;
    let needed = 0;

    for (let k = 1; k <= steps; k++) {
      const d = (radius * k) / steps;
      const theta = Math.pow((radius - d) / radius, 2) * angle;

      const lo = Math.acos(Math.min(1, hw / d));
      const hi = Math.asin(Math.min(1, hh / d));
      if (lo > hi) continue; // this ring exists only outside the box

      const from = Math.min(lo + theta, hi + theta);
      const to = Math.max(lo + theta, hi + theta);

      const candidates = [from, to];
      for (let m = -2; m <= 3; m++) {
        const p = (m * Math.PI) / 2;
        if (p >= from && p <= to) candidates.push(p);
      }
      for (const c of candidates) {
        needed = Math.max(needed, d * Math.abs(Math.sin(c)) - hh);
        needed = Math.max(needed, d * Math.abs(Math.cos(c)) - hw);
      }
    }
    return Math.ceil(needed) + 2;
  }

  private updateFilterGeometry() {
    if (!this.twist) return;

    const { width, height } = this.app.screen;
    const radius = width * TWIST_RADIUS_RATIO;

    this.twist.offset.x = width / 2;
    this.twist.offset.y = height / 2;
    this.twist.radius = radius;
    this.twist.padding = this.twistPadding(radius);

    this.filterPadding = this.filterStack.reduce((n, f) => n + f.padding, 0);
  }

  private onResize() {
    this.updateFilterGeometry();
    this.layoutSprites(this.sprites);
    if (this.overlaySprites.length > 0) {
      this.layoutSprites(this.overlaySprites);
    }
  }
}

function throttle(fn: (...args: any[]) => void, wait: number) {
  let last = 0;
  return (...args: any[]) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
    }
  };
}

// 3. BOOTSTRAP
window.addEventListener("load", async () => {
  const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
  if (canvas) {
    const scene = new LyricsScene();
    await scene.init(canvas, "/assets/images/12-small.webp");
    scene.renderOnce();
    requestAnimationFrame(() =>
      canvas.classList.add("is-ready"));
  }
});

