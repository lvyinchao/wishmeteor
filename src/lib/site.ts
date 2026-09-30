export const SITE = {
  name: 'WishMeteor',
  host: 'wishmeteor.net',
  url: 'https://wishmeteor.net',
  tagline: 'Make a wish. Get a real dofollow backlink.',
  description:
    'WishMeteor is an index of AI tools, models and open-source projects where founders launch a wish: submit your product link, and once it clears review it goes live with a dofollow backlink and a hand-written blessing.',
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
