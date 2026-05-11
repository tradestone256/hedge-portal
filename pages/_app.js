import "../styles/globals.css";
import Head from "next/head";
import { useEffect } from "react";

export default function App({ Component, pageProps }) {
  useEffect(() => {
    const saved = localStorage.getItem("ts-theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  return (
    <>
      <Head>
        <title>Tradestone Portal</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Tradestone Investor Portal" />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('ts-theme') || 'dark';
            document.documentElement.setAttribute('data-theme', t);
          } catch(e) { document.documentElement.setAttribute('data-theme', 'dark'); }
        `}} />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
