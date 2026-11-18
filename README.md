# Chronicle Aurora — demo site content

This branch holds **only the demo site's data** (deployed at https://chr.eightyfor.top).
The build fetches it into demo/:

    npm run demo:fetch
    npm run build:demo

main carries the template and stays clean (data/ = schema defaults, empty posts).
The demo build always takes its **code from main** and its **content from this branch**,
so the demo cannot drift from the template.

Pushing here deploys immediately (`.github/workflows/deploy-demo.yml` calls the reusable workflow on `main`); the nightly run is only a backstop.