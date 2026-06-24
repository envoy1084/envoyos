import type { Props } from "astro-seo";

const siteUrl = "https://envoy1084.xyz";
const homeUrl = `${siteUrl}/`;
const siteName = "Envoy1084";
const authorName = "Vedant Chainani";
const title = "Vedant Chainani";
const description =
  "Hey! I'm Vedant, a developer and technical writer based in India. I've been building in the web3 space for around three years, still in beta and learning my way through life.";
const openGraphImagePath = "/og-image.png";
const openGraphImageUrl = `${siteUrl}${openGraphImagePath}`;
const openGraphImageAlt = "Vedant Chainani portfolio preview";
const openGraphImageWidth = 2400;
const openGraphImageHeight = 1260;
const locale = "en_US";
const language = "en-US";
const twitterHandle = "@envoy1084";

export const seoBase = {
  siteUrl,
  homeUrl,
  siteName,
  authorName,
  title,
  description,
  openGraphImageUrl,
  openGraphImageAlt,
  openGraphImageWidth,
  openGraphImageHeight,
  locale,
  language,
  twitterHandle,
  sameAs: [
    "https://github.com/envoy1084",
    "https://x.com/envoy1084",
    "https://linkedin.com/in/vedant-chainani",
  ],
} as const;

export const seoData: Props = {
  title,
  charset: "utf-8",
  canonical: homeUrl,
  description,
  robotsExtras: "max-snippet:-1, max-image-preview:large, max-video-preview:-1",
  openGraph: {
    basic: {
      image: openGraphImageUrl,
      title,
      type: "website",
      url: homeUrl,
    },
    optional: {
      description,
      locale,
      siteName,
    },
    image: {
      url: openGraphImageUrl,
      secureUrl: openGraphImageUrl,
      width: openGraphImageWidth,
      height: openGraphImageHeight,
      type: "image/png",
      alt: openGraphImageAlt,
    },
  },
  twitter: {
    card: "summary_large_image",
    creator: twitterHandle,
    description,
    image: openGraphImageUrl,
    imageAlt: openGraphImageAlt,
    site: twitterHandle,
    title,
  },
  extend: {
    link: [
      { rel: "icon", href: "/logo.svg", type: "image/svg+xml" },
      { rel: "sitemap", href: "/sitemap-index.xml" },
    ],
    meta: [
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        name: "googlebot",
        content:
          "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
      },
      { name: "author", content: authorName },
      { name: "creator", content: authorName },
      { name: "publisher", content: authorName },
      { name: "application-name", content: siteName },
      { name: "theme-color", content: "#08090a" },
      { name: "color-scheme", content: "dark" },
    ],
  },
};

export const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": `${siteUrl}/#person`,
      name: authorName,
      alternateName: siteName,
      url: homeUrl,
      image: openGraphImageUrl,
      jobTitle: "Software Engineer",
      description,
      sameAs: seoBase.sameAs,
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: homeUrl,
      name: siteName,
      description: `Portfolio, projects, and writing by ${authorName}.`,
      publisher: {
        "@id": `${siteUrl}/#person`,
      },
      inLanguage: language,
    },
    {
      "@type": "ProfilePage",
      "@id": `${siteUrl}/#webpage`,
      url: homeUrl,
      name: title,
      description,
      isPartOf: {
        "@id": `${siteUrl}/#website`,
      },
      about: {
        "@id": `${siteUrl}/#person`,
      },
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: openGraphImageUrl,
        width: openGraphImageWidth,
        height: openGraphImageHeight,
      },
      inLanguage: language,
    },
  ],
};
