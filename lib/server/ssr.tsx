import * as React from "react";
import * as express from "express";
import { renderToStringWithData } from '@apollo/client/react/ssr';
import {
  ApolloClient, InMemoryCache,
  NormalizedCacheObject, ApolloProvider, createHttpLink, gql
} from "@apollo/client";
import { StaticRouter } from "react-router";
import { App } from "./../src/components/App";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import { getSubTitle } from "../src/components/subTitles";
import fetch from "cross-fetch";
import { JSDOM } from "jsdom";
import { DEFAULT_PAGE_TITLE } from '../src/constants';

/**
 * Server-side rendering (SSR) setup used in staging/production.
 *
 * The same React <App> that runs in the browser is rendered to an HTML string
 * on the server, with all Apollo GraphQL queries resolved up front. This gives
 * fast first paints and crawler-friendly markup. The serialized Apollo cache is
 * injected into the page so the client can "hydrate" without re-fetching.
 */
export function setupSSR(app: express.Application, clientPath: string, localPort: number) {
  // Apollo/React libs expect a DOM `window` global; provide a minimal one via jsdom.
  (global as any).window = new JSDOM("").window;

  // Render the home page.
  app.use("^/$", (req, res, next) => {
    render(req, res, clientPath, localPort);
  });

  // Serve the built static assets (JS/CSS/images) with long-lived caching.
  app.use(express.static(path.resolve(clientPath), { maxAge: "30d" }));

  // Fall back to SSR for every other route so client-side routes render correctly.
  app.use("*", (req, res, next) => {
    render(req, res, clientPath, localPort);
  });
}

function render(req: express.Request, res: express.Response, clientPath: string, localPort: number) {
  const cache = new InMemoryCache();

  const subTitle = getSubTitle();
  // A dedicated server-side Apollo client that talks to our own /graphql endpoint.
  // We forward the incoming Cookie header so authenticated SSR requests act as the
  // logged-in user.
  const client = new ApolloClient({
    ssrMode: true,
    link: createHttpLink({
      uri: `http://localhost:${localPort}/graphql`,
      credentials: "same-origin",
      headers: {
        cookie: req.header("Cookie")
      },
      fetch: fetch
    }),
    cache: cache
  });

  // Seed the local-only `subTitle` field so the rendered markup matches the client.
  client.writeQuery({
    query: gql`
      query GetsubTitle {
        subTitle
      }
    `,
    data: {
      subTitle: subTitle
    }
  });

  const context = {};
  // On the server we render inside a <StaticRouter> driven by the request URL;
  // the client-side App instead uses <BrowserRouter> (see src/index.tsx).
  const WrappedApp = (
    <ApolloProvider client={client}>
      <StaticRouter location={req.originalUrl} context={context}>
        <App subTitle={subTitle} />
      </StaticRouter>
    </ApolloProvider>
  );
  // renderToStringWithData walks the tree, executes all Apollo queries, then
  // renders final HTML once their data is available.
  renderToStringWithData(WrappedApp).then(content => {
    const initialState = client.extract();
    getHtml(content, initialState, clientPath, (html: string) => {
      // Note sure if this really does anything //res.setHeader('Cache-Control', 'public, max-age=1800');
      res.status(200);
      res.send(html);
      res.end();
    });
  });
}

/**
 * Injects the rendered React markup and serialized Apollo state into the CRA
 * index.html template, and overrides the <title> for idiom pages so shared
 * links and search results show the idiom name.
 */
function getHtml(content: string, state: NormalizedCacheObject, clientPath: string, callback: (arg: string) => void) {

  let titleOverride: string = DEFAULT_PAGE_TITLE;
  // If this render resolved exactly one `idiom(...)` query, use that idiom's
  // title as the page title (e.g. "Break a leg - Idiomatically").
  const idiomKeys = Object.keys(state.ROOT_QUERY).filter(x => x.indexOf("idiom(") == 0);
  if (idiomKeys && idiomKeys.length == 1) {
    const idiomInstanceId = (state.ROOT_QUERY[idiomKeys[0]] as any).id;
    const idiomInstance = state[idiomInstanceId];
    if (idiomInstance) {
      titleOverride = (idiomInstance.title as string) + " - " + titleOverride;
    }
  }


  // point to the html file created by CRA's build tool
  const filePath = path.resolve(clientPath, "index.html");

  fs.readFile(filePath, "utf8", (err, htmlData) => {
    if (err) {
      throw err;
    }
    htmlData = htmlData.replace(/<title>.*?<\/title>/i, `<title>${titleOverride}</title>`);
    // Inject the SSR markup into #root and stash the Apollo cache on
    // window.__APOLLO_STATE__ so the client can hydrate from it without refetching.
    // `<` is escaped to prevent breaking out of the <script> tag (XSS safety).
    const htmlToInject = (
      <>
        <script>window = </script>
        <div id="root" dangerouslySetInnerHTML={{ __html: content }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__APOLLO_STATE__=${JSON.stringify(state).replace(/</g, "\\u003c")};`
          }}
        />
      </>
    );

    const result = htmlData.replace('<div id="root"></div>', renderToStaticMarkup(htmlToInject));

    callback(result);
  });
}
