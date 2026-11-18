# Chronicle Aurora — demo site content

This branch holds **only the demo site's data** (deployed at https://chr.eightyfor.top).
The build fetches it into demo/:

    npm run demo:fetch
    npm run build:demo

main carries the template and stays clean (data/ = schema defaults, empty posts).
The demo build always takes its **code from main** and its **content from this branch**,
so the demo cannot drift from the template.

Pushing here deploys immediately (`.github/workflows/deploy-demo.yml` calls the reusable workflow on `main`); the nightly run is only a backstop.
## Updating the demo

From the main checkout (`data/` is the template's own content; this branch holds the demo's):

    npm run demo:fetch                         # sync demo/ with this branch
    # edit demo/posts/<slug>/index.md, demo assets, demo/site.yml ...
    npm run dev:demo                           # preview at localhost:4321
    npm run demo:commit -- "docs(demo): ..."   # commit straight onto this branch
    git push origin demo                       # deploys immediately

`npm run demo:commit -- --push "..."` commits and pushes in one step.