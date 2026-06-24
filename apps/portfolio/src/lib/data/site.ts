import EnvoyLogo from "@/assets/images/envoy1084.png";
import MorphImage1 from "@/assets/images/morph1.png?url";
import MorphImage2 from "@/assets/images/morph2.png?url";
import MorphImage3 from "@/assets/images/morph3.png?url";

const morphSources = [MorphImage1, MorphImage2, MorphImage3];

export const siteData = {
  logo: EnvoyLogo,
  name: "Vedant Chainani",
  titles: ["Software Engineer", "Technical Writer"],
  description:
    "I'm a developer and writer. I work at Namespace on a mission to name a billion ethereum addresses. I've been coding for 3 years, still in beta learning my way through life.",
  morphSources,
  links: {
    github: {
      url: "https://github.com/envoy1084",
      alt: "GitHub",
      icon: "github",
    },
    telegram: {
      url: "https://t.me/envoy1084",
      alt: "Telegram",
      icon: "telegram",
    },
    mail: { value: "vedant@envoy1084.xyz", alt: "Mail", icon: "mail" },
    linkedin: {
      url: "https://linkedin.com/in/vedant-chainani",
      alt: "GitHub",
      icon: "linkedin",
    },
    x: {
      url: "https://x.com/envoy1084",
      alt: "X (Twitter)",
      icon: "x-twitter",
    },
    ethereum: {
      url: "https://etherscan.io/name-lookup-search?id=envoy1084.eth",
      alt: "X (Twitter)",
      icon: "ethereum",
    },
  },
};
