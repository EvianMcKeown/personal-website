/* Based on implementation from https://www.aadishv.dev/music -
    specifically https://github.com/aadishv/html-music/blob/4ef618ea2638a0c435d23f182f7aa10e30757ef6/bundle.ts
    updated for PIXI v8 and fps control introduced. */

import * as PIXI from 'pixi.js';
import { TwistFilter, KawaseBlurFilter, AdjustmentFilter } from 'pixi-filters';
import PhotoSwipeLightbox from 'photoswipe/lightbox';

// 1. PHOTOSWIPE INITIALIZATION
const lightbox = new PhotoSwipeLightbox({
  gallery: '#film-gallery',
  children: 'a',
  pswpModule: () => import('photoswipe')
});
lightbox.init();

// 2. Background
class LyricsScene {
  private app: PIXI.Application;
  private container: PIXI.Container;

  // vars associated with sprite texture transitions
  private sprites: PIXI.Sprite[] = [];
  private overlaySprites!: PIXI.Sprite[] = [];
  private textures: PIXI.Texture[] = [];
  private currentTextureIndex: number = 0;
  private isTransitioning: boolean = false;
  private transitionElapsed: number = 0;
  private transitionDuration: number = 5000; // in milliseconds

  constructor() {
    this.app = new PIXI.Application();
    this.container = new PIXI.Container();
  }

  async init(canvas: HTMLCanvasElement, imageSource: string) {
    /**
     * PIXI V8 BREAKING CHANGE
     * use .init() and await it before accessing app.screen or app.renderer
     */
    await this.app.init({
      canvas: canvas,
      resizeTo: window,
      backgroundAlpha: 0,
      resolution: 0.25,
      autoDensity: true,
      antialias: false,
      powerPreference: 'low-power',
    });

    this.app.stage.addChild(this.container);

    /* preload textures from film gallery
    * use provided imageSource as fallback
    */
    const anchors = Array.from(document.querySelectorAll('#film-gallery a')) as HTMLAnchorElement[];
    const sources = anchors.map(a => a.href).length ? anchors.map(a => a.href) : [imageSource];
    
    const loaded = await Promise.all(sources.map(async (src) => {
      try {return await PIXI.Assets.load(src);}
      catch (err) {console.warn(`Failed to load texture: ${src}`, err); return null;}
    }));
    this.textures = loaded.filter(Boolean) as PIXI.Texture[];

    // fallback to single texture if none loaded
    if (!this.textures.length) {
      const fallbackTexture = await PIXI.Assets.load(imageSource);
      this.textures = [fallbackTexture];
    }

    const texture_main = this.textures[0];

    //texture_main.source.mipmaps = false;
    texture_main.source.scaleMode = 'linear';

    this.sprites = Array(4).fill(null).map(() => new PIXI.Sprite(texture_main));
    this.addSpritesToContainer(this.sprites);

    // Setup Filters
    const blurFilter = [new KawaseBlurFilter(), new KawaseBlurFilter(), new KawaseBlurFilter(), new KawaseBlurFilter()];
    blurFilter[0].quality = 2;
    blurFilter[0].strength = 10;
    blurFilter[1].quality = 2;
    blurFilter[1].strength = 30;
    blurFilter[2].quality = 2;
    blurFilter[2].strength = 40;
    blurFilter[3].quality = 3;
    blurFilter[3].strength = 60;

    const twist = new TwistFilter({
      angle: -3.5,
      radius: 900,
      offset: new PIXI.Point(this.app.screen.width / 2, this.app.screen.height / 2),
    });

    const contrast = new AdjustmentFilter({
      brightness: 0.9,
      contrast: 1.2,
    });

    const saturate = new AdjustmentFilter({
      saturation: 4.0,
    });

    const colorMatrix = new PIXI.ColorMatrixFilter();
    //
    //colorMatrix.alpha = 1.9;

    // Apply the filter stack
    this.container.filters = [contrast, twist, ...blurFilter, saturate, colorMatrix];
    colorMatrix.tint(0xfffcf7, true);
    colorMatrix.enabled = true;
    // Animation Loop
    let o = this.sprites.map((h) => h.rotation);

    const targetFPS = 15;
    const msPerFrame = 1000 / targetFPS;
    let accumulator = 0;

    // Animation loop
    this.app.ticker.add((ticker) => {
      // 1. Accumulate the time passed since the last tick
      accumulator += ticker.deltaMS;

      // 2. Only update if enough time has passed for our lower frame rate
      if (accumulator >= msPerFrame) {
        accumulator -= msPerFrame;

        /** * 3. MOVEMENT SPEED
         * Originally, ticker.deltaMS / 33.33 (normalized to 30fps).
         * To move LESS, we multiply this by a smaller factor (0.75).
         */
        const speedFactor = 0.75; // Movement speed multiplier
        const n = (msPerFrame / 33.333333) * speedFactor;

        this.sprites[0].rotation += 0.003 * n;
        this.sprites[1].rotation -= 0.008 * n;

        // Sprite 2 Orbit
        this.sprites[2].rotation -= 0.006 * n;
        this.sprites[2].x = this.app.screen.width / 2 +
          (this.app.screen.width / 4) * Math.cos(this.sprites[2].rotation * 0.75);
        this.sprites[2].y = this.app.screen.height / 2 +
          (this.app.screen.width / 4) * Math.sin(this.sprites[2].rotation * 0.75);

        // Sprite 3 Orbit
        this.sprites[3].rotation += 0.004 * n;
        const orbitOffset = (this.app.screen.width / 2) * 0.1;
        this.sprites[3].x = this.app.screen.width / 2 + orbitOffset +
          (this.app.screen.width / 4) * Math.cos(this.sprites[3].rotation * 0.75);
        this.sprites[3].y = this.app.screen.height / 2 + orbitOffset +
          (this.app.screen.width / 4) * Math.sin(this.sprites[3].rotation * 0.75);

        // Keep twist center aligned on resize
        twist.offset.x = this.app.screen.width / 2;
        twist.offset.y = this.app.screen.height / 2;
      };
    });

    // image crossfade
    this.app.ticker.add((ticker) => {
      if (!this.isTransitioning) return;

      this.transitionElapsed += ticker.deltaMS;
      const t = Math.min(this.transitionElapsed / this.transitionDuration, 1);
      const eased = t * t * (3 - 2 * t);
      this.overlaySprites.forEach(s => s.alpha = eased);
      this.sprites.forEach(s => s.alpha = 1 - eased);
      if (t >= 1) {
        // remove old sprites
        this.sprites.forEach(s => { 
          if (s.parent) this.container.removeChild(s);
          // don't destroy textures to allow reuse
          s.destroy({ texture: false });
        });
        this.sprites = this.overlaySprites;
        this.overlaySprites = [];
        this.isTransitioning = false;
        this.transitionElapsed = 0;
      }
    });

    // listen for scroll
    this.setupScrollBasedTextureSwap();
  }

  private setupScrollBasedTextureSwap() {
    const anchors = Array.from(document.querySelectorAll('#film-gallery a')) as HTMLAnchorElement[];
    if (!anchors.length || !this.textures.length) return;
    const chooseClosestIndex = () => {
      const viewportCenterY = window.innerHeight / 2;
      const viewportCenterX = window.innerWidth / 2;
      let closestIndex = 0;
      let closestYDistance = Infinity;
      let closestXDistance = Infinity;
      const EPS = 1; // small epsilon tolerance
      anchors.forEach((a, idx) => {
        const rect = a.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const midX = rect.left + rect.width / 2;
        const dY = Math.abs(midY - viewportCenterY)
        const dX = Math.abs(midX - viewportCenterX);
        if (dY < closestYDistance - EPS) { 
          closestYDistance = dY;
          closestXDistance = dX;
          closestIndex = idx; 
        } else if (Math.abs(dY - closestYDistance) <= EPS && dX < closestXDistance) {
          // choose closer in X
          closestXDistance = dX;
          closestIndex = idx;
        }
      });
      return closestIndex;
    };
    let pending = -1;
    const onscroll = () => {
      const idx = chooseClosestIndex();
      if (idx !== this.currentTextureIndex && idx !== pending) {
        pending = idx;
        this.startTextureTransitionTo(idx);
      }
    };
    // othrottle scroll position check to every 100ms
    window.addEventListener('scroll', throttle(onscroll, 100));
    // initial check
    onscroll();
  }

  private startTextureTransitionTo(index: number) {
    if (this.isTransitioning || !this.textures[index]) return;
    this.isTransitioning = true;
    this.transitionElapsed = 0;
    this.currentTextureIndex = index;

    // create overlay sprites
    this.overlaySprites = this.sprites.map(s => {
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
    this.overlaySprites.forEach(s => this.container.addChild(s));
  }

  private addSpritesToContainer(sprites: PIXI.Sprite[]) {
    const [t, s, i, r] = sprites;
    const { width, height } = this.app.screen;

    sprites.forEach(sprite => sprite.anchor.set(0.5, 0.5));
    sprites.forEach(sprite => sprite.roundPixels = true);

    // Exact positions from your source
    t.position.set(width / 2, height / 2);
    s.position.set(width / 2.5, height / 2.5);
    i.position.set(width / 2, height / 2);
    r.position.set(width / 2, height / 2);

    // Exact scales from your source
    t.width = width * 1.25; t.height = t.width;
    s.width = width * 0.8; s.height = s.width;
    i.width = width * 0.5; i.height = i.width;
    r.width = width * 0.25; r.height = r.width;

    this.container.addChild(t, s, i, r);
  }
}

function throttle(fn: (...args: any[]) => void, wait: number) {
  let last = 0;
  return (...args: any[]) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now; fn(...args);
    };
  }
}

// 3. BOOTSTRAP
window.addEventListener('load', async () => {
  const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
  if (canvas) {
    const scene = new LyricsScene();
    await scene.init(canvas, "/assets/images/12-small.webp");
  }
});