# Personal Portfolio Website

Source for my [portfolio site](https://evianmckeown.github.io/personal-website/): a single static page with my projects, skills, experience and film photography.

## Tech stack

- **TypeScript** and **Vite** for the build
- **Tailwind CSS v4**, with a hand-written design system in `src/style.css`
- **PhotoSwipe** for the film gallery
- **GitHub Pages**, deployed by GitHub Actions

## Development

```bash
npm install
npm run dev      # Vite dev server
npm run build    # type-check, then build to dist/
```

## Deployment

Pushing to `master` builds the site and publishes `dist/` to the `gh-pages` branch.
