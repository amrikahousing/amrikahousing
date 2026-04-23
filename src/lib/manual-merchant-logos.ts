type MerchantLogoRule = {
  pattern: RegExp;
  merchantName: string;
  domain: string;
};

const LOGO_RULES: MerchantLogoRule[] = [
  { pattern: /\buber(?:\s+trip|\s+eats)?\b/i, merchantName: "Uber", domain: "uber.com" },
  { pattern: /\blyft\b/i, merchantName: "Lyft", domain: "lyft.com" },
  { pattern: /\bhome\s+depot\b/i, merchantName: "Home Depot", domain: "homedepot.com" },
  { pattern: /\blowe'?s\b/i, merchantName: "Lowe's", domain: "lowes.com" },
  { pattern: /\bwalmart\b/i, merchantName: "Walmart", domain: "walmart.com" },
  { pattern: /\btarget\b/i, merchantName: "Target", domain: "target.com" },
  { pattern: /\bcostco\b/i, merchantName: "Costco", domain: "costco.com" },
  { pattern: /\bamazon\b/i, merchantName: "Amazon", domain: "amazon.com" },
  { pattern: /\bstarbucks\b/i, merchantName: "Starbucks", domain: "starbucks.com" },
  { pattern: /\bmcdonald'?s\b/i, merchantName: "McDonald's", domain: "mcdonalds.com" },
  { pattern: /\bshell\b/i, merchantName: "Shell", domain: "shell.com" },
  { pattern: /\bchevron\b/i, merchantName: "Chevron", domain: "chevron.com" },
  { pattern: /\bexxon\b|\bmobil\b/i, merchantName: "ExxonMobil", domain: "exxonmobil.com" },
  { pattern: /\bgoogle\b/i, merchantName: "Google", domain: "google.com" },
  { pattern: /\bmicrosoft\b/i, merchantName: "Microsoft", domain: "microsoft.com" },
  { pattern: /\bapple\b/i, merchantName: "Apple", domain: "apple.com" },
  { pattern: /\bstripe\b/i, merchantName: "Stripe", domain: "stripe.com" },
  { pattern: /\bquickbooks\b|\bintuit\b/i, merchantName: "Intuit", domain: "intuit.com" },
  { pattern: /\bvercel\b/i, merchantName: "Vercel", domain: "vercel.com" },
  { pattern: /\bgithub\b/i, merchantName: "GitHub", domain: "github.com" },
];

function logoUrlForDomain(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

function websiteForDomain(domain: string) {
  return `https://${domain}`;
}

export function manualMerchantMetadata(description: string) {
  const domainMatch = description.match(/\b([a-z0-9-]+\.(?:com|net|org|io|co))\b/i);
  if (domainMatch?.[1]) {
    const domain = domainMatch[1].toLowerCase();
    return {
      merchantName: domain,
      merchantLogoUrl: logoUrlForDomain(domain),
      merchantWebsite: websiteForDomain(domain),
    };
  }

  const rule = LOGO_RULES.find((item) => item.pattern.test(description));
  if (!rule) {
    return {
      merchantName: description,
      merchantLogoUrl: null,
      merchantWebsite: null,
    };
  }

  return {
    merchantName: rule.merchantName,
    merchantLogoUrl: logoUrlForDomain(rule.domain),
    merchantWebsite: websiteForDomain(rule.domain),
  };
}
