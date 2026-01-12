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
  private overlaySprites!: PIXI.Sprite;
  private textures: PIXI.Texture[] = [];
  private currentTextureIndex: number = 0;
  private isTransitioning: boolean = false;
  private transitionElapsed: number = 0;
  private transitionDuration: number = 1000; // in milliseconds

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

    // Assets loading
    const texture_main = await PIXI.Assets.load(imageSource);
    const texture_alt = await PIXI.Assets.load(imageSource);

    // DEPRECATED — texture_main.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
    texture_main.source.mipmaps = false;
    texture_main.source.scaleMode = 'linear';
    const sprites = Array(4).fill(null).map(() => new PIXI.Sprite(texture_main));

    this.addSpritesToContainer(sprites);

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
    let o = sprites.map((h) => h.rotation);

    const targetFPS = 15;
    const msPerFrame = 1000 / targetFPS;
    let accumulator = 0;

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

        sprites[0].rotation += 0.003 * n;
        sprites[1].rotation -= 0.008 * n;

        // Sprite 2 Orbit
        sprites[2].rotation -= 0.006 * n;
        sprites[2].x = this.app.screen.width / 2 +
          (this.app.screen.width / 4) * Math.cos(sprites[2].rotation * 0.75);
        sprites[2].y = this.app.screen.height / 2 +
          (this.app.screen.width / 4) * Math.sin(sprites[2].rotation * 0.75);

        // Sprite 3 Orbit
        sprites[3].rotation += 0.004 * n;
        const orbitOffset = (this.app.screen.width / 2) * 0.1;
        sprites[3].x = this.app.screen.width / 2 + orbitOffset +
          (this.app.screen.width / 4) * Math.cos(sprites[3].rotation * 0.75);
        sprites[3].y = this.app.screen.height / 2 + orbitOffset +
          (this.app.screen.width / 4) * Math.sin(sprites[3].rotation * 0.75);

        // Keep twist center aligned on resize
        twist.offset.set(this.app.screen.width / 2, this.app.screen.height / 2);
      };
    });
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

// 3. BOOTSTRAP
window.addEventListener('load', async () => {
  const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
  if (canvas) {
    const scene = new LyricsScene();
    await scene.init(canvas, "/assets/images/12-small.webp");
  }
});