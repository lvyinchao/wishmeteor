export const SITE = {
  name: 'WishMeteor',
  host: 'wishmeteor.net',
  url: 'https://wishmeteor.net',
  tagline: 'A little starlight for the things you are building.',
  description:
    'WishMeteor is a wishing and blessing platform for people building AI products. Share what you are making, receive a personal blessing, and light stars for launches you want to see shine.',
  sender: 'WishMeteor <support@wishmeteor.net>',
  email: 'support@wishmeteor.net',
  /** Public promise on /submit: hard caps that keep the link pool editorial. */
  dailyLaunchCap: 9,
  perRoundCap: 3,
  /** Outbound dofollow links rendered on a single listing page. */
  maxDofollowPerPage: 24,
  /** A link that has not been reachable for this long loses dofollow. */
  staleAfterDays: 120,
  minDescriptionChars: 300,
} as const;
