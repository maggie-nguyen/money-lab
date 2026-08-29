/** Canonical app paths — English slugs only. */
export const ROUTES = {
  home: "/",
  food: "/food",
  foodSpot: (id: string) => `/food/spot/${id}`,
  foodAdd: "/food/add",
  library: "/library",
  libraryArticle: (slug: string) => `/library/${slug}`,
  wallet: "/wallet",
  walletMind: "/wallet/mind",
  walletBudget: "/wallet/budget",
  walletLife: "/wallet/life",
  walletChallenges: "/wallet/challenges",
  profile: "/profile",
  settings: "/settings",
  login: "/login",
  signup: "/signup",
} as const;
